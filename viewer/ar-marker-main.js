import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";

(function () {
  /**
   * モデル配置設定（このオブジェクトだけを編集すれば向き・倍率を調整できる）
   *
   * 単位・倍率メモ（STEP4-B）:
   * - glTF の距離単位はメートル (m)
   * - MindAR Image Tracking は認識画像の横幅を AR 座標上の「1」とする
   * - markerPhysicalWidthMm > 0 のとき:
   *     markerWidthMeters = markerPhysicalWidthMm / 1000
   *     baseScale = 1 / markerWidthMeters = 1000 / markerPhysicalWidthMm
   *     finalScale = baseScale * scaleCorrection
   * - markerPhysicalWidthMm === 0 のときは原寸未設定（scaleCorrection のみ）
   * - 倍率は geometry に焼き込まず Object3D.scale で適用する
   *
   * 座標系メモ（STEP4-A 実機確認済み）:
   * - MindAR アンカー原点 = 認識画像の中心
   * - マーカー面の法線方向 = Z（立方体を z = size/2 に置いて底面が面に接する）
   * - bottom-center は回転・倍率後の bbox で minZ→0、XY中心→マーカー中心
   */
  var MODEL_CONFIG = {
    src: "/models/demo.glb",
    visibleMode: "model", // "model" | "cube"
    markerPhysicalWidthMm: 0,
    scaleCorrection: 1.0,
    position: { x: 0, y: 0, z: 0 },
    // STEP4-A で正常表示できている初期向きを維持（勝手に 0 へ戻さない）
    rotationDegrees: { x: 90, y: 0, z: 0 },
    alignmentMode: "bottom-center", // "bottom-center" | "preserve-origin"
    expectedSizeMm: { x: 0, y: 0, z: 0 },
  };

  var DEFAULT_CONFIG = JSON.parse(JSON.stringify(MODEL_CONFIG));
  var SETTINGS_STORAGE_KEY = "miru-ar-model-settings-v1";

  var containerEl = document.getElementById("ar-container");
  var statusEl = document.getElementById("status-text");
  var debugEl = document.getElementById("debug-text");
  var startBtn = document.getElementById("start-btn");
  var stopBtn = document.getElementById("stop-btn");
  var overlayEl = document.getElementById("message-overlay");
  var debugPanelEl = document.getElementById("debug-panel");
  var scaleModeBadgeEl = document.getElementById("scale-mode-badge");
  var scaleCorrFlagEl = document.getElementById("scale-corr-flag");
  var settingsMsgEl = document.getElementById("settings-msg");
  var axesLabelEl = document.getElementById("axes-label");

  var modeSelect = document.getElementById("mode-select");
  var alignSelect = document.getElementById("align-select");
  var axesToggle = document.getElementById("axes-toggle");
  var applyConfigBtn = document.getElementById("apply-config-btn");
  var saveConfigBtn = document.getElementById("save-config-btn");
  var resetConfigBtn = document.getElementById("reset-config-btn");

  var markerWidthInput = document.getElementById("marker-width-input");
  var scaleCorrInput = document.getElementById("scale-corr-input");
  var posXInput = document.getElementById("pos-x-input");
  var posYInput = document.getElementById("pos-y-input");
  var posZInput = document.getElementById("pos-z-input");
  var rotXInput = document.getElementById("rot-x-input");
  var rotYInput = document.getElementById("rot-y-input");
  var rotZInput = document.getElementById("rot-z-input");
  var expXInput = document.getElementById("exp-x-input");
  var expYInput = document.getElementById("exp-y-input");
  var expZInput = document.getElementById("exp-z-input");

  var TARGET_SRC = "/ar/targets.mind";
  var CUBE_SIZE = 0.4;
  var DEBUG_QUERY =
    typeof location !== "undefined" &&
    /(?:\?|&)debug=1(?:&|$)/.test(location.search);

  var mindarThree = null;
  var anchor = null;
  var contentRoot = null;
  var modelRoot = null;
  var modelScene = null;
  var cube = null;
  var axesHelper = null;
  var ambientLight = null;
  var directionalLight = null;

  var starting = false;
  var running = false;
  var targetFound = false;
  var disposedPage = false;

  var modelLoadState = "idle"; // idle | loading | ready | error
  var modelLoadProgress = 0;
  var modelLoadError = null;
  var modelLoadPromise = null;
  var rawModelTemplate = null;
  var rawBoundingBox = null;
  var rotatedBoundingBox = null;
  var transformedBoundingBox = null;
  var appliedScale = 1;
  var lastBaseScale = 1;
  var lastMarkerWidthMeters = 0;

  function cloneConfig(src) {
    return JSON.parse(JSON.stringify(src));
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /**
   * 将来 Supabase 等へ差し替えやすいよう、設定の読込/保存をここに集約する。
   * 保存対象: markerPhysicalWidthMm, scaleCorrection, position,
   * rotationDegrees, expectedSizeMm, alignmentMode
   */
  function loadModelSettings() {
    try {
      if (typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (error) {
      console.warn("loadModelSettings failed:", error);
      return null;
    }
  }

  function saveModelSettings(config) {
    try {
      if (typeof localStorage === "undefined") {
        return { ok: false, message: "localStorage を利用できません" };
      }
      var payload = {
        markerPhysicalWidthMm: num(config.markerPhysicalWidthMm, 0),
        scaleCorrection: num(config.scaleCorrection, 1),
        position: {
          x: num(config.position.x, 0),
          y: num(config.position.y, 0),
          z: num(config.position.z, 0),
        },
        rotationDegrees: {
          x: num(config.rotationDegrees.x, 0),
          y: num(config.rotationDegrees.y, 0),
          z: num(config.rotationDegrees.z, 0),
        },
        expectedSizeMm: {
          x: num(config.expectedSizeMm.x, 0),
          y: num(config.expectedSizeMm.y, 0),
          z: num(config.expectedSizeMm.z, 0),
        },
        alignmentMode:
          config.alignmentMode === "preserve-origin"
            ? "preserve-origin"
            : "bottom-center",
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
      return { ok: true, message: "設定を保存しました（localStorage）" };
    } catch (error) {
      console.warn("saveModelSettings failed:", error);
      return {
        ok: false,
        message: "設定の保存に失敗しました: " + (error && error.message),
      };
    }
  }

  function applyLoadedSettings(saved) {
    if (!saved) return;
    if (saved.markerPhysicalWidthMm != null) {
      MODEL_CONFIG.markerPhysicalWidthMm = num(saved.markerPhysicalWidthMm, 0);
    }
    if (saved.scaleCorrection != null) {
      MODEL_CONFIG.scaleCorrection = num(saved.scaleCorrection, 1);
    }
    if (saved.position) {
      MODEL_CONFIG.position = {
        x: num(saved.position.x, 0),
        y: num(saved.position.y, 0),
        z: num(saved.position.z, 0),
      };
    }
    if (saved.rotationDegrees) {
      MODEL_CONFIG.rotationDegrees = {
        x: num(saved.rotationDegrees.x, DEFAULT_CONFIG.rotationDegrees.x),
        y: num(saved.rotationDegrees.y, DEFAULT_CONFIG.rotationDegrees.y),
        z: num(saved.rotationDegrees.z, DEFAULT_CONFIG.rotationDegrees.z),
      };
    }
    if (saved.expectedSizeMm) {
      MODEL_CONFIG.expectedSizeMm = {
        x: num(saved.expectedSizeMm.x, 0),
        y: num(saved.expectedSizeMm.y, 0),
        z: num(saved.expectedSizeMm.z, 0),
      };
    }
    if (saved.alignmentMode === "preserve-origin" || saved.alignmentMode === "bottom-center") {
      MODEL_CONFIG.alignmentMode = saved.alignmentMode;
    }
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "status status-error" : "status";
  }

  function setOverlayVisible(visible) {
    if (!overlayEl) return;
    overlayEl.style.display = visible ? "flex" : "none";
  }

  /**
   * AR実行中は全面暗幕をやめ、カメラ映像の上にコンパクトな状態表示だけにする。
   * 停止中（idle）のみ背景を暗くして操作しやすくする。
   */
  function setOverlayMode(mode) {
    if (!overlayEl) return;
    overlayEl.classList.remove("is-idle", "is-ar-running");
    if (mode === "idle") {
      overlayEl.classList.add("is-idle");
    } else if (mode === "ar") {
      overlayEl.classList.add("is-ar-running");
    }
  }

  /** カメラ映像が canvas の不透明クリアで隠れないようにする */
  function ensureCameraVisibleThroughCanvas() {
    if (!mindarThree || !mindarThree.renderer) return;
    try {
      mindarThree.renderer.setClearColor(0x000000, 0);
      mindarThree.renderer.setClearAlpha(0);
    } catch (e) {}
    if (mindarThree.scene) {
      mindarThree.scene.background = null;
    }
    if (mindarThree.renderer.domElement) {
      mindarThree.renderer.domElement.style.background = "transparent";
      mindarThree.renderer.domElement.style.zIndex = "1";
    }
    if (containerEl) {
      var videos = containerEl.querySelectorAll("video");
      for (var i = 0; i < videos.length; i++) {
        videos[i].style.zIndex = "0";
        videos[i].style.background = "transparent";
      }
    }
  }

  function setSettingsMsg(message) {
    if (settingsMsgEl) settingsMsgEl.textContent = message || "";
  }

  function formatVec3(v) {
    if (!v) return "-";
    return (
      "(" +
      Number(v.x).toFixed(4) +
      ", " +
      Number(v.y).toFixed(4) +
      ", " +
      Number(v.z).toFixed(4) +
      ")"
    );
  }

  function formatSizeMAndMm(size) {
    if (!size) return "-";
    return (
      "X=" +
      Number(size.x).toFixed(4) +
      "m (" +
      (Number(size.x) * 1000).toFixed(1) +
      "mm), Y=" +
      Number(size.y).toFixed(4) +
      "m (" +
      (Number(size.y) * 1000).toFixed(1) +
      "mm), Z=" +
      Number(size.z).toFixed(4) +
      "m (" +
      (Number(size.z) * 1000).toFixed(1) +
      "mm)"
    );
  }

  function computeScaleInfo() {
    var correction = num(MODEL_CONFIG.scaleCorrection, 1);
    if (correction <= 0) correction = 1;
    var widthMm = num(MODEL_CONFIG.markerPhysicalWidthMm, 0);
    if (widthMm > 0) {
      var markerWidthMeters = widthMm / 1000;
      var baseScale = 1 / markerWidthMeters;
      return {
        widthMm: widthMm,
        markerWidthMeters: markerWidthMeters,
        baseScale: baseScale,
        scaleCorrection: correction,
        finalScale: baseScale * correction,
        lifeSizeConfigured: true,
      };
    }
    return {
      widthMm: 0,
      markerWidthMeters: 0,
      baseScale: 1,
      scaleCorrection: correction,
      finalScale: correction,
      lifeSizeConfigured: false,
    };
  }

  function computeFinalScale() {
    var info = computeScaleInfo();
    lastBaseScale = info.baseScale;
    lastMarkerWidthMeters = info.markerWidthMeters;
    return info.finalScale;
  }

  function compareAxisMm(glbMm, expectedMm) {
    if (!expectedMm || expectedMm <= 0) {
      return { text: "（比較なし）", label: "-" };
    }
    var diffMm = glbMm - expectedMm;
    var percent = (diffMm / expectedMm) * 100;
    var abs = Math.abs(percent);
    var label = "警告";
    if (abs <= 1) label = "一致";
    else if (abs <= 3) label = "要確認";
    return {
      text:
        "差 " +
        diffMm.toFixed(1) +
        "mm (" +
        (percent >= 0 ? "+" : "") +
        percent.toFixed(2) +
        "%) → " +
        label,
      label: label,
    };
  }

  function getRecognitionLabel() {
    if (!running) return "停止";
    if (targetFound) return "認識中";
    return "検索中/見失い";
  }

  function updateScaleModeBadge() {
    var info = computeScaleInfo();
    if (!scaleModeBadgeEl) return;
    if (info.lifeSizeConfigured) {
      scaleModeBadgeEl.textContent = "原寸表示";
      scaleModeBadgeEl.className = "badge badge-ok";
    } else {
      scaleModeBadgeEl.textContent = "原寸未設定";
      scaleModeBadgeEl.className = "badge badge-warn";
    }
    if (scaleCorrFlagEl) {
      if (Math.abs(info.scaleCorrection - 1) > 0.000001) {
        scaleCorrFlagEl.textContent = "補正あり";
        scaleCorrFlagEl.className = "badge badge-warn";
      } else {
        scaleCorrFlagEl.textContent = "補正なし";
        scaleCorrFlagEl.className = "badge";
      }
    }
  }

  function updateDebug(extra) {
    updateScaleModeBadge();
    if (!debugEl || !DEBUG_QUERY) return;

    var info = computeScaleInfo();
    var renderInfo =
      mindarThree && mindarThree.renderer ? mindarThree.renderer.info : null;
    var rawSize = rawBoundingBox
      ? rawBoundingBox.getSize(new THREE.Vector3())
      : null;
    var rotatedSize = rotatedBoundingBox
      ? rotatedBoundingBox.getSize(new THREE.Vector3())
      : null;
    var finalSize = transformedBoundingBox
      ? transformedBoundingBox.getSize(new THREE.Vector3())
      : null;

    var lines = [
      "【モデル】",
      "file: " + MODEL_CONFIG.src,
      "modelLoadState: " +
        modelLoadState +
        (modelLoadState === "loading" ? " (" + modelLoadProgress + "%)" : ""),
      "visibleMode: " + MODEL_CONFIG.visibleMode,
      "",
      "【GLB元寸法】（読み込み直後・回転/倍率前・GLB軸）",
      "rawBBox min: " + (rawBoundingBox ? formatVec3(rawBoundingBox.min) : "-"),
      "rawBBox max: " + (rawBoundingBox ? formatVec3(rawBoundingBox.max) : "-"),
      "raw size: " + formatSizeMAndMm(rawSize),
      "",
      "【原寸計算】",
      info.lifeSizeConfigured
        ? "状態: 原寸表示"
        : "状態: 原寸未設定（マーカー実幅を設定してください）",
      "markerPhysicalWidthMm: " + info.widthMm,
      "markerWidthMeters: " + Number(info.markerWidthMeters).toFixed(6),
      "baseScale: " + Number(info.baseScale).toFixed(6),
      "scaleCorrection: " +
        Number(info.scaleCorrection).toFixed(6) +
        (Math.abs(info.scaleCorrection - 1) > 0.000001 ? " （補正あり）" : ""),
      "finalScale: " + Number(info.finalScale).toFixed(6),
      "appliedScale: " + Number(appliedScale).toFixed(6),
      "",
      "【変換後】",
      "rotatedBBox（rotation+scale後・alignment前） min: " +
        (rotatedBoundingBox ? formatVec3(rotatedBoundingBox.min) : "-"),
      "rotatedBBox max: " +
        (rotatedBoundingBox ? formatVec3(rotatedBoundingBox.max) : "-"),
      "rotated size: " + formatSizeMAndMm(rotatedSize),
      "finalBBox（alignment+position後） min: " +
        (transformedBoundingBox ? formatVec3(transformedBoundingBox.min) : "-"),
      "finalBBox max: " +
        (transformedBoundingBox ? formatVec3(transformedBoundingBox.max) : "-"),
      "final size (AR座標): " + formatSizeMAndMm(finalSize),
      "",
      "【CAD比較】※GLB出力確認用。AR精度保証ではない",
      "expectedSizeMm: " + JSON.stringify(MODEL_CONFIG.expectedSizeMm),
    ];

    if (rawSize) {
      lines.push(
        "比較基準A: GLB元寸法(mm) vs expected",
        "  X: " +
          (rawSize.x * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rawSize.x * 1000, MODEL_CONFIG.expectedSizeMm.x).text,
        "  Y: " +
          (rawSize.y * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rawSize.y * 1000, MODEL_CONFIG.expectedSizeMm.y).text,
        "  Z: " +
          (rawSize.z * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rawSize.z * 1000, MODEL_CONFIG.expectedSizeMm.z).text,
      );
    }
    if (rotatedSize) {
      lines.push(
        "比較基準B: 回転+倍率後寸法(mm, マーカー軸) vs expected",
        "  X: " +
          (rotatedSize.x * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rotatedSize.x * 1000, MODEL_CONFIG.expectedSizeMm.x)
            .text,
        "  Y: " +
          (rotatedSize.y * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rotatedSize.y * 1000, MODEL_CONFIG.expectedSizeMm.y)
            .text,
        "  Z: " +
          (rotatedSize.z * 1000).toFixed(1) +
          "mm → " +
          compareAxisMm(rotatedSize.z * 1000, MODEL_CONFIG.expectedSizeMm.z)
            .text,
      );
    }

    lines.push(
      "",
      "【配置】",
      "alignmentMode: " + MODEL_CONFIG.alignmentMode,
      "position: " + JSON.stringify(MODEL_CONFIG.position),
      "rotationDegrees: " + JSON.stringify(MODEL_CONFIG.rotationDegrees),
      "markerNormalAxis: Z（STEP4-A確認済み）",
      "",
      "【AR】",
      "recognition: " + getRecognitionLabel(),
      "isSecureContext: " + String(window.isSecureContext),
      "running: " + String(running),
      "targetFound: " + String(targetFound),
    );

    if (renderInfo && renderInfo.memory) {
      lines.push(
        "renderer.geometries: " +
          renderInfo.memory.geometries +
          ", textures: " +
          renderInfo.memory.textures,
      );
    }
    if (renderInfo && renderInfo.render) {
      lines.push(
        "renderer.calls: " +
          renderInfo.render.calls +
          ", triangles: " +
          renderInfo.render.triangles,
      );
    }
    if (modelLoadError) lines.push("modelError: " + modelLoadError);
    if (extra) {
      if (extra.name) lines.push("errorName: " + extra.name);
      if (extra.message) lines.push("errorMessage: " + extra.message);
    }
    debugEl.textContent = lines.join("\n");
  }

  function refreshStatusForModel() {
    if (disposedPage) return;
    updateScaleModeBadge();
    if (running) {
      if (targetFound) setStatus("マーカー認識中", false);
      else setStatus("マーカー検索中… / マーカーを映してください", false);
      return;
    }
    if (modelLoadState === "loading") {
      setStatus("モデルを読み込み中… " + modelLoadProgress + "%", false);
    } else if (modelLoadState === "ready") {
      setStatus("モデル準備完了：ARを開始できます", false);
    } else if (modelLoadState === "error") {
      setStatus("モデル読み込みエラー: " + (modelLoadError || ""), true);
    } else {
      setStatus("モデルを準備中…", false);
    }
  }

  function clearContainer() {
    if (!containerEl) return;
    while (containerEl.firstChild) {
      containerEl.removeChild(containerEl.firstChild);
    }
  }

  function stopMediaTracksInContainer() {
    if (!containerEl) return;
    var videos = containerEl.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      var stream = videos[i].srcObject;
      if (stream && stream.getTracks) {
        var tracks = stream.getTracks();
        for (var t = 0; t < tracks.length; t++) {
          tracks[t].stop();
        }
      }
      videos[i].srcObject = null;
    }
  }

  function disposeMaterial(material) {
    if (!material) return;
    var keys = Object.keys(material);
    for (var i = 0; i < keys.length; i++) {
      var value = material[keys[i]];
      if (value && value.isTexture && typeof value.dispose === "function") {
        value.dispose();
      }
    }
    if (typeof material.dispose === "function") {
      material.dispose();
    }
  }

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse(function (object) {
      if (object.geometry && typeof object.geometry.dispose === "function") {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          for (var i = 0; i < object.material.length; i++) {
            disposeMaterial(object.material[i]);
          }
        } else {
          disposeMaterial(object.material);
        }
      }
    });
  }

  function syncDebugControls() {
    if (!DEBUG_QUERY) return;
    if (modeSelect) modeSelect.value = MODEL_CONFIG.visibleMode;
    if (alignSelect) alignSelect.value = MODEL_CONFIG.alignmentMode;
    if (markerWidthInput) {
      markerWidthInput.value = String(MODEL_CONFIG.markerPhysicalWidthMm);
    }
    if (scaleCorrInput) {
      scaleCorrInput.value = String(MODEL_CONFIG.scaleCorrection);
    }
    if (posXInput) posXInput.value = String(MODEL_CONFIG.position.x);
    if (posYInput) posYInput.value = String(MODEL_CONFIG.position.y);
    if (posZInput) posZInput.value = String(MODEL_CONFIG.position.z);
    if (rotXInput) rotXInput.value = String(MODEL_CONFIG.rotationDegrees.x);
    if (rotYInput) rotYInput.value = String(MODEL_CONFIG.rotationDegrees.y);
    if (rotZInput) rotZInput.value = String(MODEL_CONFIG.rotationDegrees.z);
    if (expXInput) expXInput.value = String(MODEL_CONFIG.expectedSizeMm.x);
    if (expYInput) expYInput.value = String(MODEL_CONFIG.expectedSizeMm.y);
    if (expZInput) expZInput.value = String(MODEL_CONFIG.expectedSizeMm.z);
    updateScaleModeBadge();
  }

  function readDebugControlsIntoConfig() {
    if (!DEBUG_QUERY) return;
    if (modeSelect) MODEL_CONFIG.visibleMode = modeSelect.value;
    if (alignSelect) {
      MODEL_CONFIG.alignmentMode =
        alignSelect.value === "preserve-origin"
          ? "preserve-origin"
          : "bottom-center";
    }
    if (markerWidthInput) {
      MODEL_CONFIG.markerPhysicalWidthMm = Math.max(
        0,
        num(markerWidthInput.value, 0),
      );
    }
    if (scaleCorrInput) {
      var sc = num(scaleCorrInput.value, 1);
      MODEL_CONFIG.scaleCorrection = sc > 0 ? sc : 1;
    }
    MODEL_CONFIG.position = {
      x: num(posXInput && posXInput.value, 0),
      y: num(posYInput && posYInput.value, 0),
      z: num(posZInput && posZInput.value, 0),
    };
    MODEL_CONFIG.rotationDegrees = {
      x: num(rotXInput && rotXInput.value, DEFAULT_CONFIG.rotationDegrees.x),
      y: num(rotYInput && rotYInput.value, 0),
      z: num(rotZInput && rotZInput.value, 0),
    };
    MODEL_CONFIG.expectedSizeMm = {
      x: Math.max(0, num(expXInput && expXInput.value, 0)),
      y: Math.max(0, num(expYInput && expYInput.value, 0)),
      z: Math.max(0, num(expZInput && expZInput.value, 0)),
    };
  }

  /**
   * object の AABB を parent ローカル座標で返す。
   * マーカー追従中もワールド姿勢の影響を受けないようにする。
   */
  function getBoxInParentSpace(object, parent) {
    object.updateWorldMatrix(true, true);
    parent.updateWorldMatrix(true, true);
    var worldBox = new THREE.Box3().setFromObject(object);
    var invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    return worldBox.clone().applyMatrix4(invParent);
  }

  /**
   * 処理順:
   * 1) rotation 2) finalScale 3) matrix更新 4) bbox再計算
   * 5) 底面合わせ(Z=法線) 6) XY中心合わせ 7) position手動補正
   */
  function applyTransformToModel() {
    if (!modelRoot || !modelScene || !contentRoot) return;

    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.scale.set(1, 1, 1);
    modelScene.position.set(0, 0, 0);
    modelScene.rotation.set(0, 0, 0);
    modelScene.scale.set(1, 1, 1);
    modelRoot.updateMatrixWorld(true);

    // GLB元寸法（回転・倍率前）
    rawBoundingBox = getBoxInParentSpace(modelScene, contentRoot);

    appliedScale = computeFinalScale();
    modelRoot.rotation.set(
      THREE.MathUtils.degToRad(num(MODEL_CONFIG.rotationDegrees.x, 0)),
      THREE.MathUtils.degToRad(num(MODEL_CONFIG.rotationDegrees.y, 0)),
      THREE.MathUtils.degToRad(num(MODEL_CONFIG.rotationDegrees.z, 0)),
    );
    modelRoot.scale.set(appliedScale, appliedScale, appliedScale);
    modelRoot.updateMatrixWorld(true);

    // 回転+倍率後（alignment前）
    rotatedBoundingBox = getBoxInParentSpace(modelScene, contentRoot);

    var alignX = 0;
    var alignY = 0;
    var alignZ = 0;

    if (MODEL_CONFIG.alignmentMode === "bottom-center") {
      // マーカー面法線 = Z（STEP4-A確認済み）
      var box = rotatedBoundingBox;
      var center = box.getCenter(new THREE.Vector3());
      alignX = -center.x;
      alignY = -center.y;
      alignZ = -box.min.z;
    }

    modelRoot.position.set(
      alignX + num(MODEL_CONFIG.position.x, 0),
      alignY + num(MODEL_CONFIG.position.y, 0),
      alignZ + num(MODEL_CONFIG.position.z, 0),
    );
    modelRoot.updateMatrixWorld(true);
    transformedBoundingBox = getBoxInParentSpace(modelScene, contentRoot);
  }

  function applyVisibility() {
    var showModel = MODEL_CONFIG.visibleMode === "model";
    if (modelRoot) modelRoot.visible = showModel && modelLoadState === "ready";
    if (cube) cube.visible = !showModel;
  }

  function ensureContentHierarchy() {
    if (!anchor) return;

    if (!contentRoot) {
      contentRoot = new THREE.Group();
      contentRoot.name = "ar-content-root";
      anchor.group.add(contentRoot);
    }

    if (!cube) {
      var geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
      var material = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.1,
        roughness: 0.45,
      });
      cube = new THREE.Mesh(geometry, material);
      // デバッグ立方体: 下端がマーカー面(z=0)に接する → 法線は Z
      cube.position.set(0, 0, CUBE_SIZE / 2);
      contentRoot.add(cube);
    }

    if (!axesHelper) {
      axesHelper = new THREE.AxesHelper(0.6);
      axesHelper.visible = !!(axesToggle && axesToggle.checked);
      contentRoot.add(axesHelper);
    }

    if (modelLoadState === "ready" && rawModelTemplate && !modelRoot) {
      modelRoot = new THREE.Group();
      modelRoot.name = "ar-model-root";
      modelScene = rawModelTemplate.clone(true);
      modelRoot.add(modelScene);
      contentRoot.add(modelRoot);
      applyTransformToModel();
    }

    applyVisibility();
  }

  function loadModel() {
    if (disposedPage) return Promise.resolve();
    if (modelLoadState === "ready" && rawModelTemplate) {
      return Promise.resolve(rawModelTemplate);
    }
    if (modelLoadPromise) return modelLoadPromise;

    modelLoadState = "loading";
    modelLoadProgress = 0;
    modelLoadError = null;
    refreshStatusForModel();
    updateDebug(null);

    modelLoadPromise = new Promise(function (resolve, reject) {
      var loader = new GLTFLoader();
      loader.load(
        MODEL_CONFIG.src,
        function (gltf) {
          if (disposedPage) {
            disposeObject3D(gltf.scene);
            reject(new Error("page disposed"));
            return;
          }
          rawModelTemplate = gltf.scene;
          rawModelTemplate.name = "demo-glb-template";
          rawBoundingBox = new THREE.Box3().setFromObject(rawModelTemplate);
          modelLoadState = "ready";
          modelLoadProgress = 100;
          modelLoadError = null;
          modelLoadPromise = null;
          refreshStatusForModel();
          if (running) {
            ensureContentHierarchy();
          }
          updateDebug(null);
          resolve(rawModelTemplate);
        },
        function (event) {
          if (disposedPage) return;
          if (event && event.lengthComputable && event.total > 0) {
            modelLoadProgress = Math.min(
              99,
              Math.round((event.loaded / event.total) * 100),
            );
          }
          refreshStatusForModel();
          updateDebug(null);
        },
        function (error) {
          if (disposedPage) {
            reject(error);
            return;
          }
          modelLoadState = "error";
          modelLoadPromise = null;
          modelLoadError =
            (error && error.message ? error.message : String(error)) +
            " /models/demo.glb を public/models/ に配置してください。";
          refreshStatusForModel();
          updateDebug({
            name: error && error.name ? error.name : "LoadError",
            message: modelLoadError,
          });
          reject(error);
        },
      );
    });

    return modelLoadPromise;
  }

  function stopAR() {
    starting = false;
    running = false;
    targetFound = false;

    if (mindarThree) {
      try {
        if (mindarThree.renderer) {
          mindarThree.renderer.setAnimationLoop(null);
        }
        if (typeof mindarThree.stop === "function") {
          mindarThree.stop();
        }
      } catch (error) {
        console.warn("MindAR stop error:", error);
      }
    }

    stopMediaTracksInContainer();

    if (contentRoot) {
      disposeObject3D(contentRoot);
      if (anchor && anchor.group) {
        try {
          anchor.group.remove(contentRoot);
        } catch (e) {}
      }
    }

    if (mindarThree && mindarThree.scene) {
      if (ambientLight) mindarThree.scene.remove(ambientLight);
      if (directionalLight) mindarThree.scene.remove(directionalLight);
    }
    if (ambientLight && ambientLight.dispose) ambientLight.dispose();
    if (directionalLight && directionalLight.dispose) {
      directionalLight.dispose();
    }

    if (mindarThree && mindarThree.renderer) {
      try {
        mindarThree.renderer.dispose();
      } catch (e) {}
    }

    mindarThree = null;
    anchor = null;
    contentRoot = null;
    modelRoot = null;
    modelScene = null;
    cube = null;
    axesHelper = null;
    ambientLight = null;
    directionalLight = null;
    rotatedBoundingBox = null;
    transformedBoundingBox = null;

    clearContainer();

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setOverlayMode("idle");
    refreshStatusForModel();
    if (modelLoadState === "ready" && !running) {
      setStatus("停止済み：ARを開始できます", false);
    }
    updateDebug(null);
  }

  function checkTargetsFile() {
    return fetch(TARGET_SRC, { method: "GET", cache: "no-store" }).then(
      function (response) {
        if (!response.ok) {
          throw new Error(
            "targets.mind が見つかりません（HTTP " +
              response.status +
              "）。public/ar/targets.mind を配置してください。",
          );
        }
        return response.arrayBuffer().then(function (buffer) {
          if (!buffer || buffer.byteLength < 16) {
            throw new Error(
              "targets.mind が空または不正です。MindAR コンパイラで再生成してください。",
            );
          }
          return true;
        });
      },
    );
  }

  function createLightsAndAnchor() {
    ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.95);
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2, 3, 4);
    mindarThree.scene.add(ambientLight);
    mindarThree.scene.add(directionalLight);

    anchor = mindarThree.addAnchor(0);
    ensureContentHierarchy();

    anchor.onTargetFound = function () {
      targetFound = true;
      // 認識中はUIを隠してカメラ映像＋ARモデルだけ見せる（実物との原寸比較用）
      setOverlayVisible(false);
      setStatus("マーカー認識中（カメラ映像と比較できます）", false);
      updateDebug(null);
    };
    anchor.onTargetLost = function () {
      targetFound = false;
      setOverlayVisible(true);
      setOverlayMode("ar");
      setStatus("マーカーを映してください", false);
      updateDebug(null);
    };
  }

  function startAR() {
    if (disposedPage || starting || running) return;

    if (!window.isSecureContext) {
      setStatus(
        "HTTPSが必要です。Netlify の https URL で開いてください。",
        true,
      );
      updateDebug({
        name: "InsecureContext",
        message: "window.isSecureContext === false",
      });
      return;
    }

    if (!containerEl) {
      setStatus("ARコンテナが見つかりません。", true);
      return;
    }

    starting = true;
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setOverlayMode("ar");
    setStatus("初期化中…", false);
    updateDebug(null);

    stopMediaTracksInContainer();
    clearContainer();

    var prepareModel =
      MODEL_CONFIG.visibleMode === "model"
        ? loadModel().catch(function (error) {
            throw new Error(
              "GLBを読めないため AR を開始できません: " +
                (error && error.message ? error.message : String(error)),
            );
          })
        : Promise.resolve();

    prepareModel
      .then(function () {
        return checkTargetsFile();
      })
      .then(function () {
        if (!starting || disposedPage) return null;
        setStatus("カメラ起動中…", false);
        mindarThree = new MindARThree({
          container: containerEl,
          imageTargetSrc: TARGET_SRC,
          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        var videos = containerEl.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          videos[i].setAttribute("playsinline", "");
          videos[i].setAttribute("webkit-playsinline", "");
          videos[i].muted = true;
          videos[i].playsInline = true;
        }

        createLightsAndAnchor();
        return mindarThree.start();
      })
      .then(function () {
        if (!starting || disposedPage) {
          stopAR();
          return;
        }

        var videos = containerEl.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          videos[i].setAttribute("playsinline", "");
          videos[i].setAttribute("webkit-playsinline", "");
          videos[i].muted = true;
          videos[i].playsInline = true;
        }

        ensureCameraVisibleThroughCanvas();

        running = true;
        starting = false;
        targetFound = false;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        setOverlayVisible(true);
        setOverlayMode("ar");
        setStatus("マーカー検索中…（カメラ映像が見えます）", false);
        updateDebug(null);

        mindarThree.renderer.setAnimationLoop(function () {
          // 毎フレーム透過クリアを維持（黒でカメラを覆わない）
          mindarThree.renderer.setClearColor(0x000000, 0);
          mindarThree.renderer.render(mindarThree.scene, mindarThree.camera);
        });
      })
      .catch(function (error) {
        starting = false;
        running = false;
        console.error(error);
        try {
          stopAR();
        } catch (e) {}
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        setOverlayVisible(true);
        setStatus(
          "エラー: " + (error && error.message ? error.message : String(error)),
          true,
        );
        updateDebug({
          name: error && error.name ? error.name : "Error",
          message: error && error.message ? error.message : String(error),
        });
      });
  }

  function reapplyLiveSettings() {
    updateScaleModeBadge();
    if (!running) {
      updateDebug(null);
      return;
    }
    if (MODEL_CONFIG.visibleMode === "model" && modelLoadState !== "ready") {
      loadModel()
        .then(function () {
          ensureContentHierarchy();
          applyTransformToModel();
          applyVisibility();
          updateDebug(null);
        })
        .catch(function () {
          updateDebug(null);
        });
      return;
    }
    ensureContentHierarchy();
    if (modelRoot) applyTransformToModel();
    applyVisibility();
    updateDebug(null);
  }

  function onApplyConfig() {
    readDebugControlsIntoConfig();
    syncDebugControls();
    reapplyLiveSettings();
    setSettingsMsg("設定を適用しました（未保存）");
  }

  function onSaveConfig() {
    readDebugControlsIntoConfig();
    var result = saveModelSettings(MODEL_CONFIG);
    syncDebugControls();
    reapplyLiveSettings();
    setSettingsMsg(result.message);
  }

  function onResetConfig() {
    var restored = cloneConfig(DEFAULT_CONFIG);
    MODEL_CONFIG.visibleMode = restored.visibleMode;
    MODEL_CONFIG.markerPhysicalWidthMm = restored.markerPhysicalWidthMm;
    MODEL_CONFIG.scaleCorrection = restored.scaleCorrection;
    MODEL_CONFIG.position = restored.position;
    MODEL_CONFIG.rotationDegrees = restored.rotationDegrees;
    MODEL_CONFIG.alignmentMode = restored.alignmentMode;
    MODEL_CONFIG.expectedSizeMm = restored.expectedSizeMm;
    syncDebugControls();
    reapplyLiveSettings();
    setSettingsMsg("初期値へリセットしました（保存はしていません）");
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden" && (running || starting)) {
      stopAR();
    }
  }

  // --- UI events ---
  if (startBtn) {
    startBtn.addEventListener("click", function () {
      startAR();
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      stopAR();
    });
  }
  if (axesToggle) {
    axesToggle.addEventListener("change", function () {
      if (axesHelper) {
        axesHelper.visible = !!axesToggle.checked;
      }
    });
  }
  if (applyConfigBtn) {
    applyConfigBtn.addEventListener("click", onApplyConfig);
  }
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener("click", onSaveConfig);
  }
  if (resetConfigBtn) {
    resetConfigBtn.addEventListener("click", onResetConfig);
  }

  if (DEBUG_QUERY && debugPanelEl) {
    debugPanelEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) return;

      var posAxis = target.getAttribute("data-pos");
      var posDelta = target.getAttribute("data-delta");
      if (posAxis && posDelta != null) {
        readDebugControlsIntoConfig();
        MODEL_CONFIG.position[posAxis] =
          num(MODEL_CONFIG.position[posAxis], 0) + num(posDelta, 0);
        syncDebugControls();
        reapplyLiveSettings();
        setSettingsMsg("位置を調整しました（適用済み・未保存）");
        return;
      }

      var rotAxis = target.getAttribute("data-rot");
      var rotValue = target.getAttribute("data-value");
      if (rotAxis && rotValue != null) {
        readDebugControlsIntoConfig();
        MODEL_CONFIG.rotationDegrees[rotAxis] = num(rotValue, 0);
        syncDebugControls();
        reapplyLiveSettings();
        setSettingsMsg("回転を調整しました（適用済み・未保存）");
        return;
      }

      var scaleDelta = target.getAttribute("data-scale-delta");
      if (scaleDelta != null) {
        readDebugControlsIntoConfig();
        MODEL_CONFIG.scaleCorrection =
          num(MODEL_CONFIG.scaleCorrection, 1) + num(scaleDelta, 0);
        if (MODEL_CONFIG.scaleCorrection <= 0) {
          MODEL_CONFIG.scaleCorrection = 0.001;
        }
        syncDebugControls();
        reapplyLiveSettings();
        setSettingsMsg("倍率補正を調整しました（適用済み・未保存）");
      }
    });
  }

  // ピンチ等によるページ拡大を抑制（モデル操作は実装しない）
  document.addEventListener(
    "gesturestart",
    function (e) {
      e.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener("pagehide", function () {
    disposedPage = true;
    stopAR();
    if (rawModelTemplate) {
      disposeObject3D(rawModelTemplate);
      rawModelTemplate = null;
    }
  });
  window.addEventListener("beforeunload", function () {
    disposedPage = true;
    stopAR();
  });
  document.addEventListener("visibilitychange", onVisibilityChange);

  // 初期化: 保存設定の読込 → UI同期
  applyLoadedSettings(loadModelSettings());

  if (stopBtn) stopBtn.disabled = true;
  if (debugPanelEl) {
    debugPanelEl.style.display = DEBUG_QUERY ? "block" : "none";
    if (DEBUG_QUERY) {
      debugPanelEl.classList.add("panel-debug");
    }
  }
  if (axesLabelEl) {
    axesLabelEl.style.display = DEBUG_QUERY ? "inline-flex" : "none";
  }
  setOverlayMode("idle");
  syncDebugControls();
  updateScaleModeBadge();

  if (!window.isSecureContext) {
    setStatus(
      "HTTPSが必要です。現在の接続はセキュアではありません。",
      true,
    );
    updateDebug({
      name: "InsecureContext",
      message: "window.isSecureContext === false",
    });
  } else {
    setStatus("モデルを準備中…", false);
    updateDebug(null);
    loadModel().catch(function () {
      // エラー表示は loadModel 内で実施
    });
  }
})();

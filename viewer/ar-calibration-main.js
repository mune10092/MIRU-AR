import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";

(function () {
  /**
   * STEP5: 100mm 原寸校正ページ
   * - 実測定具用 /ar-marker.html とは設定・localStorage を分離
   * - 座標系・原寸計算は STEP4-B と同じ（マーカー法線=Z、rotation X=90、bottom-center）
   */
  var TARGET_MM = 100;
  var MODEL_SRC = "/models/calibration-100mm.glb";
  var TARGET_SRC = "/ar/targets.mind";
  var TOOL_SETTINGS_KEY = "miru-ar-model-settings-v1"; // 読み取り専用（書込禁止）
  var CALIBRATION_SETTINGS_KEY = "miru-ar-calibration-settings";

  var CALIBRATION_CONFIG = {
    src: MODEL_SRC,
    markerPhysicalWidthMm: 0,
    scaleCorrection: 1.0,
    position: { x: 0, y: 0, z: 0 },
    rotationDegrees: { x: 90, y: 0, z: 0 },
    alignmentMode: "bottom-center",
    expectedSizeMm: { x: TARGET_MM, y: TARGET_MM, z: TARGET_MM },
    observedMm: { m1: "", m2: "", m3: "" },
    deviceName: "",
    notes: "",
  };

  var DEFAULT_CONFIG = JSON.parse(JSON.stringify(CALIBRATION_CONFIG));

  var containerEl = document.getElementById("ar-container");
  var statusEl = document.getElementById("status-text");
  var overlayEl = document.getElementById("message-overlay");
  var debugPanelEl = document.getElementById("debug-panel");
  var debugEl = document.getElementById("debug-text");
  var scaleModeBadgeEl = document.getElementById("scale-mode-badge");
  var glbSizeEl = document.getElementById("glb-size-text");
  var measureResultEl = document.getElementById("measure-result-text");
  var settingsMsgEl = document.getElementById("settings-msg");

  var startBtn = document.getElementById("start-btn");
  var stopBtn = document.getElementById("stop-btn");
  var applyConfigBtn = document.getElementById("apply-config-btn");
  var saveConfigBtn = document.getElementById("save-config-btn");
  var resetConfigBtn = document.getElementById("reset-config-btn");
  var resetTheoryBtn = document.getElementById("reset-theory-btn");
  var applySuggestedBtn = document.getElementById("apply-suggested-btn");

  var markerWidthInput = document.getElementById("marker-width-input");
  var scaleCorrInput = document.getElementById("scale-corr-input");
  var obs1Input = document.getElementById("obs1-input");
  var obs2Input = document.getElementById("obs2-input");
  var obs3Input = document.getElementById("obs3-input");
  var deviceInput = document.getElementById("device-input");
  var notesInput = document.getElementById("notes-input");
  var zoomButtons = document.querySelectorAll("[data-zoom]");

  var DEBUG_QUERY =
    typeof location !== "undefined" &&
    /(?:\?|&)debug=1(?:&|$)/.test(location.search);

  var mindarThree = null;
  var anchor = null;
  var contentRoot = null;
  var modelRoot = null;
  var modelScene = null;
  var guideRoot = null;
  var ambientLight = null;
  var directionalLight = null;

  var starting = false;
  var running = false;
  var targetFound = false;
  var disposedPage = false;

  var modelLoadState = "idle";
  var modelLoadProgress = 0;
  var modelLoadError = null;
  var modelLoadPromise = null;
  var rawModelTemplate = null;
  var rawBoundingBox = null;
  var rotatedBoundingBox = null;
  var transformedBoundingBox = null;
  var appliedScale = 1;
  var lastSuggestedScale = null;

  var currentZoom = 1;
  var zoomMode = "css";

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function cloneConfig(src) {
    return JSON.parse(JSON.stringify(src));
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

  function setOverlayMode(mode) {
    if (!overlayEl) return;
    overlayEl.classList.remove("is-idle", "is-ar-running");
    if (mode === "idle") overlayEl.classList.add("is-idle");
    else if (mode === "ar") overlayEl.classList.add("is-ar-running");
  }

  function setSettingsMsg(message) {
    if (settingsMsgEl) settingsMsgEl.textContent = message || "";
  }

  /** 校正用設定の読込（将来 Supabase 差し替え用に集約） */
  function loadCalibrationSettings() {
    try {
      if (typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(CALIBRATION_SETTINGS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      console.warn("loadCalibrationSettings failed:", error);
      return null;
    }
  }

  /** 校正用設定の保存（実測定具キーへは絶対に書かない） */
  function saveCalibrationSettings(config, measureSummary) {
    try {
      if (typeof localStorage === "undefined") {
        return { ok: false, message: "localStorage を利用できません" };
      }
      var payload = {
        markerPhysicalWidthMm: num(config.markerPhysicalWidthMm, 0),
        scaleCorrection: num(config.scaleCorrection, 1),
        position: config.position,
        rotationDegrees: config.rotationDegrees,
        alignmentMode: config.alignmentMode,
        observedMm: config.observedMm,
        deviceName: config.deviceName || "",
        notes: config.notes || "",
        measureSummary: measureSummary || null,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(CALIBRATION_SETTINGS_KEY, JSON.stringify(payload));
      return {
        ok: true,
        message: "校正結果を保存しました（" + CALIBRATION_SETTINGS_KEY + "）",
      };
    } catch (error) {
      return {
        ok: false,
        message: "保存失敗: " + (error && error.message ? error.message : error),
      };
    }
  }

  /** 実測定具設定から marker 幅だけ読む（書込しない） */
  function peekToolMarkerWidthMm() {
    try {
      if (typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(TOOL_SETTINGS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var w = num(parsed && parsed.markerPhysicalWidthMm, 0);
      return w > 0 ? w : null;
    } catch (e) {
      return null;
    }
  }

  function applyLoadedSettings(saved) {
    if (!saved) {
      var peeked = peekToolMarkerWidthMm();
      if (peeked != null) {
        CALIBRATION_CONFIG.markerPhysicalWidthMm = peeked;
      }
      return;
    }
    if (saved.markerPhysicalWidthMm != null) {
      CALIBRATION_CONFIG.markerPhysicalWidthMm = num(
        saved.markerPhysicalWidthMm,
        0,
      );
    } else {
      var peekedW = peekToolMarkerWidthMm();
      if (peekedW != null) {
        CALIBRATION_CONFIG.markerPhysicalWidthMm = peekedW;
      }
    }
    if (saved.scaleCorrection != null) {
      CALIBRATION_CONFIG.scaleCorrection = num(saved.scaleCorrection, 1);
    }
    if (saved.position) {
      CALIBRATION_CONFIG.position = {
        x: num(saved.position.x, 0),
        y: num(saved.position.y, 0),
        z: num(saved.position.z, 0),
      };
    }
    if (saved.rotationDegrees) {
      CALIBRATION_CONFIG.rotationDegrees = {
        x: num(saved.rotationDegrees.x, 90),
        y: num(saved.rotationDegrees.y, 0),
        z: num(saved.rotationDegrees.z, 0),
      };
    }
    if (saved.alignmentMode === "preserve-origin" || saved.alignmentMode === "bottom-center") {
      CALIBRATION_CONFIG.alignmentMode = saved.alignmentMode;
    }
    if (saved.observedMm) {
      CALIBRATION_CONFIG.observedMm = {
        m1: saved.observedMm.m1 != null ? String(saved.observedMm.m1) : "",
        m2: saved.observedMm.m2 != null ? String(saved.observedMm.m2) : "",
        m3: saved.observedMm.m3 != null ? String(saved.observedMm.m3) : "",
      };
    }
    if (saved.deviceName != null) CALIBRATION_CONFIG.deviceName = String(saved.deviceName);
    if (saved.notes != null) CALIBRATION_CONFIG.notes = String(saved.notes);
  }

  function computeScaleInfo() {
    var correction = num(CALIBRATION_CONFIG.scaleCorrection, 1);
    if (correction <= 0) correction = 1;
    var widthMm = num(CALIBRATION_CONFIG.markerPhysicalWidthMm, 0);
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
    return computeScaleInfo().finalScale;
  }

  function judgeGlbAxis(glbMm) {
    var diff = glbMm - TARGET_MM;
    var percent = (diff / TARGET_MM) * 100;
    var abs = Math.abs(percent);
    var label = "GLBエクスポート条件を確認";
    if (abs <= 0.5) label = "正常";
    else if (abs <= 1) label = "要確認";
    return {
      glbMm: glbMm,
      differenceMm: diff,
      differencePercent: percent,
      label: label,
    };
  }

  function parseObservedList() {
    var values = [];
    var raws = [
      CALIBRATION_CONFIG.observedMm.m1,
      CALIBRATION_CONFIG.observedMm.m2,
      CALIBRATION_CONFIG.observedMm.m3,
    ];
    for (var i = 0; i < raws.length; i++) {
      var s = String(raws[i] == null ? "" : raws[i]).trim();
      if (!s) continue;
      var v = Number(s);
      if (isFinite(v) && v > 0) values.push(v);
    }
    return values;
  }

  function computeMeasureSummary() {
    var values = parseObservedList();
    if (!values.length) {
      lastSuggestedScale = null;
      return null;
    }
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    var averageObservedMm = sum / values.length;
    var errorMm = averageObservedMm - TARGET_MM;
    var errorPercent = (errorMm / TARGET_MM) * 100;
    var suggestedScaleCorrection = TARGET_MM / averageObservedMm;
    lastSuggestedScale = suggestedScaleCorrection;

    var absErr = Math.abs(errorMm);
    var arJudge = "再調整推奨";
    if (absErr <= 1) arJudge = "良好";
    else if (absErr <= 3) arJudge = "要確認";

    return {
      count: values.length,
      values: values,
      averageObservedMm: averageObservedMm,
      errorMm: errorMm,
      errorPercent: errorPercent,
      suggestedScaleCorrection: suggestedScaleCorrection,
      arJudge: arJudge,
      markerPhysicalWidthMm: CALIBRATION_CONFIG.markerPhysicalWidthMm,
      scaleCorrection: CALIBRATION_CONFIG.scaleCorrection,
      deviceName: CALIBRATION_CONFIG.deviceName,
      notes: CALIBRATION_CONFIG.notes,
    };
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
  }

  function updateGlbSizePanel() {
    if (!glbSizeEl) return;
    if (!rawBoundingBox) {
      glbSizeEl.textContent =
        modelLoadState === "error"
          ? "読込失敗: " + (modelLoadError || "")
          : modelLoadState === "loading"
            ? "読み込み中… " + modelLoadProgress + "%"
            : "GLB読込前（/models/calibration-100mm.glb）";
      return;
    }
    var size = rawBoundingBox.getSize(new THREE.Vector3());
    var x = judgeGlbAxis(size.x * 1000);
    var y = judgeGlbAxis(size.y * 1000);
    var z = judgeGlbAxis(size.z * 1000);
    glbSizeEl.textContent = [
      "想定: 100 × 100 × 100 mm（CAD→GLB単位確認。AR精度判定ではない）",
      "GLB X: " +
        x.glbMm.toFixed(2) +
        "mm  差 " +
        x.differenceMm.toFixed(2) +
        "mm (" +
        x.differencePercent.toFixed(2) +
        "%) → " +
        x.label,
      "GLB Y: " +
        y.glbMm.toFixed(2) +
        "mm  差 " +
        y.differenceMm.toFixed(2) +
        "mm (" +
        y.differencePercent.toFixed(2) +
        "%) → " +
        y.label,
      "GLB Z: " +
        z.glbMm.toFixed(2) +
        "mm  差 " +
        z.differenceMm.toFixed(2) +
        "mm (" +
        z.differencePercent.toFixed(2) +
        "%) → " +
        z.label,
    ].join("\n");
  }

  function updateMeasurePanel() {
    if (!measureResultEl) return;
    var summary = computeMeasureSummary();
    var scaleInfo = computeScaleInfo();
    if (!summary) {
      measureResultEl.textContent = [
        "実測未入力（測定1〜3のいずれかへ mm を入力）",
        "markerPhysicalWidthMm: " + scaleInfo.widthMm,
        "scaleCorrection: " + Number(scaleInfo.scaleCorrection).toFixed(4),
        "suggestedScaleCorrection: -",
      ].join("\n");
      return;
    }
    measureResultEl.textContent = [
      "入力数: " + summary.count + "  値: " + summary.values.join(", "),
      "averageObservedMm: " + summary.averageObservedMm.toFixed(2) + " mm",
      "errorMm: " +
        (summary.errorMm >= 0 ? "+" : "") +
        summary.errorMm.toFixed(2) +
        " mm",
      "errorPercent: " +
        (summary.errorPercent >= 0 ? "+" : "") +
        summary.errorPercent.toFixed(2) +
        " %",
      "AR精度判定: " + summary.arJudge + "（±1mm良好 / ±1〜3要確認 / ±3超再調整）",
      "推奨補正値 suggestedScaleCorrection: " +
        summary.suggestedScaleCorrection.toFixed(4),
      "（計算: 100 / averageObservedMm。校正画面のみ。実測定具へ自動適用しない）",
      "markerPhysicalWidthMm: " + summary.markerPhysicalWidthMm,
      "scaleCorrection(現在): " + Number(summary.scaleCorrection).toFixed(4),
      "端末: " + (summary.deviceName || "-"),
      "備考: " + (summary.notes || "-"),
    ].join("\n");
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

  function updateDebug() {
    updateScaleModeBadge();
    updateGlbSizePanel();
    updateMeasurePanel();
    if (!debugEl || !DEBUG_QUERY) return;
    var info = computeScaleInfo();
    var renderInfo =
      mindarThree && mindarThree.renderer ? mindarThree.renderer.info : null;
    var rawSize = rawBoundingBox
      ? rawBoundingBox.getSize(new THREE.Vector3())
      : null;
    var lines = [
      "file: " + CALIBRATION_CONFIG.src,
      "modelLoadState: " + modelLoadState,
      "markerPhysicalWidthMm: " + info.widthMm,
      "markerWidthMeters: " + Number(info.markerWidthMeters).toFixed(6),
      "baseScale: " + Number(info.baseScale).toFixed(6),
      "scaleCorrection: " + Number(info.scaleCorrection).toFixed(6),
      "finalScale: " + Number(info.finalScale).toFixed(6),
      "appliedScale: " + Number(appliedScale).toFixed(6),
      "rawBBox min: " + (rawBoundingBox ? formatVec3(rawBoundingBox.min) : "-"),
      "rawBBox max: " + (rawBoundingBox ? formatVec3(rawBoundingBox.max) : "-"),
      "raw size m: " +
        (rawSize
          ? Number(rawSize.x).toFixed(4) +
            ", " +
            Number(rawSize.y).toFixed(4) +
            ", " +
            Number(rawSize.z).toFixed(4)
          : "-"),
      "rotationDegrees: " + JSON.stringify(CALIBRATION_CONFIG.rotationDegrees),
      "position: " + JSON.stringify(CALIBRATION_CONFIG.position),
      "alignmentMode: " + CALIBRATION_CONFIG.alignmentMode,
      "recognition: " +
        (!running ? "停止" : targetFound ? "認識中" : "検索中/見失い"),
      "zoom: " + currentZoom + "x (" + zoomMode + ")",
    ];
    if (renderInfo && renderInfo.memory) {
      lines.push(
        "renderer.geometries: " +
          renderInfo.memory.geometries +
          ", textures: " +
          renderInfo.memory.textures,
      );
    }
    if (modelLoadError) lines.push("modelError: " + modelLoadError);
    debugEl.textContent = lines.join("\n");
  }

  function syncControlsFromConfig() {
    if (markerWidthInput) {
      markerWidthInput.value = String(CALIBRATION_CONFIG.markerPhysicalWidthMm);
    }
    if (scaleCorrInput) {
      scaleCorrInput.value = String(CALIBRATION_CONFIG.scaleCorrection);
    }
    if (obs1Input) obs1Input.value = CALIBRATION_CONFIG.observedMm.m1;
    if (obs2Input) obs2Input.value = CALIBRATION_CONFIG.observedMm.m2;
    if (obs3Input) obs3Input.value = CALIBRATION_CONFIG.observedMm.m3;
    if (deviceInput) deviceInput.value = CALIBRATION_CONFIG.deviceName;
    if (notesInput) notesInput.value = CALIBRATION_CONFIG.notes;
  }

  function readControlsIntoConfig() {
    if (markerWidthInput) {
      CALIBRATION_CONFIG.markerPhysicalWidthMm = Math.max(
        0,
        num(markerWidthInput.value, 0),
      );
    }
    if (scaleCorrInput) {
      var sc = num(scaleCorrInput.value, 1);
      CALIBRATION_CONFIG.scaleCorrection = sc > 0 ? sc : 1;
    }
    CALIBRATION_CONFIG.observedMm = {
      m1: obs1Input ? String(obs1Input.value) : "",
      m2: obs2Input ? String(obs2Input.value) : "",
      m3: obs3Input ? String(obs3Input.value) : "",
    };
    CALIBRATION_CONFIG.deviceName = deviceInput ? String(deviceInput.value) : "";
    CALIBRATION_CONFIG.notes = notesInput ? String(notesInput.value) : "";
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
        for (var t = 0; t < tracks.length; t++) tracks[t].stop();
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
    if (typeof material.dispose === "function") material.dispose();
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

  function getBoxInParentSpace(object, parent) {
    object.updateWorldMatrix(true, true);
    parent.updateWorldMatrix(true, true);
    var worldBox = new THREE.Box3().setFromObject(object);
    var invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    return worldBox.clone().applyMatrix4(invParent);
  }

  function makeLabelSprite(text, color) {
    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color || "#e2e8f0";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    var texture = new THREE.CanvasTexture(canvas);
    var material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    var sprite = new THREE.Sprite(material);
    sprite.scale.set(0.35, 0.09, 1);
    return sprite;
  }

  function makeGuideLine(from, to, color) {
    var geom = new THREE.BufferGeometry().setFromPoints([from, to]);
    var mat = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    return new THREE.Line(geom, mat);
  }

  function rebuildGuides() {
    if (!contentRoot) return;
    if (guideRoot) {
      disposeObject3D(guideRoot);
      contentRoot.remove(guideRoot);
      guideRoot = null;
    }
    // AR計算上の100mm（物理校正基準そのものではない）
    var L = 0.1 * appliedScale;
    guideRoot = new THREE.Group();
    guideRoot.name = "calibration-100mm-guides";

    guideRoot.add(
      makeGuideLine(
        new THREE.Vector3(-L / 2, 0, 0.002),
        new THREE.Vector3(L / 2, 0, 0.002),
        0xef4444,
      ),
    );
    guideRoot.add(
      makeGuideLine(
        new THREE.Vector3(0, -L / 2, 0.002),
        new THREE.Vector3(0, L / 2, 0.002),
        0x22c55e,
      ),
    );
    // Z方向はマーカー面法線。底面から高さ100mm
    guideRoot.add(
      makeGuideLine(
        new THREE.Vector3(0, 0, 0.002),
        new THREE.Vector3(0, 0, L),
        0x38bdf8,
      ),
    );

    var labelX = makeLabelSprite("X:100mm", "#fca5a5");
    labelX.position.set(L / 2 + 0.05 * appliedScale, 0, 0.05 * appliedScale);
    guideRoot.add(labelX);

    var labelY = makeLabelSprite("Y:100mm", "#86efac");
    labelY.position.set(0, L / 2 + 0.05 * appliedScale, 0.05 * appliedScale);
    guideRoot.add(labelY);

    var labelZ = makeLabelSprite("Z:100mm", "#7dd3fc");
    labelZ.position.set(0.05 * appliedScale, 0, L + 0.04 * appliedScale);
    guideRoot.add(labelZ);

    contentRoot.add(guideRoot);
  }

  function applyTransformToModel() {
    if (!modelRoot || !modelScene || !contentRoot) return;

    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.scale.set(1, 1, 1);
    modelScene.position.set(0, 0, 0);
    modelScene.rotation.set(0, 0, 0);
    modelScene.scale.set(1, 1, 1);
    modelRoot.updateMatrixWorld(true);

    rawBoundingBox = getBoxInParentSpace(modelScene, contentRoot);
    appliedScale = computeFinalScale();
    modelRoot.rotation.set(
      THREE.MathUtils.degToRad(num(CALIBRATION_CONFIG.rotationDegrees.x, 90)),
      THREE.MathUtils.degToRad(num(CALIBRATION_CONFIG.rotationDegrees.y, 0)),
      THREE.MathUtils.degToRad(num(CALIBRATION_CONFIG.rotationDegrees.z, 0)),
    );
    modelRoot.scale.set(appliedScale, appliedScale, appliedScale);
    modelRoot.updateMatrixWorld(true);
    rotatedBoundingBox = getBoxInParentSpace(modelScene, contentRoot);

    var alignX = 0;
    var alignY = 0;
    var alignZ = 0;
    if (CALIBRATION_CONFIG.alignmentMode === "bottom-center") {
      var box = rotatedBoundingBox;
      var center = box.getCenter(new THREE.Vector3());
      alignX = -center.x;
      alignY = -center.y;
      alignZ = -box.min.z;
    }

    modelRoot.position.set(
      alignX + num(CALIBRATION_CONFIG.position.x, 0),
      alignY + num(CALIBRATION_CONFIG.position.y, 0),
      alignZ + num(CALIBRATION_CONFIG.position.z, 0),
    );
    modelRoot.updateMatrixWorld(true);
    transformedBoundingBox = getBoxInParentSpace(modelScene, contentRoot);
    rebuildGuides();
  }

  function ensureContentHierarchy() {
    if (!anchor) return;
    if (!contentRoot) {
      contentRoot = new THREE.Group();
      contentRoot.name = "calibration-content-root";
      anchor.group.add(contentRoot);
    }
    if (modelLoadState === "ready" && rawModelTemplate && !modelRoot) {
      modelRoot = new THREE.Group();
      modelRoot.name = "calibration-model-root";
      modelScene = rawModelTemplate.clone(true);
      modelRoot.add(modelScene);
      contentRoot.add(modelRoot);
      applyTransformToModel();
    } else if (modelRoot) {
      applyTransformToModel();
    }
  }

  function ensureCameraVisibleThroughCanvas() {
    if (!mindarThree || !mindarThree.renderer) return;
    try {
      mindarThree.renderer.setClearColor(0x000000, 0);
      mindarThree.renderer.setClearAlpha(0);
    } catch (e) {}
    if (mindarThree.scene) mindarThree.scene.background = null;
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
    if (typeof mindarThree.resize === "function") {
      try {
        mindarThree.resize();
      } catch (e) {}
    }
  }

  function getVideoTrack() {
    if (!containerEl) return null;
    var videos = containerEl.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      var stream = videos[i].srcObject;
      if (stream && stream.getVideoTracks) {
        var tracks = stream.getVideoTracks();
        if (tracks && tracks[0]) return tracks[0];
      }
    }
    return null;
  }

  function syncZoomButtons() {
    for (var i = 0; i < zoomButtons.length; i++) {
      var btn = zoomButtons[i];
      var z = num(btn.getAttribute("data-zoom"), 1);
      if (Math.abs(z - currentZoom) < 0.001) btn.classList.add("is-active");
      else btn.classList.remove("is-active");
    }
  }

  function applyCssZoom(zoom) {
    if (!containerEl) return;
    containerEl.style.transform = zoom === 1 ? "" : "scale(" + zoom + ")";
    containerEl.style.transformOrigin = "center center";
  }

  function clearCssZoom() {
    if (!containerEl) return;
    containerEl.style.transform = "";
    containerEl.style.transformOrigin = "";
  }

  function tryHardwareZoom(zoom) {
    var track = getVideoTrack();
    if (!track || typeof track.getCapabilities !== "function") {
      return Promise.resolve(false);
    }
    var caps = track.getCapabilities();
    if (!caps || caps.zoom == null) return Promise.resolve(false);
    var minZ = caps.zoom.min != null ? caps.zoom.min : 1;
    var maxZ = caps.zoom.max != null ? caps.zoom.max : 1;
    var t = (zoom - 1) / 1;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var target = minZ + (maxZ - minZ) * t;
    return track
      .applyConstraints({ advanced: [{ zoom: target }] })
      .then(function () {
        if (mindarThree && typeof mindarThree.resize === "function") {
          mindarThree.resize();
        }
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function setZoom(zoom) {
    var next = num(zoom, 1);
    if (next < 1) next = 1;
    if (next > 2) next = 2;
    currentZoom = next;
    syncZoomButtons();
    if (!running) {
      applyCssZoom(next);
      return;
    }
    tryHardwareZoom(next).then(function (ok) {
      if (ok) {
        zoomMode = "hardware";
        clearCssZoom();
      } else {
        zoomMode = "css";
        applyCssZoom(next);
      }
      updateDebug();
    });
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
    setStatus("モデルを読み込み中…", false);
    updateDebug();

    modelLoadPromise = new Promise(function (resolve, reject) {
      var loader = new GLTFLoader();
      loader.load(
        CALIBRATION_CONFIG.src,
        function (gltf) {
          if (disposedPage) {
            disposeObject3D(gltf.scene);
            reject(new Error("page disposed"));
            return;
          }
          rawModelTemplate = gltf.scene;
          rawBoundingBox = new THREE.Box3().setFromObject(rawModelTemplate);
          modelLoadState = "ready";
          modelLoadProgress = 100;
          modelLoadError = null;
          modelLoadPromise = null;
          setStatus("モデル準備完了：ARを開始できます", false);
          if (running) ensureContentHierarchy();
          updateDebug();
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
          setStatus("モデルを読み込み中… " + modelLoadProgress + "%", false);
          updateDebug();
        },
        function (error) {
          modelLoadState = "error";
          modelLoadPromise = null;
          modelLoadError =
            (error && error.message ? error.message : String(error)) +
            " /models/calibration-100mm.glb を public/models/ に配置してください。";
          setStatus("モデル読み込みエラー: " + modelLoadError, true);
          updateDebug();
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
        if (mindarThree.renderer) mindarThree.renderer.setAnimationLoop(null);
        if (typeof mindarThree.stop === "function") mindarThree.stop();
      } catch (e) {}
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
    if (directionalLight && directionalLight.dispose) directionalLight.dispose();
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
    guideRoot = null;
    ambientLight = null;
    directionalLight = null;
    rotatedBoundingBox = null;
    transformedBoundingBox = null;

    clearCssZoom();
    clearContainer();
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setOverlayMode("idle");
    if (modelLoadState === "ready") {
      setStatus("停止済み：ARを開始できます", false);
    }
    updateDebug();
  }

  function checkTargetsFile() {
    return fetch(TARGET_SRC, { method: "GET", cache: "no-store" }).then(
      function (response) {
        if (!response.ok) {
          throw new Error(
            "targets.mind が見つかりません。public/ar/targets.mind を配置してください。",
          );
        }
        return response.arrayBuffer().then(function (buffer) {
          if (!buffer || buffer.byteLength < 16) {
            throw new Error("targets.mind が不正です。");
          }
          return true;
        });
      },
    );
  }

  function startAR() {
    if (disposedPage || starting || running) return;
    if (!window.isSecureContext) {
      setStatus("HTTPSが必要です。", true);
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

    stopMediaTracksInContainer();
    clearContainer();

    loadModel()
      .catch(function (error) {
        throw new Error(
          "校正GLBを読めません: " +
            (error && error.message ? error.message : String(error)),
        );
      })
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

        ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.95);
        directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(2, 3, 4);
        mindarThree.scene.add(ambientLight);
        mindarThree.scene.add(directionalLight);

        anchor = mindarThree.addAnchor(0);
        ensureContentHierarchy();
        anchor.onTargetFound = function () {
          targetFound = true;
          setOverlayVisible(false);
          setStatus("マーカー認識中（100mm立方体と比較できます）", false);
          updateDebug();
        };
        anchor.onTargetLost = function () {
          targetFound = false;
          setOverlayVisible(true);
          setOverlayMode("ar");
          setStatus("マーカーを映してください", false);
          updateDebug();
        };

        var videos = containerEl.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          videos[i].setAttribute("playsinline", "");
          videos[i].setAttribute("webkit-playsinline", "");
          videos[i].muted = true;
          videos[i].playsInline = true;
        }
        return mindarThree.start();
      })
      .then(function () {
        if (!starting || disposedPage) {
          stopAR();
          return;
        }
        ensureCameraVisibleThroughCanvas();
        setZoom(currentZoom);
        running = true;
        starting = false;
        targetFound = false;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        setOverlayVisible(true);
        setOverlayMode("ar");
        setStatus("マーカー検索中…", false);
        updateDebug();
        mindarThree.renderer.setAnimationLoop(function () {
          mindarThree.renderer.setClearColor(0x000000, 0);
          mindarThree.renderer.render(mindarThree.scene, mindarThree.camera);
        });
      })
      .catch(function (error) {
        starting = false;
        running = false;
        try {
          stopAR();
        } catch (e) {}
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        setOverlayVisible(true);
        setOverlayMode("idle");
        setStatus(
          "エラー: " + (error && error.message ? error.message : String(error)),
          true,
        );
        updateDebug();
      });
  }

  function reapplyLiveSettings() {
    if (running && modelRoot) {
      applyTransformToModel();
    }
    updateDebug();
  }

  function onApply() {
    readControlsIntoConfig();
    syncControlsFromConfig();
    reapplyLiveSettings();
    setSettingsMsg("設定を適用しました（未保存）");
  }

  function onSave() {
    readControlsIntoConfig();
    var summary = computeMeasureSummary();
    var result = saveCalibrationSettings(CALIBRATION_CONFIG, summary);
    syncControlsFromConfig();
    reapplyLiveSettings();
    setSettingsMsg(result.message);
  }

  function onReset() {
    CALIBRATION_CONFIG = cloneConfig(DEFAULT_CONFIG);
    var peeked = peekToolMarkerWidthMm();
    if (peeked != null) {
      CALIBRATION_CONFIG.markerPhysicalWidthMm = peeked;
    }
    syncControlsFromConfig();
    reapplyLiveSettings();
    setSettingsMsg("初期値へリセットしました（保存はしていません）");
  }

  function onResetTheory() {
    readControlsIntoConfig();
    CALIBRATION_CONFIG.scaleCorrection = 1.0;
    syncControlsFromConfig();
    reapplyLiveSettings();
    setSettingsMsg("scaleCorrection を 1.000（理論値）へ戻しました");
  }

  function onApplySuggested() {
    readControlsIntoConfig();
    var summary = computeMeasureSummary();
    if (!summary) {
      setSettingsMsg("実測値が無いため推奨値を適用できません");
      return;
    }
    CALIBRATION_CONFIG.scaleCorrection = Number(
      summary.suggestedScaleCorrection.toFixed(4),
    );
    syncControlsFromConfig();
    reapplyLiveSettings();
    setSettingsMsg(
      "推奨値 " +
        CALIBRATION_CONFIG.scaleCorrection +
        " を校正画面だけに適用しました（実測定具設定は変更していません）",
    );
  }

  if (startBtn) startBtn.addEventListener("click", startAR);
  if (stopBtn) stopBtn.addEventListener("click", stopAR);
  if (applyConfigBtn) applyConfigBtn.addEventListener("click", onApply);
  if (saveConfigBtn) saveConfigBtn.addEventListener("click", onSave);
  if (resetConfigBtn) resetConfigBtn.addEventListener("click", onReset);
  if (resetTheoryBtn) resetTheoryBtn.addEventListener("click", onResetTheory);
  if (applySuggestedBtn) {
    applySuggestedBtn.addEventListener("click", onApplySuggested);
  }
  for (var zi = 0; zi < zoomButtons.length; zi++) {
    zoomButtons[zi].addEventListener("click", function (event) {
      setZoom(event.currentTarget.getAttribute("data-zoom"));
    });
  }

  // 実測入力の都度サマリ更新
  function onMeasureInput() {
    readControlsIntoConfig();
    updateMeasurePanel();
  }
  if (obs1Input) obs1Input.addEventListener("input", onMeasureInput);
  if (obs2Input) obs2Input.addEventListener("input", onMeasureInput);
  if (obs3Input) obs3Input.addEventListener("input", onMeasureInput);
  if (deviceInput) deviceInput.addEventListener("input", onMeasureInput);
  if (notesInput) notesInput.addEventListener("input", onMeasureInput);

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
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && (running || starting)) {
      stopAR();
    }
  });
  document.addEventListener(
    "gesturestart",
    function (e) {
      e.preventDefault();
    },
    { passive: false },
  );

  applyLoadedSettings(loadCalibrationSettings());
  if (stopBtn) stopBtn.disabled = true;
  if (debugPanelEl) {
    debugPanelEl.style.display = DEBUG_QUERY ? "block" : "none";
  }
  setOverlayMode("idle");
  syncControlsFromConfig();
  syncZoomButtons();
  updateScaleModeBadge();

  if (!window.isSecureContext) {
    setStatus("HTTPSが必要です。", true);
  } else {
    setStatus("モデルを準備中…", false);
    loadModel().catch(function () {});
  }
  updateDebug();
})();

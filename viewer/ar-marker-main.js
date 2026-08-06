import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";

(function () {
  /**
   * モデル配置設定（このオブジェクトだけを編集すれば向き・倍率を調整できる）
   *
   * 単位メモ:
   * - glTF の距離単位はメートル (m) として扱う
   * - MindAR の画像ターゲット空間は「マーカー幅 = 1」が基準
   * - markerPhysicalWidthMm > 0 のとき:
   *     baseScale = 1000 / markerPhysicalWidthMm
   *     （例: 印刷幅 100mm → 0.1m → baseScale=10 で「1ターゲット単位 = 0.1m」に合わせる）
   *     finalScale = baseScale * scaleCorrection
   * - markerPhysicalWidthMm === 0 のときは scaleCorrection のみ適用（今回の表示確認用）
   * - 倍率は geometry に焼き込まず Object3D.scale で適用する
   */
  var MODEL_CONFIG = {
    src: "/models/demo.glb",
    visibleMode: "model", // "model" | "cube"
    scaleCorrection: 1,
    position: { x: 0, y: 0, z: 0 },
    rotationDegrees: { x: 90, y: 0, z: 0 },
    alignmentMode: "bottom-center", // "bottom-center" | "preserve-origin"
    markerPhysicalWidthMm: 0,
  };

  var DEFAULT_CONFIG = JSON.parse(JSON.stringify(MODEL_CONFIG));

  var containerEl = document.getElementById("ar-container");
  var statusEl = document.getElementById("status-text");
  var debugEl = document.getElementById("debug-text");
  var startBtn = document.getElementById("start-btn");
  var stopBtn = document.getElementById("stop-btn");
  var overlayEl = document.getElementById("message-overlay");
  var debugPanelEl = document.getElementById("debug-panel");
  var debugToggleBtn = document.getElementById("debug-toggle-btn");

  var modeSelect = document.getElementById("mode-select");
  var alignSelect = document.getElementById("align-select");
  var rotXSelect = document.getElementById("rot-x-select");
  var axesToggle = document.getElementById("axes-toggle");
  var resetConfigBtn = document.getElementById("reset-config-btn");

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
  var rawModelTemplate = null; // 未配置のクローン元
  var rawBoundingBox = null;
  var transformedBoundingBox = null;
  var appliedScale = 1;

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

  function formatSize(size) {
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

  function computeFinalScale() {
    var correction = Number(MODEL_CONFIG.scaleCorrection) || 1;
    var widthMm = Number(MODEL_CONFIG.markerPhysicalWidthMm) || 0;
    if (widthMm > 0) {
      // マーカー印刷幅[mm] → m。ターゲット空間幅1に実寸(widthMm/1000)mを対応させる
      var baseScale = 1000 / widthMm;
      return baseScale * correction;
    }
    return correction;
  }

  function getRecognitionLabel() {
    if (!running) return "停止";
    if (targetFound) return "認識中";
    return "検索中/見失い";
  }

  function updateDebug(extra) {
    if (!debugEl) return;
    var info = mindarThree && mindarThree.renderer
      ? mindarThree.renderer.info
      : null;
    var lines = [
      "file: " + MODEL_CONFIG.src,
      "modelLoadState: " + modelLoadState +
        (modelLoadState === "loading" ? " (" + modelLoadProgress + "%)" : ""),
      "visibleMode: " + MODEL_CONFIG.visibleMode,
      "alignmentMode: " + MODEL_CONFIG.alignmentMode,
      "rotationDegrees: " +
        JSON.stringify(MODEL_CONFIG.rotationDegrees),
      "position: " + JSON.stringify(MODEL_CONFIG.position),
      "scaleCorrection: " + MODEL_CONFIG.scaleCorrection,
      "markerPhysicalWidthMm: " + MODEL_CONFIG.markerPhysicalWidthMm,
      "appliedScale: " + Number(appliedScale).toFixed(6),
      "rawBBox min: " +
        (rawBoundingBox ? formatVec3(rawBoundingBox.min) : "-"),
      "rawBBox max: " +
        (rawBoundingBox ? formatVec3(rawBoundingBox.max) : "-"),
      "raw size: " +
        (rawBoundingBox
          ? formatSize(rawBoundingBox.getSize(new THREE.Vector3()))
          : "-"),
      "transformedBBox min: " +
        (transformedBoundingBox
          ? formatVec3(transformedBoundingBox.min)
          : "-"),
      "transformedBBox max: " +
        (transformedBoundingBox
          ? formatVec3(transformedBoundingBox.max)
          : "-"),
      "transformed size: " +
        (transformedBoundingBox
          ? formatSize(transformedBoundingBox.getSize(new THREE.Vector3()))
          : "-"),
      "recognition: " + getRecognitionLabel(),
      "isSecureContext: " + String(window.isSecureContext),
      "running: " + String(running),
      "targetFound: " + String(targetFound),
    ];
    if (info && info.memory) {
      lines.push(
        "renderer.geometries: " +
          info.memory.geometries +
          ", textures: " +
          info.memory.textures,
      );
    }
    if (info && info.render) {
      lines.push(
        "renderer.calls: " +
          info.render.calls +
          ", triangles: " +
          info.render.triangles,
      );
    }
    if (modelLoadError) {
      lines.push("modelError: " + modelLoadError);
    }
    if (extra) {
      if (extra.name) lines.push("errorName: " + extra.name);
      if (extra.message) lines.push("errorMessage: " + extra.message);
    }
    debugEl.textContent = lines.join("\n");
  }

  function refreshStatusForModel() {
    if (disposedPage) return;
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
    if (modeSelect) modeSelect.value = MODEL_CONFIG.visibleMode;
    if (alignSelect) alignSelect.value = MODEL_CONFIG.alignmentMode;
    if (rotXSelect) {
      var rx = Number(MODEL_CONFIG.rotationDegrees.x) || 0;
      if (rx === 90 || rx === -90 || rx === 0) {
        rotXSelect.value = String(rx);
      } else {
        rotXSelect.value = "90";
      }
    }
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

  function applyTransformToModel() {
    if (!modelRoot || !modelScene || !contentRoot) return;

    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.scale.set(1, 1, 1);
    modelScene.position.set(0, 0, 0);
    modelScene.rotation.set(0, 0, 0);
    modelScene.scale.set(1, 1, 1);
    modelRoot.updateMatrixWorld(true);

    // 元の BoundingBox（未変換・マーカー空間）
    rawBoundingBox = getBoxInParentSpace(modelScene, contentRoot);

    appliedScale = computeFinalScale();
    modelRoot.scale.set(appliedScale, appliedScale, appliedScale);
    modelRoot.rotation.set(
      THREE.MathUtils.degToRad(Number(MODEL_CONFIG.rotationDegrees.x) || 0),
      THREE.MathUtils.degToRad(Number(MODEL_CONFIG.rotationDegrees.y) || 0),
      THREE.MathUtils.degToRad(Number(MODEL_CONFIG.rotationDegrees.z) || 0),
    );
    modelRoot.updateMatrixWorld(true);

    var alignX = 0;
    var alignY = 0;
    var alignZ = 0;

    if (MODEL_CONFIG.alignmentMode === "bottom-center") {
      // 回転・倍率適用後に再計算（contentRoot = マーカー座標）。
      // マーカー面の法線を Z とし、変換後 bbox の minZ を 0 付近へ、
      // X/Y は bbox 中心をマーカー中心へ合わせる。
      var box = getBoxInParentSpace(modelScene, contentRoot);
      var center = box.getCenter(new THREE.Vector3());
      alignX = -center.x;
      alignY = -center.y;
      alignZ = -box.min.z;
    }

    // 手動補正（マーカー座標上）を自動合わせの後に加算
    modelRoot.position.set(
      alignX + (Number(MODEL_CONFIG.position.x) || 0),
      alignY + (Number(MODEL_CONFIG.position.y) || 0),
      alignZ + (Number(MODEL_CONFIG.position.z) || 0),
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
      // デバッグ立方体: 下端がマーカー面(z=0)に接する
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
    transformedBoundingBox = null;

    clearContainer();

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
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
      setOverlayVisible(false);
      setStatus("マーカー認識中", false);
      updateDebug(null);
    };
    anchor.onTargetLost = function () {
      targetFound = false;
      setOverlayVisible(true);
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
    setStatus("初期化中…", false);
    updateDebug(null);

    stopMediaTracksInContainer();
    clearContainer();

    var prepareModel =
      MODEL_CONFIG.visibleMode === "model"
        ? loadModel().catch(function (error) {
            // モデル必須時のみ失敗させる
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

        running = true;
        starting = false;
        targetFound = false;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        setOverlayVisible(true);
        setStatus("マーカー検索中…", false);
        updateDebug(null);

        mindarThree.renderer.setAnimationLoop(function () {
          mindarThree.renderer.render(mindarThree.scene, mindarThree.camera);
          // 軽量にレンダ情報を更新（毎フレーム全文更新は重いので間引き）
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

  function onVisibilityChange() {
    if (document.visibilityState === "hidden" && (running || starting)) {
      stopAR();
    }
  }

  function reapplyLiveSettings() {
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
  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      MODEL_CONFIG.visibleMode = modeSelect.value;
      reapplyLiveSettings();
    });
  }
  if (alignSelect) {
    alignSelect.addEventListener("change", function () {
      MODEL_CONFIG.alignmentMode = alignSelect.value;
      reapplyLiveSettings();
    });
  }
  if (rotXSelect) {
    rotXSelect.addEventListener("change", function () {
      MODEL_CONFIG.rotationDegrees.x = Number(rotXSelect.value) || 0;
      reapplyLiveSettings();
    });
  }
  if (resetConfigBtn) {
    resetConfigBtn.addEventListener("click", function () {
      var restored = cloneConfig(DEFAULT_CONFIG);
      MODEL_CONFIG.visibleMode = restored.visibleMode;
      MODEL_CONFIG.scaleCorrection = restored.scaleCorrection;
      MODEL_CONFIG.position = restored.position;
      MODEL_CONFIG.rotationDegrees = restored.rotationDegrees;
      MODEL_CONFIG.alignmentMode = restored.alignmentMode;
      MODEL_CONFIG.markerPhysicalWidthMm = restored.markerPhysicalWidthMm;
      syncDebugControls();
      reapplyLiveSettings();
    });
  }
  if (debugToggleBtn && debugPanelEl) {
    debugToggleBtn.addEventListener("click", function () {
      var open = debugPanelEl.style.display !== "none";
      debugPanelEl.style.display = open ? "none" : "block";
      debugToggleBtn.textContent = open ? "デバッグ表示" : "デバッグ隠す";
      updateDebug(null);
    });
  }

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

  // 初期 UI
  if (stopBtn) stopBtn.disabled = true;
  syncDebugControls();
  if (debugPanelEl) {
    debugPanelEl.style.display = DEBUG_QUERY ? "block" : "none";
  }
  if (debugToggleBtn) {
    debugToggleBtn.textContent = DEBUG_QUERY ? "デバッグ隠す" : "デバッグ表示";
  }

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

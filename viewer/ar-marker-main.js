import * as THREE from "three";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";

(function () {
  var containerEl = document.getElementById("ar-container");
  var statusEl = document.getElementById("status-text");
  var debugEl = document.getElementById("debug-text");
  var startBtn = document.getElementById("start-btn");
  var stopBtn = document.getElementById("stop-btn");
  var axesToggle = document.getElementById("axes-toggle");
  var overlayEl = document.getElementById("message-overlay");

  var TARGET_SRC = "/ar/targets.mind";
  var CUBE_SIZE = 0.4;

  var mindarThree = null;
  var anchor = null;
  var cube = null;
  var axesHelper = null;
  var ambientLight = null;
  var directionalLight = null;
  var starting = false;
  var running = false;
  var targetFound = false;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "status status-error" : "status";
  }

  function setOverlayVisible(visible) {
    if (!overlayEl) return;
    overlayEl.style.display = visible ? "flex" : "none";
  }

  function updateDebug(extra) {
    if (!debugEl) return;
    var lines = [
      "isSecureContext: " + String(window.isSecureContext),
      "running: " + String(running),
      "targetFound: " + String(targetFound),
      "targets.mind: " + TARGET_SRC,
    ];
    if (extra) {
      if (extra.name) lines.push("errorName: " + extra.name);
      if (extra.message) lines.push("errorMessage: " + extra.message);
    }
    debugEl.textContent = lines.join("\n");
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

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse(function (object) {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          for (var i = 0; i < object.material.length; i++) {
            object.material[i].dispose();
          }
        } else {
          object.material.dispose();
        }
      }
    });
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

    if (anchor && cube) {
      try {
        anchor.group.remove(cube);
      } catch (e) {}
      disposeObject3D(cube);
    }
    if (anchor && axesHelper) {
      try {
        anchor.group.remove(axesHelper);
      } catch (e) {}
      disposeObject3D(axesHelper);
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
        mindarThree.renderer.forceContextLoss &&
          mindarThree.renderer.forceContextLoss();
      } catch (e) {}
    }

    mindarThree = null;
    anchor = null;
    cube = null;
    axesHelper = null;
    ambientLight = null;
    directionalLight = null;

    clearContainer();

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setOverlayVisible(true);
    setStatus("停止済み", false);
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

  function createCubeScene() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(1, 2, 2);
    mindarThree.scene.add(ambientLight);
    mindarThree.scene.add(directionalLight);

    var geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    var material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.1,
      roughness: 0.45,
    });
    cube = new THREE.Mesh(geometry, material);
    // 下端がマーカー面（y=0）に接するよう配置
    cube.position.set(0, CUBE_SIZE / 2, 0);

    axesHelper = new THREE.AxesHelper(0.6);
    axesHelper.visible = !!(axesToggle && axesToggle.checked);

    anchor = mindarThree.addAnchor(0);
    anchor.group.add(cube);
    anchor.group.add(axesHelper);

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
    if (starting || running) return;

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

    // 前回の残骸を掃除
    stopMediaTracksInContainer();
    clearContainer();

    checkTargetsFile()
      .then(function () {
        setStatus("カメラ起動中…", false);
        mindarThree = new MindARThree({
          container: containerEl,
          imageTargetSrc: TARGET_SRC,
          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        // iOS: video に playsinline を付与
        var videos = containerEl.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          videos[i].setAttribute("playsinline", "");
          videos[i].setAttribute("webkit-playsinline", "");
          videos[i].muted = true;
          videos[i].playsInline = true;
        }

        createCubeScene();
        return mindarThree.start();
      })
      .then(function () {
        if (!starting) {
          // 開始中に停止された
          stopAR();
          return;
        }

        // start 後にも video 属性を補強
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

  window.addEventListener("pagehide", stopAR);
  window.addEventListener("beforeunload", stopAR);
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (stopBtn) stopBtn.disabled = true;
  if (!window.isSecureContext) {
    setStatus(
      "HTTPSが必要です。現在の接続はセキュアではありません。",
      true,
    );
  } else {
    setStatus("停止済み：ARを開始ボタンをタップしてください。", false);
  }
  updateDebug(null);
  setOverlayVisible(true);
})();

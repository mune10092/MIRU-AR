import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function setStatus(message, isError) {
  if (typeof window.miruSetStatus === "function") {
    window.miruSetStatus(message, isError);
    return;
  }
  var el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? "flex" : "none";
  el.style.color = isError ? "#b91c1c" : "#475569";
}

function getModelUrl() {
  var params = new URLSearchParams(window.location.search);
  return params.get("src") || "/models/demo.glb";
}

function isIOSDevice() {
  var ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function loadArrayBuffer(url) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.timeout = 30000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }
      reject(new Error("HTTP " + xhr.status));
    };
    xhr.onerror = function () {
      reject(new Error("ネットワークエラー"));
    };
    xhr.ontimeout = function () {
      reject(new Error("タイムアウト"));
    };
    xhr.send();
  });
}

function main() {
  setStatus("Three.js評価完了 / ビューア初期化中…");

  var canvasHost = document.getElementById("canvas-host");
  var resetBtn = document.getElementById("reset-btn");
  if (!canvasHost) {
    setStatus("表示領域がありません", true);
    return;
  }

  var modelUrl = getModelUrl();
  var width = canvasHost.clientWidth || 320;
  var height = canvasHost.clientHeight || 320;
  var ios = isIOSDevice();

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  var camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(2, 2, 2);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !ios,
      alpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (error) {
    setStatus(
      "WebGL初期化失敗（ロックダウンモード等を確認）: " +
        (error && error.message ? error.message : String(error)),
      true,
    );
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ios ? 1.5 : 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  canvasHost.appendChild(renderer.domElement);

  var ambient = new THREE.AmbientLight(0xffffff, 0.85);
  var directional = new THREE.DirectionalLight(0xffffff, 1.1);
  directional.position.set(4, 8, 5);
  scene.add(ambient, directional);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  var initialPosition = camera.position.clone();
  var initialTarget = controls.target.clone();

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      camera.position.copy(initialPosition);
      controls.target.copy(initialTarget);
      controls.update();
    });
  }

  window.addEventListener("resize", function () {
    var nextWidth = canvasHost.clientWidth || 1;
    var nextHeight = canvasHost.clientHeight || 1;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, ios ? 1.5 : 2),
    );
    renderer.setSize(nextWidth, nextHeight, false);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  setStatus("モデルを取得中…");

  var timedOut = false;
  var watchdog = window.setTimeout(function () {
    timedOut = true;
    setStatus(
      "モデル取得がタイムアウトしました。通信またはファイル配置を確認してください。",
      true,
    );
  }, 20000);

  loadArrayBuffer(modelUrl)
    .then(function (buffer) {
      if (timedOut) return;
      window.clearTimeout(watchdog);

      var magicBytes = new Uint8Array(buffer, 0, 4);
      var magic = String.fromCharCode(
        magicBytes[0] || 0,
        magicBytes[1] || 0,
        magicBytes[2] || 0,
        magicBytes[3] || 0,
      );
      if (magic !== "glTF") {
        throw new Error("GLB形式ではありません");
      }

      setStatus("モデルを解析中…");
      var loader = new GLTFLoader();
      return new Promise(function (resolve, reject) {
        loader.parse(buffer, "/", resolve, reject);
      });
    })
    .then(function (gltf) {
      if (!gltf || timedOut) return;
      window.clearTimeout(watchdog);

      var model = gltf.scene;
      scene.add(model);

      var box = new THREE.Box3().setFromObject(model);
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      var maxDim = Math.max(size.x, size.y, size.z, 0.001);
      var fov = THREE.MathUtils.degToRad(camera.fov);
      var distance = (maxDim * 0.6) / Math.tan(fov / 2);
      var direction = new THREE.Vector3(1, 0.85, 1).normalize();
      camera.position.copy(center).addScaledVector(direction, distance * 1.4);
      camera.near = Math.max(distance / 100, 0.01);
      camera.far = Math.max(distance * 100, 100);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.minDistance = distance * 0.2;
      controls.maxDistance = distance * 4;
      controls.update();

      initialPosition = camera.position.clone();
      initialTarget = controls.target.clone();
      if (resetBtn) resetBtn.style.display = "block";
      setStatus("");
    })
    .catch(function (error) {
      window.clearTimeout(watchdog);
      if (timedOut) return;
      console.error(error);
      setStatus(
        "読み込み失敗: " +
          (error && error.message ? error.message : String(error)),
        true,
      );
    });
}

try {
  main();
} catch (error) {
  console.error(error);
  setStatus(
    "初期化失敗: " +
      (error && error.message ? error.message : String(error)),
    true,
  );
}

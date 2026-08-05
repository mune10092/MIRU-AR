"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GlbViewerClientProps = {
  src: string;
  className?: string;
};

type LoadStage = "boot" | "fetch" | "engine" | "init" | "parse";

type LoadState =
  | { status: "loading"; stage: LoadStage }
  | { status: "ready" }
  | { status: "error"; message: string };

const BACKGROUND_COLOR = 0xf1f5f9;
const MAX_PIXEL_RATIO = 2;
const FALLBACK_SIZE = 320;
const LOAD_TIMEOUT_MS = 30000;
/** Strict Mode の二重マウントで fetch が二重起動しないよう遅延させる */
const START_DELAY_MS = 100;

const STAGE_LABEL: Record<LoadStage, string> = {
  boot: "アプリを起動中…",
  fetch: "ファイルを取得中…",
  engine: "3Dライブラリを読み込み中…",
  init: "3Dエンジンを初期化中…",
  parse: "モデルを解析中…",
};

function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function getResourcePath(modelSrc: string): string {
  const index = modelSrc.lastIndexOf("/");
  return index >= 0 ? modelSrc.slice(0, index + 1) : "/";
}

/**
 * iOS Safari では fetch + arrayBuffer がハングすることがあるため XHR を使う。
 */
function loadArrayBuffer(
  url: string,
  onProgress?: (percent: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.timeout = LOAD_TIMEOUT_MS;

    xhr.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as ArrayBuffer);
        return;
      }
      reject(new Error(`ファイル取得に失敗 (HTTP ${xhr.status})`));
    };

    xhr.onerror = () => {
      reject(new Error("ネットワークエラーでファイルを取得できませんでした"));
    };

    xhr.ontimeout = () => {
      reject(new Error("ファイル取得がタイムアウトしました"));
    };

    xhr.send();
  });
}

export default function GlbViewerClient({
  src,
  className = "",
}: GlbViewerClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    stage: "boot",
  });
  const [fetchPercent, setFetchPercent] = useState<number | null>(null);

  const handleReset = useCallback(() => {
    resetViewRef.current?.();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let startTimer = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controls: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scene: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ambientLight: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let directionalLight: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let THREE: any = null;

    const setSafeLoadState = (next: LoadState) => {
      if (!disposed) setLoadState(next);
    };

    const disposeObject3D = (root: {
      traverse: (fn: (o: unknown) => void) => void;
    }) => {
      root.traverse((object) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = object as any;
        if (!obj.isMesh) return;
        obj.geometry?.dispose?.();
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const material of materials) {
          if (!material) continue;
          for (const value of Object.values(material)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (value && (value as any).isTexture) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (value as any).dispose?.();
            }
          }
          material.dispose?.();
        }
      });
    };

    const cleanupGraphics = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }

      resizeObserver?.disconnect();
      resizeObserver = null;

      controls?.dispose?.();
      controls = null;

      if (model && scene) {
        scene.remove(model);
        disposeObject3D(model);
        model = null;
      }

      if (scene && ambientLight && directionalLight) {
        scene.remove(ambientLight, directionalLight);
      }
      ambientLight?.dispose?.();
      directionalLight?.dispose?.();
      ambientLight = null;
      directionalLight = null;
      scene = null;

      if (renderer) {
        renderer.dispose();
        const canvas = renderer.domElement as HTMLCanvasElement;
        if (canvas.parentNode === container) {
          container.removeChild(canvas);
        }
        renderer = null;
      }
    };

    const init = async () => {
      try {
        setSafeLoadState({ status: "loading", stage: "fetch" });
        setFetchPercent(null);

        const absoluteUrl = new URL(src, window.location.href).toString();
        const arrayBuffer = await loadArrayBuffer(absoluteUrl, (percent) => {
          if (!disposed) setFetchPercent(percent);
        });
        if (disposed) return;

        const magicBytes = new Uint8Array(arrayBuffer, 0, 4);
        const magic = String.fromCharCode(
          magicBytes[0] ?? 0,
          magicBytes[1] ?? 0,
          magicBytes[2] ?? 0,
          magicBytes[3] ?? 0,
        );
        if (magic !== "glTF") {
          throw new Error(
            "GLBファイルではありません。public/models/demo.glb の配置を確認してください",
          );
        }

        setSafeLoadState({ status: "loading", stage: "engine" });

        THREE = await import("three");
        const { OrbitControls } = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );
        const { GLTFLoader } = await import(
          "three/examples/jsm/loaders/GLTFLoader.js"
        );

        if (disposed) return;

        setSafeLoadState({ status: "loading", stage: "init" });
        if (disposed) return;

        const width = Math.max(container.clientWidth, FALLBACK_SIZE);
        const height = Math.max(container.clientHeight, FALLBACK_SIZE);
        const ios = isIOSDevice();

        scene = new THREE.Scene();
        scene.background = new THREE.Color(BACKGROUND_COLOR);

        const camera = new THREE.PerspectiveCamera(
          45,
          width / height,
          0.1,
          1000,
        );
        camera.position.set(2, 2, 2);

        renderer = new THREE.WebGLRenderer({
          antialias: !ios,
          alpha: false,
          powerPreference: "default",
          failIfMajorPerformanceCaveat: false,
        });
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, ios ? 1.5 : MAX_PIXEL_RATIO),
        );
        renderer.setSize(width, height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.touchAction = "none";
        container.appendChild(renderer.domElement);

        ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
        directionalLight.position.set(4, 8, 5);
        scene.add(ambientLight, directionalLight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.touches = {
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        };

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || disposed || !renderer) return;
          const { width: nextWidth, height: nextHeight } = entry.contentRect;
          if (nextWidth <= 0 || nextHeight <= 0) return;

          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, ios ? 1.5 : MAX_PIXEL_RATIO),
          );
          renderer.setSize(nextWidth, nextHeight, false);
        });
        resizeObserver.observe(container);

        const animate = () => {
          if (disposed || !renderer || !controls) return;
          frameId = window.requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        setSafeLoadState({ status: "loading", stage: "parse" });

        const loader = new GLTFLoader();
        const gltf = await new Promise<{ scene: typeof model }>(
          (resolve, reject) => {
            loader.parse(arrayBuffer, getResourcePath(src), resolve, reject);
          },
        );

        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }

        model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = (maxDim * 0.6) / Math.tan(fov / 2);
        const direction = new THREE.Vector3(1, 0.85, 1).normalize();
        camera.position.copy(center).addScaledVector(direction, distance * 1.4);
        camera.near = Math.max(distance / 100, 0.01);
        camera.far = Math.max(distance * 100, 100);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.minDistance = distance * 0.2;
        controls.maxDistance = distance * 4;
        controls.update();

        const initialPosition = camera.position.clone();
        const initialTarget = controls.target.clone();
        resetViewRef.current = () => {
          camera.position.copy(initialPosition);
          controls.target.copy(initialTarget);
          controls.update();
        };

        setSafeLoadState({ status: "ready" });
      } catch (error) {
        if (disposed) return;
        console.error("Failed to initialize or load GLB viewer:", error);
        const detail =
          error instanceof Error && error.message
            ? `（${error.message}）`
            : "";
        setSafeLoadState({
          status: "error",
          message: `読み込みに失敗しました${detail}`,
        });
      }
    };

    // Strict Mode: 1回目の mount はすぐ unmount されるため、遅延後にまだ生存していれば開始
    startTimer = window.setTimeout(() => {
      if (disposed) return;
      void init();
    }, START_DELAY_MS);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      resetViewRef.current = null;
      cleanupGraphics();
    };
  }, [src]);

  return (
    <div className={`relative h-64 w-full sm:h-80 ${className}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden rounded-md"
      />

      {loadState.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-slate-100/80 px-4 text-center text-sm text-slate-600">
          <p>{STAGE_LABEL[loadState.stage]}</p>
          {loadState.stage === "fetch" && fetchPercent !== null && (
            <p className="font-medium tabular-nums">{fetchPercent}%</p>
          )}
        </div>
      )}

      {loadState.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-100 p-4 text-center text-sm leading-6 text-red-700">
          {loadState.message}
        </div>
      )}

      {loadState.status === "ready" && (
        <div className="absolute bottom-3 right-3 z-10">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-white"
          >
            初期表示へ戻す
          </button>
        </div>
      )}
    </div>
  );
}

import * as esbuild from "esbuild";
import { transformSync } from "@babel/core";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const rawFile = "public/ar-marker.raw.js";
const outFile = "public/ar-marker.bundle.js";
const banner =
  "(function(){var s=document.getElementById('status-text');if(s){s.textContent='バンドル評価開始…';}})();";

/** MindAR 同梱コードが参照する Node 組み込みをブラウザ向けにスタブする */
const stubNodeBuiltinsPlugin = {
  name: "stub-node-builtins",
  setup(build) {
    const names = ["fs", "path", "util", "stream", "buffer", "crypto", "os"];
    for (const name of names) {
      build.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({
        path: name,
        namespace: "node-stub",
      }));
    }
    build.onLoad({ filter: /.*/, namespace: "node-stub" }, (args) => {
      if (args.path === "buffer") {
        return {
          contents: `
            export class Buffer extends Uint8Array {
              static from(data) {
                if (typeof data === "string") {
                  return new Uint8Array(new TextEncoder().encode(data));
                }
                return new Uint8Array(data || []);
              }
              static isBuffer() { return false; }
              static alloc(size) { return new Uint8Array(size || 0); }
            }
            export default { Buffer };
          `,
          loader: "js",
        };
      }
      return { contents: "export default {};", loader: "js" };
    });
  },
};

await esbuild.build({
  entryPoints: ["viewer/ar-marker-main.js"],
  bundle: true,
  format: "iife",
  outfile: rawFile,
  minify: false,
  target: ["es2020"],
  platform: "browser",
  mainFields: ["browser", "module", "main"],
  // MindAR 1.2.5 は sRGBEncoding を使うため three@0.160 に固定（既存 GLB ビューアの three@0.185 は維持）
  alias: {
    three: "three-for-mindar",
  },
  plugins: [stubNodeBuiltinsPlugin],
});

const raw = readFileSync(rawFile, "utf8");
const transpiled = transformSync(raw, {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: { ios: "14.0", safari: "14.0" },
        modules: false,
      },
    ],
  ],
  compact: true,
  comments: false,
  babelrc: false,
  configFile: false,
});

if (!transpiled || !transpiled.code) {
  throw new Error("Babel transpile failed");
}

writeFileSync(outFile, `${banner}\n${transpiled.code}`);
unlinkSync(rawFile);

console.log(`built ${outFile} (mind-ar + three@0.160, babel ios/safari 14)`);

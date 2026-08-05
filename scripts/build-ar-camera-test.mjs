import * as esbuild from "esbuild";
import { transformSync } from "@babel/core";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const rawFile = "public/ar-camera-test.raw.js";
const outFile = "public/ar-camera-test.bundle.js";
const banner =
  "(function(){var s=document.getElementById('status-text');if(s){s.textContent='バンドル評価開始…';}})();";

await esbuild.build({
  entryPoints: ["viewer/ar-camera-test-main.js"],
  bundle: true,
  format: "iife",
  outfile: rawFile,
  minify: false,
  target: ["es2020"],
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

console.log(`built ${outFile} (babel targets ios/safari 14)`);

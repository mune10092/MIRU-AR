import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const files = [
  "/glb-viewer.bundle.js",
  "/ar-camera-test.bundle.js",
  "/ar-marker.bundle.js",
  "/ar-calibration.bundle.js",
];

const hashes = {};
for (const publicPath of files) {
  const diskPath = `public${publicPath}`;
  if (!existsSync(diskPath)) continue;
  hashes[publicPath] = createHash("sha256")
    .update(readFileSync(diskPath))
    .digest("hex")
    .slice(0, 10);
}

const meta = {
  generatedAt: new Date().toISOString(),
  files: hashes,
};

writeFileSync("public/build-meta.json", `${JSON.stringify(meta)}\n`);
console.log("wrote public/build-meta.json", hashes);

import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

function getLanIPv4Addresses() {
  const addresses = [];
  for (const adapters of Object.values(networkInterfaces())) {
    for (const adapter of adapters ?? []) {
      if (String(adapter.family) === "IPv4" && !adapter.internal) {
        addresses.push(adapter.address);
      }
    }
  }
  return addresses;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function ensurePortFree(port) {
  if (process.platform !== "win32") return;

  const result = spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$conns = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; if (-not $conns) { exit 0 }; $ids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $ids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: "inherit", shell: false },
  );

  await new Promise((resolve) => result.on("exit", resolve));
}

const lanIps = getLanIPv4Addresses();
const host = "0.0.0.0";
const displayIp = lanIps[0] ?? "127.0.0.1";

console.log("");
console.log("iPad向けLANサーバー（本番モード）を起動します");
console.log("  ※ next dev の cross-origin 制限を避けるため build + start を使います");
console.log(`  PC:   http://localhost:3000`);
console.log(`  iPad: http://${displayIp}:3000`);
console.log("");

try {
  await run("npx", ["next", "build"]);
  console.log("");
  console.log("本番サーバーを起動中...");
  console.log(`iPad ではプライベートブラウズで http://${displayIp}:3000/tools/gauge-001 を開いてください`);
  console.log("");

  console.log("ポート 3000 が使用中なら解放します...");
  await ensurePortFree(3000);
  await run("npx", ["next", "start", "-H", host, "-p", "3000"]);
} catch (error) {
  console.error(error);
  console.error("");
  console.error("ヒント: ポート3000が使用中の場合は、他の npm run dev / start を Ctrl+C で止めてから再実行してください。");
  process.exit(1);
}

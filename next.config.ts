import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function getLanIPv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const adapters of Object.values(networkInterfaces())) {
    for (const adapter of adapters ?? []) {
      if (String(adapter.family) === "IPv4" && !adapter.internal) {
        addresses.push(adapter.address);
      }
    }
  }
  return addresses;
}

/**
 * iPad などから LAN IP で開くと、Next.js 開発サーバーは
 * /_next/* を cross-origin としてブロックすることがある。
 * - サーバーをそのIPで listen する（npm run dev:lan）
 * - ここに LAN IP を列挙する
 * の両方で回避する。
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...getLanIPv4Addresses(),
    ...(process.env.ALLOWED_DEV_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []),
  ],
};

export default nextConfig;

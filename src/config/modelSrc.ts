/**
 * 測定具 GLB の公開切替（秘密情報ではない）
 *
 * このファイルだけを見れば、ローカル実測定具と Netlify 公開テストの
 * どちらを読むかが分かる。パスを他ファイルへ直書きしないこと。
 *
 * NEXT_PUBLIC_MIRU_PUBLIC_TEST=true  → /models/demo-public.glb
 * 未設定または false                 → /models/demo.glb
 *
 * 実測定具 demo.glb は Git 管理外。Netlify へは出さない。
 */
export const LOCAL_MODEL_SRC = "/models/demo.glb";
export const PUBLIC_TEST_MODEL_SRC = "/models/demo-public.glb";

export function isPublicTestMode(
  flag: string | undefined = process.env.NEXT_PUBLIC_MIRU_PUBLIC_TEST,
): boolean {
  const value = String(flag ?? "").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function getDefaultModelSrc(): string {
  return isPublicTestMode() ? PUBLIC_TEST_MODEL_SRC : LOCAL_MODEL_SRC;
}

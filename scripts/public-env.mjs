/** 静的バンドルへ埋め込む公開テストフラグ（秘密情報ではない） */
export const publicTestDefine = {
  "process.env.NEXT_PUBLIC_MIRU_PUBLIC_TEST": JSON.stringify(
    process.env.NEXT_PUBLIC_MIRU_PUBLIC_TEST ?? "",
  ),
};

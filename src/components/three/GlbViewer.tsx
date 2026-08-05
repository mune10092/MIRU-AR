"use client";

import GlbViewerClient, {
  type GlbViewerClientProps,
} from "./GlbViewerClient";

export type GlbViewerProps = GlbViewerClientProps;

/**
 * 3Dビューアの公開エントリ。
 * iPad Safari で next/dynamic(ssr:false) の読み込みが止まると
 * 「準備中…」のままになるため、dynamic は使わず Client Component を直接描画する。
 * window / WebGL へのアクセスは GlbViewerClient 内の useEffect のみ。
 */
export function GlbViewer(props: GlbViewerProps) {
  return <GlbViewerClient {...props} />;
}

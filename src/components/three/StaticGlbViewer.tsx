type StaticGlbViewerProps = {
  src: string;
  className?: string;
};

/**
 * Next.js / React のハイドレーションに依存しない 3D ビューア。
 * SSR HTML の iframe だけで動くため、iPad で /_next が止まっても表示できる。
 */
export function StaticGlbViewer({ src, className = "" }: StaticGlbViewerProps) {
  const viewerUrl = `/glb-viewer.html?src=${encodeURIComponent(src)}`;

  return (
    <div className={`relative h-64 w-full sm:h-80 ${className}`}>
      <iframe
        title="GLB 3Dビューア"
        src={viewerUrl}
        className="h-full w-full rounded-md border-0 bg-slate-100"
        allow="fullscreen"
      />
    </div>
  );
}

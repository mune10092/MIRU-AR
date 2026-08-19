import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsProbe } from "@/components/JsProbe";
import { StaticGlbViewer } from "@/components/three/StaticGlbViewer";
import { getDefaultModelSrc } from "@/config/modelSrc";
import { getStatusClassName, getStatusLabel } from "@/lib/status";
import { getToolById, getTools } from "@/lib/tools";

type ToolDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateStaticParams() {
  return getTools().map((tool) => ({ id: tool.id }));
}

export async function generateMetadata({
  params,
}: ToolDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const tool = getToolById(id);

  if (!tool) {
    return { title: "測定具が見つかりません" };
  }

  return { title: tool.name };
}

export default async function ToolDetailPage({ params }: ToolDetailPageProps) {
  const { id } = await params;
  const tool = getToolById(id);

  if (!tool) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/tools"
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← 測定具一覧に戻る
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {tool.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">ID: {tool.id}</p>
          </div>
          <span
            className={`inline-flex w-fit rounded px-2.5 py-1 text-xs font-medium ${getStatusClassName(tool.status)}`}
          >
            {getStatusLabel(tool.status)}
          </span>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          {tool.description}
        </p>
        <p className="mt-3 text-xs text-slate-400">更新日: {tool.updatedAt}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex min-h-56 flex-col rounded-lg border border-slate-200 bg-white p-5 sm:min-h-72">
          {tool.id === "gauge-001" ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    3Dビュー
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    マウスまたはタッチで回転・拡大縮小・平行移動できます。
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <JsProbe />
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <StaticGlbViewer src={getDefaultModelSrc()} />
                </div>
                <a
                  href="/ar-camera-test.html"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  ARカメラ動作テスト
                </a>
                <p className="text-xs text-slate-500">
                  iPad Safari の背面カメラ起動確認用です（iframe ではなく別ページで開きます）。
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-slate-900">
                3Dビュー（未実装）
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                PC向け: Three.js による GLB 表示エリアのプレースホルダです。
              </p>
              <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                3Dプレビュー予定
              </div>
            </>
          )}
        </section>

        <section className="flex min-h-56 flex-col rounded-lg border border-slate-200 bg-white p-5 sm:min-h-72">
          {tool.id === "gauge-001" ? (
            <>
              <h2 className="text-sm font-semibold text-slate-900">AR表示</h2>
              <p className="mt-2 text-sm text-slate-500">
                MindAR による画像マーカートラッキングです。HTTPS で直接開きます。
              </p>
              <div className="mt-4 space-y-3">
                <a
                  href="/ar-marker.html"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                >
                  AR表示
                </a>
                <p className="text-xs text-slate-500">
                  iframe ではなく別ページで開きます。HTTPS（Netlify）が必要です。
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-slate-900">
                AR表示（未実装）
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                iPhone向け: MindAR による原寸大AR表示エリアのプレースホルダです。
              </p>
              <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                AR表示予定
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

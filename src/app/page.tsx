import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <p className="text-sm font-medium text-slate-500">MIRU-AR</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          AR測定具レビュー
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          CADから出力したGLB形式の測定具を、PCでは通常の3Dモデルとして確認し、
          iPhoneでは画像マーカー上に原寸大AR表示するためのWebアプリです。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/tools"
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800"
          >
            測定具一覧を見る
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">PC（予定）</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Three.js による GLB の3D表示・回転・ズーム確認（未実装）
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">iPhone（予定）</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            MindAR による画像マーカー上の原寸大AR表示（未実装）
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          このステップの範囲
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          画面遷移とレスポンシブな仮UIのみを実装しています。3D / AR / Supabase /
          ログインなどは後続ステップで追加します。
        </p>
      </section>
    </div>
  );
}

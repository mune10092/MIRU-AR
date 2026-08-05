import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-2xl font-bold text-slate-900">ページが見つかりません</h1>
      <p className="text-sm text-slate-600">
        指定された測定具は存在しないか、URLが正しくありません。
      </p>
      <Link
        href="/tools"
        className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
      >
        測定具一覧へ
      </Link>
    </div>
  );
}

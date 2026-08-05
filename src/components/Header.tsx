import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-wide text-slate-900 sm:text-base"
        >
          AR測定具レビュー
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-900">
            トップ
          </Link>
          <Link href="/tools" className="hover:text-slate-900">
            測定具一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}

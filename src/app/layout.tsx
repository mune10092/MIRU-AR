import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { getDefaultModelSrc } from "@/config/modelSrc";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AR測定具レビュー",
    template: "%s | AR測定具レビュー",
  },
  description:
    "CADから出力した測定具をPCで3D確認し、iPhoneで原寸大AR表示するレビューアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script
          id="miru-model-src"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.MIRU_DEFAULT_MODEL_SRC=${JSON.stringify(getDefaultModelSrc())};`,
          }}
        />
        {/* /_next チャンクに依存しない静的JS（iPad切り分け用） */}
        <Script src="/ipad-probe.js" strategy="beforeInteractive" />
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-500 sm:px-6">
            AR測定具レビュー — 開発ステップ1（土台）
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { ToolCard } from "@/components/ToolCard";
import { getTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "測定具一覧",
};

export default function ToolsPage() {
  const tools = getTools();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          測定具一覧
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
          仮のモックデータです。カードを選択すると詳細画面へ遷移します。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}

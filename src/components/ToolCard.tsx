import Link from "next/link";
import type { Tool } from "@/data/tools";
import { getStatusClassName, getStatusLabel } from "@/lib/status";

type ToolCardProps = {
  tool: Tool;
};

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <Link
      href={`/tools/${tool.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
          {tool.name}
        </h2>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${getStatusClassName(tool.status)}`}
        >
          {getStatusLabel(tool.status)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
        {tool.description}
      </p>
      <p className="mt-3 text-xs text-slate-400">更新日: {tool.updatedAt}</p>
    </Link>
  );
}

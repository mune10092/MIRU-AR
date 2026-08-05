import type { ToolStatus } from "@/data/tools";

const statusLabelMap: Record<ToolStatus, string> = {
  draft: "下書き",
  review: "レビュー中",
  approved: "承認済み",
};

const statusClassMap: Record<ToolStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
};

export function getStatusLabel(status: ToolStatus): string {
  return statusLabelMap[status];
}

export function getStatusClassName(status: ToolStatus): string {
  return statusClassMap[status];
}

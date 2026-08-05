export type ToolStatus = "draft" | "review" | "approved";

export type Tool = {
  id: string;
  name: string;
  description: string;
  status: ToolStatus;
  updatedAt: string;
};

export const tools: Tool[] = [
  {
    id: "gauge-001",
    name: "シャフト径測定ゲージ",
    description:
      "シャフト外径の合否判定用測定具。φ12〜φ20 の段差ピン形状を想定したモックデータです。",
    status: "approved",
    updatedAt: "2026-07-28",
  },
  {
    id: "gauge-002",
    name: "フランジ穴位置治具",
    description:
      "フランジ端面の穴位置・ピッチ円を確認する測定治具のモックです。後続ステップで GLB を表示します。",
    status: "review",
    updatedAt: "2026-08-01",
  },
  {
    id: "gauge-003",
    name: "板厚チェックプレート",
    description:
      "板金部品の板厚確認用プレート。原寸大 AR 表示の検証対象として用意した仮データです。",
    status: "draft",
    updatedAt: "2026-08-03",
  },
  {
    id: "gauge-004",
    name: "キー溝幅測定ブロック",
    description:
      "キー溝幅の通り・寸法を確認するブロック型測定具。レビューコメント連携前のプレースホルダです。",
    status: "review",
    updatedAt: "2026-08-04",
  },
  {
    id: "gauge-005",
    name: "端面角度確認治具",
    description:
      "端面の角度・平面度確認用の仮測定具データ。PC 3D ビューと iPhone AR の差し込み位置確認に使います。",
    status: "draft",
    updatedAt: "2026-08-05",
  },
];

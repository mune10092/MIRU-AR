# AR測定具レビュー

CADから出力したGLB形式の測定具を、PCでは通常の3Dモデルとして確認し、iPhoneでは画像マーカー上に原寸大AR表示するWebアプリです。

## 技術構成（最終想定）

- Next.js App Router
- TypeScript
- Tailwind CSS
- Three.js
- MindAR
- Supabase
- Netlify

## 開発ステップ（このリポジトリの現状）

実装済み:

- トップページ (`/`)
- 仮の測定具一覧 (`/tools`)
- 仮の測定具詳細 (`/tools/[id]`)
- レスポンシブな仮UI
- Netlify デプロイ想定の設定 (`netlify.toml`)
- `.env.example`
- Three.js による GLB 3Dビューア（`/tools/gauge-001`、静的 iframe ビューア）
- ARカメラ動作テスト（`/ar-camera-test.html`、背面カメラ起動確認のみ）
- ARマーカーテスト（`/ar-marker.html`、MindAR + GLB / デバッグ立方体）
- 本 README

未実装（後続ステップ）:

- GLB の原寸大AR表示
- Supabase
- ログイン
- QRコード
- コメント

## 必要環境

- Node.js 20 以上（推奨）
- npm

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` の値はステップ1では空のままで動作します。Supabase 接続は後続で追加します。

## ローカル起動

```bash
npm run dev
```

- PCのみ: [http://localhost:3000](http://localhost:3000)

### iPad から確認する場合（重要）

`next dev` は LAN 経由の `/_next/*` をブロックすることがあり、iPad では
「アプリを起動中…」のまま止まることがあります。

**iPad確認時は次を使ってください（build + 本番サーバー）:**

```bash
npm run dev:lan
```

起動後の URL 例:

```text
iPad: http://192.168.221.194:3000
```

1. 既存サーバーを止める（Ctrl+C）
2. `npm run dev:lan` を実行（初回は build のため少し時間がかかります）
3. iPad Safari の **プライベートブラウズ** で上記 URL を開く
4. `/tools/gauge-001` で確認する

画面上の「JS診断」が `インラインOK / GLB到達OK` になっていれば通信は正常です。

### ARカメラ動作テスト（STEP3-A）

```text
/ar-camera-test.html
```

- gauge-001 詳細の「ARカメラ動作テスト」から直接遷移
- **カメラは HTTPS（または localhost）が必要**

### ARマーカーテスト（STEP3-B / STEP4-A）

```text
/ar-marker.html
```

1. `public/ar/targets.mind` を配置（[配置手順](public/ar/README.md)）
2. `public/models/demo.glb` を配置（[モデル手順](public/models/README.md)）
3. Netlify の **https** URL、または `localhost` で開く
4. 「ARを開始」→ 印刷マーカーを映す → GLB（またはデバッグ立方体）が表示される
5. 「デバッグ表示」で実モデル/立方体切替、回転、配置モードを確認

#### 倍率の単位（STEP4-A）

- glTF = メートル
- MindAR ターゲット幅 = 1
- `markerPhysicalWidthMm > 0` のとき `finalScale = (1000 / markerPhysicalWidthMm) * scaleCorrection`
- `markerPhysicalWidthMm === 0` のときは `scaleCorrection` のみ（表示確認用）

## 主な画面

| パス | 内容 |
|------|------|
| `/` | アプリ概要と一覧への導線 |
| `/tools` | 測定具の仮一覧 |
| `/tools/gauge-001` | 測定具詳細 + GLBビューア + AR導線 |
| `/ar-camera-test.html` | 背面カメラ起動テスト |
| `/ar-marker.html` | MindAR マーカー + GLB/立方体 AR |
| `/tools/gauge-002` など | 測定具詳細（プレースホルダ） |

## GLB の配置

詳細は [public/models/README.md](public/models/README.md) を参照してください。

```bash
# 例: ローカルに demo.glb を置く（Git には含めない）
# public/models/demo.glb
```

## スクリプト

```bash
npm run dev    # 開発サーバー
npm run lint   # ESLint
npm run build  # 本番ビルド
npm run start  # 本番サーバー（build 後）
```

## Netlify へのデプロイ

1. このリポジトリを Git 連携で Netlify に接続する
2. ビルド設定は `netlify.toml` を参照（`npm run build`、`@netlify/plugin-nextjs`）
3. 環境変数は Netlify の UI で `.env.example` に準拠して設定する（後続ステップ）

ローカルから CLI でデプロイする場合の例:

```bash
npx netlify deploy --build
```

## ディレクトリ構成（抜粋）

```
src/
  app/                 # App Router ページ
  components/          # Header, ToolCard
  components/three/    # GLB 3Dビューア（Client Component）
  data/tools.ts        # 仮の測定具データ
  lib/tools.ts         # 取得ヘルパー（将来 Supabase 差し替え用）
public/models/         # GLB配置先（*.glb は Git 除外）
netlify.toml
.env.example
```

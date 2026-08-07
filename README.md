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
- ARマーカーテスト（`/ar-marker.html`、MindAR + 原寸GLB / デバッグ立方体）
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

### ARマーカーテスト（STEP3-B / STEP4-A / STEP4-B）

```text
/ar-marker.html
```

デバッグ詳細パネル:

```text
/ar-marker.html?debug=1
```

1. `public/ar/targets.mind` を配置（[配置手順](public/ar/README.md)）
2. `public/models/demo.glb` を配置（[モデル手順](public/models/README.md)）
3. Netlify の **https** URL、または `localhost` で開く
4. 「ARを開始」→ 印刷マーカーを映す → GLB（またはデバッグ立方体）が表示される
5. `?debug=1` でマーカー実幅・位置・回転・倍率補正を調整し、「適用」「設定保存」

#### 原寸倍率の仕組み（STEP4-B）

MindAR は認識画像の横幅を AR 座標上の **1** として扱います。  
GLB / glTF の距離単位は **メートル** です。

```text
markerWidthMeters = markerPhysicalWidthMm / 1000
baseScale         = 1 / markerWidthMeters
                  = 1000 / markerPhysicalWidthMm
finalScale        = baseScale * scaleCorrection
```

例: 認識画像の実印刷幅が 250mm、CAD 上 400mm のモデル（GLB 上 0.4m）の場合

```text
markerWidthMeters = 0.25
baseScale         = 4
finalScale        = 4（scaleCorrection=1）

AR上のモデル幅 = 0.4 × 4 = 1.6
実世界換算     = 250mm × 1.6 = 400mm  → 理論上の原寸
```

注意:

- `markerPhysicalWidthMm` は用紙幅ではなく、**認識画像が印刷物上で占める横幅**（定規で実測）
- 印刷時に「用紙に合わせる」「ページにフィット」「縮小して印刷」を使うと実寸が変わります
- `markerPhysicalWidthMm === 0` のときは「原寸未設定」（表示確認用）
- 倍率は geometry に焼き込まず `Object3D.scale` に適用します

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

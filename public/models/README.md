# 測定具 GLB モデル

このディレクトリに CAD から出力した GLB ファイルを配置します。

## 注意

- `*.glb` は Git 管理対象外です（`.gitignore` で除外）
- 実ファイルをリポジトリにコミットしないでください

## demo.glb の配置手順（通常3D / AR 共通）

1. CAD などから GLB を書き出す
2. ファイル名を `demo.glb` にする
3. このディレクトリへコピーする

配置後のパス:

```text
public/models/demo.glb
```

ブラウザからの URL:

```text
/models/demo.glb
```

## 通常3Dビューアでの確認

```text
http://localhost:3000/tools/gauge-001
```

## AR（MindAR）での確認

```text
http://localhost:3000/ar-marker.html
```

デバッグ（原寸・原点・向き調整）:

```text
http://localhost:3000/ar-marker.html?debug=1
```

または Netlify の https URL:

```text
https://<サイト>/ar-marker.html?debug=1
```

1. `public/ar/targets.mind` も配置する
2. 「ARを開始」→ マーカーを映す
3. `?debug=1` で実モデル/立方体切替、位置・回転・マーカー実幅を調整可能

### AR の単位・原寸倍率（STEP4-B）

- glTF の距離単位は **メートル (m)** として扱う
- MindAR の画像ターゲット空間は **認識画像横幅 = 1** が基準
- `markerPhysicalWidthMm` は用紙幅ではなく、認識画像の印刷実幅（mm）

```text
markerWidthMeters = markerPhysicalWidthMm / 1000
baseScale         = 1 / markerWidthMeters = 1000 / markerPhysicalWidthMm
finalScale        = baseScale * scaleCorrection
```

例（認識画像実幅 250mm、CAD 400mm = GLB 0.4m）:

```text
baseScale = 4
AR上サイズ = 0.4 × 4 = 1.6
実世界換算 = 250mm × 1.6 = 400mm（理論上原寸）
```

- `markerPhysicalWidthMm === 0` のとき: 原寸未設定（`scaleCorrection` のみ）
- 倍率は geometry に焼き込まず、`Object3D.scale` で適用する
- 印刷時の「フィット / 縮小」に注意し、必ず定規で実測すること

## calibration-100mm.glb（STEP5 原寸校正用）

CAD で **100 × 100 × 100 mm** の立方体を作成し、測定具と同じエクスポート条件で GLB 化します。

```text
public/models/calibration-100mm.glb
```

URL:

```text
/models/calibration-100mm.glb
```

確認ページ（管理者用）:

```text
/ar-calibration.html
```

- Git 管理外（`*.glb` は gitignore）
- 無くても build は成功。実行時のみエラー表示
- 校正結果は `miru-ar-calibration-settings`（localStorage）へ保存
- 実測定具用 `miru-ar-model-settings-v1` は上書きしない

## ビルドについて

ファイルが無い場合でも `npm run lint` / `npm run build` は成功します。  
実行時にビューア / AR 画面へ読み込みエラーが表示されます。

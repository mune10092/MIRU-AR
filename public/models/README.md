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

または Netlify の https URL:

```text
https://<サイト>/ar-marker.html
```

1. `public/ar/targets.mind` も配置する
2. 「ARを開始」→ マーカーを映す
3. デバッグパネルで「実モデル / 立方体」を切り替え可能

### AR の単位・倍率（STEP4-A）

- glTF の距離単位は **メートル (m)** として扱う
- MindAR の画像ターゲット空間は **マーカー幅 = 1** が基準
- `markerPhysicalWidthMm === 0` のとき: `finalScale = scaleCorrection`
- `markerPhysicalWidthMm > 0` のとき:
  - `baseScale = 1000 / markerPhysicalWidthMm`
  - `finalScale = baseScale * scaleCorrection`
- 倍率は geometry に焼き込まず、`Object3D.scale` で適用する
- 原寸の最終校正は次の STEP で行う

## ビルドについて

ファイルが無い場合でも `npm run lint` / `npm run build` は成功します。  
実行時にビューア / AR 画面へ読み込みエラーが表示されます。

# AR マーカー素材

このディレクトリに MindAR 用ファイルを配置します。

## 必要なファイル

| ファイル | 説明 |
|---------|------|
| `targets.mind` | MindAR コンパイラで生成した画像ターゲット |
| `marker-test.png` | 印刷用の試験マーカー画像（任意・参照用） |

## 配置例

```text
public/ar/targets.mind
public/ar/marker-test.png
```

ブラウザからの URL:

```text
/ar/targets.mind
/ar/marker-test.png
```

## 注意

- `targets.mind` が無くても `npm run build` は成功します
- 実行時にファイルが無い場合は AR 画面にエラーが表示されます
- マーカーは MindAR Image Target 用にコンパイルしたものを使ってください
  （公式コンパイラ: https://hiukim.github.io/mind-ar-js-doc/tools/compile）

## 確認

1. Netlify の https URL、または `localhost` で開く
2. `/ar-marker.html` で「ARを開始」
3. 印刷したマーカーをカメラに映すと GLB（またはデバッグ立方体）が表示されます
4. `public/models/demo.glb` の配置は [models README](../models/README.md) を参照

# 測定具 GLB モデル

このディレクトリに CAD から出力した GLB ファイルを配置します。

## 注意

- `*.glb` は Git 管理対象外です（`.gitignore` で除外）
- 実ファイルをリポジトリにコミットしないでください

## demo.glb の配置手順

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

## 確認

開発サーバー起動後、次の詳細画面で 3D ビューアが表示されます。

```text
http://localhost:3000/tools/gauge-001
```

ファイルが無い場合でもアプリのビルドは成功します。ビューア上に読み込みエラーが表示されます。

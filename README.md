# Toybox

Toybox is a growing Obsidian plugin for small, focused workflow helpers.

Toybox は、小さく実用的なワークフロー補助をまとめていく Obsidian プラグインです。

## Features

- URL opener: left-click HTTP(S) links to open them in an Obsidian web view.
- Browser handoff: middle-click HTTP(S) links to open them in the default browser.
- Twitter/X embed paste: paste post links as Obsidian tweet embeds.
- Mermaid enhancer: add zoom controls and scrollable viewports to rendered Mermaid diagrams.
- Localized settings: plugin settings are shown in Japanese or English.

## 機能

- URL オープナー: HTTP(S) リンクを左クリックで Obsidian 内の Web ビューに開きます。
- ブラウザ連携: HTTP(S) リンクを中クリックで既定のブラウザに送ります。
- Twitter/X 埋め込み貼り付け: 投稿リンクを貼り付けると Obsidian のツイート埋め込み形式に変換します。
- Mermaid 拡張: レンダリング済み Mermaid 図にズーム操作とスクロール可能な表示領域を追加します。
- 日英対応設定: プラグイン設定画面を日本語または英語で表示します。

## Development

```bash
npm install
npm run dev
```

Build a production bundle with:

```bash
npm run build
```

## 開発

```bash
npm install
npm run dev
```

本番用バンドルは次のコマンドで生成します。

```bash
npm run build
```

## Optional Local Deploy

Builds and dev rebuilds can automatically deploy `main.js`, `manifest.json`,
and `styles.css` to a local Obsidian plugins folder.

Create `.toybox.local.json` in the project root. This file is ignored by Git.

```json
{
  "deployDir": "/absolute/path/to/vault/.obsidian/plugins/toybox"
}
```

You can also set `TOYBOX_DEPLOY_DIR` instead of creating the local config file.

## 任意のローカルデプロイ

ビルドまたは開発中の再ビルド後に、`main.js`、`manifest.json`、`styles.css` をローカルの Obsidian plugins フォルダへ自動コピーできます。

プロジェクト直下に `.toybox.local.json` を作成してください。このファイルは Git の対象外です。

```json
{
  "deployDir": "/absolute/path/to/vault/.obsidian/plugins/toybox"
}
```

ローカル設定ファイルの代わりに、環境変数 `TOYBOX_DEPLOY_DIR` も使えます。

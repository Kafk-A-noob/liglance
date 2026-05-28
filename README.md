# linear-glance

Linear の Issue を Mac で「チラ見」するための個人ツール群（モノレポ）。

## パッケージ

| パッケージ | 形態 | 用途 |
|---|---|---|
| [`packages/widget`](packages/widget) | Übersicht ウィジェット | 壁紙レイヤーに常駐表示。邪魔せず常に見える |
| [`packages/menubar`](packages/menubar) | Tauri メニューバーアプリ | メニューバーから即座にドロップダウン表示。クリックで最前面 |

両方とも **macOS Keychain の `linear-widget-token` を読み**にいくので、**どちらか一方でログインすればもう一方でも使える**。

## 共通の前提

- macOS
- Linear Personal API Key（[発行方法](packages/widget/README.md#2-linear-personal-api-key-を発行する)）
- トークンは `security` コマンドまたは Tauri アプリ初回ウィザードから Keychain に保存

## 開発

```bash
# Übersicht 版（macOS のみ）
brew install --cask ubersicht
# シンボリックリンク
ln -s "$PWD/packages/widget" \
  "$HOME/Library/Application Support/Übersicht/widgets/linear-glance.widget"

# Tauri 版
cd packages/menubar
pnpm install
pnpm tauri dev
```

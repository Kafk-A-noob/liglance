# LiGlance

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](#)

**Li**near issues **Glance** — Mac で [Linear](https://linear.app) の Issue を「チラ見」するための個人ツール群。

`packages/widget` (Übersicht) と `packages/menubar` (Tauri) の 2 つを同梱した **モノレポ** です。どちらも同じ Keychain 上のトークンを共有するので、好きな方だけ使うことも両方使うこともできます。

> **Note**: 学習・個人用ツールとして作っています。同種のツールは [vanillasoap/lnr](https://github.com/vanillasoap/lnr)（Swift 製）や [flexzuu/linear-tracker](https://github.com/flexzuu/linear-tracker)（Go 製、メンテ停止）も存在します。LiGlance は **Tauri (Rust + React + TypeScript)** で書かれており、デスクトップ常駐版 (Übersicht) もセットになっているのが特徴です。

---

## 2 つのパッケージ

| パッケージ | 形態 | 強み |
|---|---|---|
| [`packages/widget`](packages/widget) | Übersicht ウィジェット | **デスクトップ常駐**。壁紙レイヤーに張り付き、ウィンドウを退けるとパッと見える。ドラッグで位置移動可、設定永続化 |
| [`packages/menubar`](packages/menubar) | Tauri メニューバーアプリ | **クリックで最前面**。アイコンクリックで即ドロップダウン、フォーカスが外れたら自動で閉じる |

### 機能（両方共通）

- Mine / Team / Project の 3 タブ切り替え
- Project はドロップダウンで選択
- 各 Issue の状態（workflow state）をカラードットで表示
- 接続ステータスドット（🟢 正常 / 🟡 2 分以上経過 / 🔴 エラー）
- 最終更新時刻表示（MM/DD HH:mm）
- 手動リロードボタン
- 1 分ごとに自動更新

### Tauri 版だけの機能

- **初回起動ウィザード** で API Key を貼り付け → Keychain に保存
- トレイ右クリックで「Reset token…」「Quit」メニュー

---

## 前提

- macOS（Apple Silicon / Intel）
- [Linear Personal API Key](https://linear.app/settings/account/security)

トークンは macOS Keychain（service 名 `linear-widget-token`）に保存します。Tauri 版のウィザードからでも、shell の `security` コマンドからでも保存可能。**両アプリで同じトークンを共有**します。

---

## インストール & 使い方

### Tauri 版（メニューバー）

1. [Releases](https://github.com/Kafk-A-noob/liglance/releases) から `LiGlance.app` または `.dmg` をダウンロード
2. `Applications/` にコピー
3. **初回起動時**：未署名アプリのため Gatekeeper が警告するので、**右クリック → 開く** で承認
4. メニューバーに小さなアイコンが出る → クリック → ウィザードに API Key を貼り付け

### Übersicht 版（デスクトップ）

```bash
brew install --cask ubersicht
git clone https://github.com/Kafk-A-noob/liglance.git
ln -s "$PWD/liglance/packages/widget" \
  "$HOME/Library/Application Support/Übersicht/widgets/liglance.widget"
open -a Übersicht
```

トークンは Tauri 版で保存済みならそのまま動きます。Tauri 版を使わない場合は手動で：

```bash
security add-generic-password -a "$USER" -s "linear-widget-token" -w "lin_api_xxx" -U
```

---

## 開発

```bash
# 依存
brew install --cask ubersicht       # Übersicht 版用
# Rust（Tauri 版用、未インストールの場合）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# クローン
git clone https://github.com/Kafk-A-noob/liglance.git
cd liglance

# Tauri 版を dev モードで起動
cd packages/menubar
pnpm install
pnpm tauri dev

# Tauri 版をリリースビルド
pnpm tauri build
# → packages/menubar/src-tauri/target/release/bundle/macos/LiGlance.app
# → packages/menubar/src-tauri/target/release/bundle/dmg/LiGlance_0.1.0_aarch64.dmg

# Übersicht 版のシンボリックリンク
ln -s "$PWD/../widget" \
  "$HOME/Library/Application Support/Übersicht/widgets/liglance.widget"
```

---

## アーキテクチャ

```
┌──────────────────────────┐    ┌──────────────────────────┐
│ Übersicht widget         │    │ Tauri menubar app        │
│ (React/JSX, .jsx)        │    │ (React + TS + Rust)      │
└──────────┬───────────────┘    └──────────┬───────────────┘
           │                                │
           ▼                                ▼
     shell スクリプト               Rust の Command::new("security")
     `security` CLI                       │
           │                                │
           └────────────┬───────────────────┘
                        ▼
              macOS Keychain
        service: linear-widget-token
                        │
                        ▼
              Linear GraphQL API
        https://api.linear.app/graphql
```

Tauri 版は **Linear API 呼び出しも Rust 側** で行います。理由：
- WebView の CORS 制約を回避
- トークンが JavaScript 側に渡らない（漏れにくい）

---

## 商標・ライセンス

- 「**Linear**」は [Linear Orbit, Inc.](https://linear.app) の商標です。本ツールは Linear が公式に承認・サポートしているものではありません
- 「LiGlance」という名称は「Linear issues Glance」の略であり、Linear 名を直接製品名に含めないようにしています
- 本ツールのコードは [MIT License](LICENSE) で配布されます

---

## 開発ロードマップ

[`docs/ROADMAP.md`](docs/ROADMAP.md) を参照してください。クロスプラットフォーム化（Windows 対応）の検討メモなどが書かれています。

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| Tauri 版の初回起動で開けない | 未署名アプリのため。Finder で右クリック → 開く |
| Übersicht に何も表示されない | システム設定 → プライバシー → 画面収録 で Übersicht を許可 |
| 「NO_TOKEN」エラー | Tauri 版: トレイ右クリック → Reset token… で再入力 |
| 「Linear API error」 | Linear で API Key を再発行 → Keychain を上書き |

---

## Author

[Kafk-A-noob](https://github.com/Kafk-A-noob)

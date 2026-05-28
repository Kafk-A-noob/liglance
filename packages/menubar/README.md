# linear-glance — menubar (Tauri)

メニューバーに常駐する Linear Issue ビューア。
**Mac の通常アプリ** として動くので、Übersicht 版と違いクリックで前面に出ます。

## 主な特徴

- メニューバーに小さなアイコン
- アイコンクリック → ドロップダウン形式のウィンドウが出る
- フォーカスが外れると自動で閉じる
- Mine / Team / Project の 3 タブ
- 接続ステータスドット、最終更新時刻、手動リロード
- **初回起動時にトークン入力ウィザード** が出る → macOS Keychain に保存

## Übersicht 版との関係

Keychain の `linear-widget-token` を **両方が読む** ので、どちらでログインしても両方使えます。
このアプリの初回ウィザードでトークンを保存すれば、Übersicht 版も即動きます（その逆も）。

## 開発（dev モード）

```bash
# 初回のみ
cd packages/menubar
pnpm install

# 起動
source "$HOME/.cargo/env"  # Rust の PATH を通す（初回 install 時）
pnpm tauri dev
```

初回ビルドは Rust の依存解決で数分かかります。2 回目以降は速い。

## リリースビルド

```bash
pnpm tauri build
```

`src-tauri/target/release/bundle/macos/` 配下に `.app` ができます。
Applications フォルダにコピーするだけで配布完了。

## アーキテクチャ

```
┌──────────────────────────────┐
│ React (TypeScript)           │  ← UI、状態管理、表示
│ src/App.tsx                  │
└──────────────┬───────────────┘
               │ invoke()
               ▼
┌──────────────────────────────┐
│ Rust (Tauri)                 │  ← Keychain アクセス、Linear API
│ src-tauri/src/lib.rs         │
└──────────────┬───────────────┘
               │ keyring crate / reqwest
               ▼
       macOS Keychain        Linear API
```

Linear API 呼び出しを **Rust 側でやる理由**:
- WebView の CORS 制約を回避するため
- トークンを JS 側に渡さなくて済む（漏れにくい）

## トークンの管理

- 保存サービス名: `linear-widget-token`
- アカウント: `$USER`（macOS のユーザー名）

CLI で確認するなら:
```bash
security find-generic-password -s linear-widget-token
# ↑ -w を付けると値が表示されるので注意
```

## トラブルシュート

| 症状 | 対処 |
|---|---|
| メニューバーにアイコンが出ない | Tauri アプリを起動した直後は数秒かかる場合がある |
| 「NO_TOKEN」エラー | 一度アプリを quit して再起動 → ウィザードが出る |
| API エラー | Linear で発行したキーが有効か確認、または再発行して再保存 |

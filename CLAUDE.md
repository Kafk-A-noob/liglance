# CLAUDE.md — LiGlance

このリポジトリでの Claude Code (またはその他 LLM コーディングエージェント) のための背景知識・規約・注意点。

## このプロジェクト一言で

**LiGlance** は macOS と Windows で動く Linear Issue ビューア。**Tauri (Rust + React + TypeScript)** で書かれた menubar アプリと、**Übersicht (React/JSX)** の壁紙レイヤーウィジェットを **モノレポ** で同梱。

最初の入口は [README.md](README.md)、長期方針は [docs/ROADMAP.md](docs/ROADMAP.md)。

## ディレクトリ構成

```
liglance/
├── packages/
│   ├── widget/                 # Übersicht 版 (macOS only)
│   │   ├── index.jsx           # 単一ファイルウィジェット本体
│   │   └── lib/
│   │       ├── fetch.sh        # Linear API メインクエリ
│   │       ├── fetch-states.sh # 編集モード時の workflow states 取得
│   │       ├── update-state.sh # issueUpdate mutation
│   │       └── token.sh        # Keychain から API Key を取り出す
│   └── menubar/                # Tauri 版 (macOS / Windows)
│       ├── src/                # React + TS
│       ├── src-tauri/          # Rust
│       │   ├── src/lib.rs      # 全 Tauri command と tray ロジック
│       │   ├── icons/          # アプリアイコンとトレイアイコン (PNG/SVG)
│       │   └── tauri.conf.json
│       └── package.json
├── docs/
│   └── ROADMAP.md              # 未来の話 (Windows 対応設計案・やらないリスト等)
├── .github/workflows/          # CI と Release
└── LICENSE                     # MIT
```

## 重要な設計判断（変更前に知っておくこと）

### 1. トークンは Keychain / Credential Manager に保存する

両アプリとも **service 名: `linear-widget-token`**, **account: `$USER`** で保存する。
両者を同じ key にしているのは「片方で保存したら他方も使える」設計のため。

- macOS: shell out で `security` CLI を使う（理由: dev ビルドの未署名バイナリで keyring crate の ACL 検証が落ちることがある）
- Windows / Linux: Rust の `keyring` crate を使う（Credential Manager / Secret Service）

`packages/menubar/src-tauri/src/lib.rs` で `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]` で分岐済み。

### 2. Linear API は Rust 側で呼ぶ（Tauri 版のみ）

理由:
- WebView の CORS 制約を回避
- トークンが JavaScript 側に渡らない（漏れにくい）

実装は `lib.rs::fetch_linear`, `fetch_states`, `update_issue_state`。
JS 側からは `@tauri-apps/api/core::invoke` 経由で呼ぶ (`src/api.ts`)。

### 3. Übersicht 版は macOS 専用

Übersicht (https://tracesof.net/uebersicht/) は macOS のみ。
Windows/Linux サポートは予定なし。同等品は [Rainmeter](https://www.rainmeter.net/) があるが別物 = 別プロジェクトレベル。

### 4. 編集モードは既定 OFF

ステータス変更の誤クリックを防ぐため、ヘッダーの `🔒 / 🔓` トグル経由でしか stateドロップダウンは出ない。
ON 時に GraphQL `states` を別 fetch（メインクエリの complexity を抑える）。

### 5. 状態フィルタチップは全部既定 OFF

```
⊟ BL  ⊙ Rev  ✓ Done  ⊘ Canc.  ⎘ Dup
```

Todo / In Progress は常に表示。それ以外（Backlog / In Review / Done / Canceled / Duplicate）は noise 寄りなので必要なときだけ ON。
**Backlog や In Review はワークスペースに残しっぱなしになりがちなので noise 扱いで OK**（過去 Issue 履歴より）。

### 6. 優先度の扱い

Linear の priority: `0=None, 1=Urgent, 2=High, 3=Medium, 4=Low`
ソートは `priorityRank(p) = p === 0 ? 99 : p` の昇順 → updatedAt 降順。

バッジ:
- Urgent: 赤い `!` (`!`)
- High/Medium/Low: 信号強度バー（3 本中、filled = 点灯）
- なし: 何も表示しない

実装は `PriorityBadge.tsx` (Tauri) / widget の `index.jsx` 内 `PriorityBadge` 関数。

## 規約

### コミット / PR / ブランチ

- **main は branch-protected**。`enforce_admins: true` で admin 含めて直 push 不可
- 機能追加は `feat/...` ブランチで PR → CI 全部 green → squash merge
- bug 修正は `fix/...`、ドキュメントは `docs/...`、CI/設定は `chore/...` か `ci/...`
- コミットメッセージは prefix（`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `ui:`, `security:`）

### 必須 CI status check (Branch Protection で強制)

7 つ全部 green でないと merge できない:
- `Frontend (Tauri menubar React)`
- `Backend (Tauri Rust) (ubuntu-latest)`
- `Backend (Tauri Rust) (macos-latest)`
- `Backend (Tauri Rust) (windows-latest)`
- `Widget (Übersicht JSX syntax)`
- `Analyze (javascript-typescript)` (CodeQL)
- `Analyze (rust)` (CodeQL)

### コーディング

- 言語: TypeScript / React / Rust / Bash
- TypeScript は `any` を避ける。`Record<string, unknown>` などで明示
- React は関数コンポーネント + Hooks
- Rust は `unsafe` を使わない方針、新規追加時は議論
- shell スクリプトの input は **常に regex バリデーション**（UUID は `[a-zA-Z0-9-]+` のみ受け付け）

### セキュリティ

- 認証情報・API キーは絶対にコードに書かない（Keychain / Credential Manager 経由）
- `.env` は使わない方針（誤コミット予防）
- エラーメッセージ表示前に `redactSecrets()` を通す
- `open_url` は `http(s)://` 以外を reject

### コミット前確認

新しい変更を main へ届ける前に、ローカルで以下を流すと安心:

```bash
# Tauri 版
cd packages/menubar
pnpm build              # tsc + vite
cd src-tauri
cargo check             # コンパイル
cargo audit             # 既知脆弱性

# widget
cd packages/widget
# fetch.sh / update-state.sh の挙動を確認
```

シークレット混入チェック:
```bash
infisical scan
```

## トラブル時のヒント

| 症状 | 確認する場所 |
|---|---|
| Tauri WebView が古い CSS のまま | `~/Library/WebKit/dev.kafkanoob.liglance/` を削除して再起動（macOS） |
| `bundle_dmg.sh failed` | `target/release/bundle/` を `rm -rf` して再ビルド |
| `Query too complex` (Linear API) | `states` などのネストを減らす。`fetch_states` を別 query にしてある経緯あり |
| CodeQL が "Code scanning is not enabled" で失敗 | 初回 push 後に 1 回 rerun すると有効化される |
| Branch Protection で push が reject | feature ブランチ切って PR、CI green を待つ |

## やってはいけないこと

- main への直 push（admin でも禁止）
- `unsafe` Rust の安易な追加
- `dangerouslySetInnerHTML` の使用
- 認証情報・トークンの平文ログ出力（`/tmp/liglance.log` も以前削除）
- Übersicht widget を「Tauri と同じく」Windows 対応しようとすること（仕組み上不可能）

## 関連リンク

- リポジトリ: https://github.com/Kafk-A-noob/liglance
- Linear API ドキュメント: https://developers.linear.app/docs
- Tauri 2 ドキュメント: https://v2.tauri.app/
- Übersicht: https://tracesof.net/uebersicht/

## 商標・ライセンス

- 「**Linear**」は [Linear Orbit, Inc.](https://linear.app) の商標。LiGlance は非公式で関連なし
- 名称は「**Li**near issues **Glance**」の略であり、Linear 名を製品名に直接含めない方針
- コードは [MIT](LICENSE) で配布

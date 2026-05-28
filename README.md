# linear-glance

Mac のデスクトップに Linear の Issue をチラ見できるウィジェット。
[Übersicht](https://tracesof.net/uebersicht/) 上で動く個人ツール。

## できること

- 自分担当の未完了 Issue 一覧（**Mine**）
- 所属チーム全体の未完了 Issue 一覧（**Team**）
- ワンクリックでタブ切替
- 各 Issue の状態（workflow state）をカラードットで表示
- 1分ごとに自動更新

## セットアップ

### 1. Übersicht を入れる

```bash
brew install --cask ubersicht
open -a Übersicht
```

初回起動時に macOS が「アクセシビリティ」「画面収録」の許可を求めるので承認する。
メニューバーに 👁 アイコンが出れば OK。

### 2. Linear Personal API Key を発行する

Linear → Settings → My Account → Security & access → **Personal API keys** → New API key
- ラベル: `linear-glance` など
- 発行された `lin_api_xxxxxxxxxxxx` を控える（**ファイルやチャットには貼らない**）

### 3. Keychain にトークンを保存する

```bash
security add-generic-password \
  -a "$USER" \
  -s "linear-widget-token" \
  -w "lin_api_xxxxxxxxxxxx" \
  -U
```

- `-s` は識別子。`lib/token.sh` が同じ名前で取り出すので変更しないこと。
- 入力後はシェル履歴から消しておくと安心:
  ```bash
  history -d $(history 1 | awk '{print $1}')
  ```

### 4. Übersicht の widgets フォルダにシンボリックリンクを張る

```bash
ln -s /Users/n.masaru/pri/linear-glance \
  "$HOME/Library/Application Support/Übersicht/widgets/linear-glance.widget"
```

> `.widget` で終わる必要がある（Übersicht の規約）

### 5. リロード

Übersicht メニュー → **Refresh All Widgets**。
デスクトップ右上にウィジェットが出ていれば成功。

## ファイル構成

```
linear-glance/
├── index.jsx          # ウィジェット本体
├── lib/
│   ├── token.sh       # Keychain → トークンを取り出すだけのスクリプト
│   └── query.graphql  # GraphQL クエリの "読む用" コピー（実体は index.jsx 内）
├── README.md          # このファイル
└── .gitignore
```

## トラブルシュート

| 症状 | 原因 / 対処 |
|---|---|
| 「Keychain にトークンがありません」 | 上記セットアップ 3 が未実施 |
| 「Linear に接続できませんでした」 | ネットワーク or トークン無効。Linear 側で API key を再発行する |
| 何も出ない | Übersicht メニュー → Open Console でエラー確認 |
| シンボリックリンクを辿らない | `~/Library/Application Support/Übersicht/widgets/linear-glance.widget` が存在するか確認 |

## 将来 Infisical に移行するとき

`lib/token.sh` の中身を 1 箇所差し替えるだけ：

```bash
# Before（Keychain）
security find-generic-password -s "linear-widget-token" -w

# After（Infisical 例）
infisical secrets get LINEAR_WIDGET_TOKEN --plain --env=dev --path=/personal
```

`index.jsx` には触らなくてよい。これがトークン取得を別ファイルに切り出している理由。

## なぜこの構成か（学習メモ）

- **Übersicht**: TS/React 経験者がそのまま読める .jsx 1 ファイルで動かせる。商用デスクトップウィジェット用 OSS で完全無料
- **Keychain**: macOS 標準の暗号化ストア。コードにもファイルにもトークンが残らないので、git に誤って混入する事故が物理的に起こらない
- **GraphQL を 1 回だけ叩いて両タブ分のデータを取る**: タブ切替のたびに API を叩かないので、Linear 側にも自分の通信量にも優しい。クライアント側で `state.tab` を見て表示を切り替えるだけ
- **`refreshFrequency: 60000`**: 1 分は実用と API レート制限のバランス。短くしたければ縮めて OK

# Roadmap

> 「やる」と決めたわけではなく、現状の課題と将来の方向性をメモしておく場所。
> 取捨選択は気が向いたときに。

## 短期 TODO（既知の限界）

| 項目 | 内容 |
|---|---|
| **アイコンの完成度** | 現状の `lig` モノグラムはミニマルすぎる気もする。デザイナー視点でリファインの余地あり |
| **自動起動 (autolaunch)** | ログイン時に Tauri 版が自動起動するように。`tauri-plugin-autostart` で実装可能 |
| **ホットキー** | `⌘+Shift+L` などで Tauri 版のウィンドウを最前面化。`tauri-plugin-global-shortcut` で実装可能 |
| **未読 / 緊急バッジ** | トレイアイコン自体に未対応 Issue 数のバッジを出す（タイミングと頻度で UX 要検討） |
| **検索 / フィルタ** | Issue が多いとリストが長くなる。タイトル検索や label フィルタ |
| **Issue 詳細ビュー** | クリックで一覧の右側に詳細を出す or 別ペイン |
| **Notification 連携** | 新しく自分にアサインされたら macOS 通知を出す |

## 中期：クロスプラットフォーム化（Windows 対応）

LiGlance の本体（Tauri 版）は **設計上 Windows / Linux にも展開可能** です。
ただし、いくつかプラットフォーム固有のロジックがあるので分離が必要です。

### 影響範囲と対応方針

#### 1. Keychain アクセス

**現状**: `Command::new("security")` で macOS 専用の CLI を呼んでいます（`packages/menubar/src-tauri/src/lib.rs` の `save_token` / `read_token`）。

**対応案**：

| プラットフォーム | API | 実装方法 |
|---|---|---|
| macOS | Keychain Services | 現状の `security` CLI（dev ビルド ACL 回避のため shell out） |
| Windows | Credential Manager | Rust の [`keyring`](https://crates.io/crates/keyring) crate（Windows では Win32 Credential API を呼ぶ） |
| Linux | Secret Service (libsecret) | 同 `keyring` crate |

実装：`#[cfg(target_os = "macos")]` で macOS は shell 経由、その他は `keyring` crate に分岐。

```rust
#[cfg(target_os = "macos")]
fn read_token() -> Result<String, String> { /* security CLI */ }

#[cfg(not(target_os = "macos"))]
fn read_token() -> Result<String, String> {
    let entry = keyring::Entry::new("liglance", &user_name())?;
    entry.get_password().map_err(...)
}
```

#### 2. トレイアイコン

**現状**: macOS テンプレート画像（モノクロ）として PNG を埋め込み。

**対応案**：
- Windows のシステムトレイは **カラーアイコン** が一般的（タスクバー右下）。テンプレート化は不要
- `icon_as_template(true)` を `#[cfg(target_os = "macos")]` でだけ有効に
- Windows 用には `app.svg` をもう一段小さくしたカラー版を作る

#### 3. メニューバー / システムトレイの位置

**現状**: トレイクリック時にウィンドウをアイコン直下に配置（macOS 想定）。

**対応案**：
- Windows ではタスクバー右下 → ウィンドウは画面右下に配置
- `position_window_under_tray` を OS で分岐

#### 4. Übersicht 版（widget）の扱い

**現状**: macOS 専用（Übersicht が macOS only）。

**対応案**：
- Windows 移植は **しない**。widget パッケージは macOS only として README に明記
- もしくは Windows でも壁紙レイヤーに描画する別の方法を別途検討（[Rainmeter](https://www.rainmeter.net/) という似た OSS が Windows にあるが、実装言語が違うので別プロジェクトレベル）

#### 5. ビルドターゲット

**現状**: `pnpm tauri build` で `.app` と `.dmg`（macOS）。

**対応案**：
- macOS: 今まで通り
- Windows: `pnpm tauri build --target x86_64-pc-windows-msvc` で `.msi` / `.exe`
- CI（GitHub Actions）で 3 OS 並列ビルド → Releases にアップロード

#### 6. UI（フロントエンド）

**現状**: React + TS。OS 非依存なのでそのまま動く。

**対応案**：
- 特に変更不要
- ただし macOS 風の半透明背景（`backdrop-filter`）が Windows で同様に効くかは要検証

### マイルストーン案（Windows 対応をやる場合）

1. **Phase A**: Keychain 層を抽象化（macOS は shell、Windows/Linux は `keyring` crate）
2. **Phase B**: `#[cfg(...)]` でトレイアイコン / 位置調整 / etc. を分岐
3. **Phase C**: GitHub Actions で 3 OS マトリックスビルド → Releases に自動アップロード
4. **Phase D**: Übersicht widget は macOS only として保留、もしくは Rainmeter 版を別パッケージで

### 工数感

- 学習しながらやって **2〜4 日**（テスト含む）
- Windows 実機なしだとデバッグが厳しい → 仮想マシン or 実機 or CI 上での動作確認が必要

## 長期：その他

- Linux 対応（中期 Windows 対応の流れで自然と乗ってくる）
- 公式アプリストア配布（macOS App Store は private API 使ってる関係で不可、Microsoft Store は可能）
- 多言語対応（i18n、現状は日本語のみ）
- テーマ切替（light / dark / 自動）
- 設定 UI（refreshFrequency などをアプリ内で変えられるように）

## 編集機能の分担

- **Tauri 版**: ステータス更新・編集モード ON/OFF・将来的なフィルタなど **編集機能はこちらに集中**
- **Übersicht 版**: 「常に視界に入る」用途に振り切って **read-only**（壁紙レイヤーで編集 UI を出すと操作が辛い）

Übersicht 版でステータス変更したい場合は Tauri 版を開いて操作してください。
両者は同じ Keychain トークンを共有しているので、API 経由で同じ結果が得られます。

## やらないこと（明示）

- Linear OAuth 対応：本ツールは個人ユースに振っている。OAuth は登録・運用コストが見合わない（[初期検討議事録](https://github.com/Kafk-A-noob/liglance/commits/main) 参照）
- 商用化・有料化：個人ツールとして MIT で配布
- App Store 配布：未署名で十分（友人配布レベル）

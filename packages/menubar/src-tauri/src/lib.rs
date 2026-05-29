// =====================================================================
// LiGlance (Linear issues Glance) menubar — Tauri 2 backend
// =====================================================================
// 役割:
//   1. Keychain への API Key 保存／取得（service名は Übersicht 版と共通：
//      "linear-widget-token"）
//   2. Linear GraphQL API への HTTP リクエスト（CORS 回避のため Rust 側で実行）
//   3. メニューバートレイアイコンの設置とクリックでウィンドウ表示
// =====================================================================

use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WebviewWindow,
};

// macOS では security CLI を使い、それ以外は keyring crate を使う。
// 理由:
//  - macOS dev ビルドは未署名ゆえ keyring crate の ACL 検証で詰まる
//  - Windows/Linux では keyring crate が公式に動くので安全
#[cfg(not(target_os = "macos"))]
use keyring::Entry;

/// Übersicht ウィジェットと共有する Keychain サービス名
const KEYCHAIN_SERVICE: &str = "linear-widget-token";

fn keychain_account() -> String {
    std::env::var("USER").unwrap_or_else(|_| "default".to_string())
}

// --- Tauri コマンド: トークン CRUD ----------------------------------------

// ==== macOS: shell out to `security` CLI ===============================
#[cfg(target_os = "macos")]
#[tauri::command]
fn token_exists() -> bool {
    Command::new("security")
        .args(["find-generic-password", "-a", &keychain_account(), "-s", KEYCHAIN_SERVICE])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-a", &keychain_account(),
            "-s", KEYCHAIN_SERVICE,
            "-w", &token,
            "-U",
        ])
        .output()
        .map_err(|e| format!("security command spawn failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "security add-generic-password failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn delete_token() -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-a", &keychain_account(), "-s", KEYCHAIN_SERVICE])
        .output();
    Ok(())
}

#[cfg(target_os = "macos")]
fn read_token() -> Result<String, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a", &keychain_account(),
            "-s", KEYCHAIN_SERVICE,
            "-w",
        ])
        .output()
        .map_err(|e| format!("security command spawn failed: {}", e))?;
    if !output.status.success() {
        return Err(format!("NO_TOKEN: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() { return Err("EMPTY_TOKEN".to_string()); }
    Ok(token)
}

// ==== non-macOS (Windows / Linux): keyring crate =======================
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn token_exists() -> bool {
    Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .and_then(|e| e.get_password())
        .is_ok()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .map_err(|e| format!("keyring entry: {}", e))?;
    entry.set_password(&token).map_err(|e| format!("keyring set: {}", e))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn delete_token() -> Result<(), String> {
    if let Ok(entry) = Entry::new(KEYCHAIN_SERVICE, &keychain_account()) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn read_token() -> Result<String, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .map_err(|e| format!("keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(t) if !t.is_empty() => Ok(t),
        Ok(_) => Err("EMPTY_TOKEN".to_string()),
        Err(keyring::Error::NoEntry) => Err("NO_TOKEN".to_string()),
        Err(e) => Err(format!("keyring: {}", e)),
    }
}

// --- Tauri コマンド: Linear API ------------------------------------------

#[derive(Serialize, Deserialize)]
struct GqlBody {
    query: String,
}

/// 状態 type の除外リスト → GraphQL filter 文字列 を組み立てる
/// 入力は固定の安全リスト（backlog/unstarted/started/completed/canceled）からのみ受け付ける
fn build_state_filter(exclude_types: &[String]) -> String {
    // 防御的: 既知の type 以外は捨てる
    let allowed = ["backlog", "unstarted", "started", "completed", "canceled", "duplicate", "triage"];
    let filtered: Vec<&String> = exclude_types
        .iter()
        .filter(|t| allowed.contains(&t.as_str()))
        .collect();

    if filtered.is_empty() {
        return String::new();
    }
    let quoted: Vec<String> = filtered.iter().map(|t| format!(r#""{}""#, t)).collect();
    format!(
        r#"filter: {{ state: {{ type: {{ nin: [{}] }} }} }},"#,
        quoted.join(", ")
    )
}

fn build_query(exclude_types: &[String]) -> String {
    let filter = build_state_filter(exclude_types);
    format!(
        r#"
query {{
  viewer {{
    id
    name
    assignedIssues({filter} first: 50, orderBy: updatedAt) {{
      nodes {{
        id identifier title url updatedAt
        priority priorityLabel
        state {{ id name color type }}
        project {{ id name }}
        team {{ id key }}
      }}
    }}
    teamMemberships {{
      nodes {{
        team {{
          id key name
          issues({filter} first: 30, orderBy: updatedAt) {{
            nodes {{
              id identifier title url updatedAt
              priority priorityLabel
              state {{ id name color type }}
              project {{ id name color }}
              assignee {{ displayName }}
              team {{ id }}
            }}
          }}
        }}
      }}
    }}
  }}
}}
"#,
        filter = filter
    )
}

/// チームごとの workflow states を別 query で取得。
/// 編集モード ON 時のみ呼ばれる軽量クエリ。
const STATES_QUERY: &str = r#"
query {
  viewer {
    teamMemberships {
      nodes {
        team {
          id
          states(first: 30) {
            nodes { id name color type position }
          }
        }
      }
    }
  }
}
"#;

#[tauri::command]
async fn fetch_states() -> Result<String, String> {
    let token = read_token()?;
    let body = GqlBody { query: STATES_QUERY.to_string() };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", token)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http: {}", e))?;
    resp.text().await.map_err(|e| format!("read body: {}", e))
}

#[tauri::command]
async fn fetch_linear(exclude_types: Vec<String>) -> Result<String, String> {
    let token = read_token()?;

    let body = GqlBody {
        query: build_query(&exclude_types),
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", token)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("read body: {}", e))?;
    Ok(text)
}

/// Issue のステータス（workflow state）を変更する。
/// Linear GraphQL の issueUpdate mutation を呼ぶ。
#[tauri::command]
async fn update_issue_state(issue_id: String, state_id: String) -> Result<String, String> {
    let token = read_token()?;
    // GraphQL mutation - 変数を埋め込み（issue_id/state_id 形式は ID 文字列なので適切にエスケープ）
    // 防御的: id 形式は UUID 想定。英数字+ハイフンのみ受け付ける
    if !issue_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid issue_id format".to_string());
    }
    if !state_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid state_id format".to_string());
    }

    let query = format!(
        r#"mutation {{ issueUpdate(id: "{}", input: {{ stateId: "{}" }}) {{ success issue {{ id state {{ id name }} }} }} }}"#,
        issue_id, state_id
    );
    let body = GqlBody { query };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", token)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http: {}", e))?;

    resp.text().await.map_err(|e| format!("read body: {}", e))
}

/// 外部ブラウザで URL を開く。
/// frontend の <a target="_blank"> は Tauri WebView 内で開いてしまうため、
/// OS 標準コマンド経由でデフォルトブラウザに渡す。
/// セキュリティ: http(s) スキームのみ許可（任意コマンド実行を防ぐ）
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("rejected scheme: {}", &url[..url.len().min(20)]));
    }

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&url).spawn();

    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", &url]).spawn();

    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(&url).spawn();

    result.map_err(|e| format!("open failed: {}", e))?;
    Ok(())
}

// --- ウィンドウ表示位置を menubar アイコン直下に合わせる ------------------

fn position_window_under_tray(window: &WebviewWindow, tray_position: PhysicalPosition<f64>) {
    let monitor = window.current_monitor().ok().flatten();
    let window_size = window.outer_size().unwrap_or_default();
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);

    #[cfg(target_os = "macos")]
    {
        // macOS: メニューバーアイコンの直下、中央寄せ
        let x = tray_position.x - (window_size.width as f64 / 2.0);
        let y = tray_position.y + (4.0 * scale);
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux: タスクトレイ近く（画面右下）
        // tray_position はアイコンクリック位置、そこを参考に上方向に
        if let Some(m) = monitor {
            let screen = m.size();
            let margin = (12.0 * scale) as i32;
            let x = (screen.width as i32) - (window_size.width as i32) - margin;
            // タスクバーの高さ (~48px) ぶん上、さらに余白
            let y = tray_position.y as i32 - (window_size.height as i32) - margin;
            let y_clamped = y.max(margin);
            let _ = window.set_position(PhysicalPosition::new(x, y_clamped));
        }
    }
}

// --- エントリーポイント --------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            token_exists,
            save_token,
            delete_token,
            fetch_linear,
            fetch_states,
            open_url,
            update_issue_state,
        ])
        .setup(|app| {
            // macOS: Dock から消す（メニューバーアプリにする）
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // トレイアイコンのメニュー（右クリック用）
            let reset_item = MenuItem::with_id(app, "reset_token", "Reset token…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&reset_item, &quit_item])?;

            let app_handle = app.handle().clone();
            // トレイアイコン（メニューバー用、テンプレート画像=黒一色+アルファ）
            // PNG をバイナリへ埋め込み、起動時に RGBA へデコードして Image を作る
            let tray_png = include_bytes!("../icons/tray-32.png");
            let decoded = image::load_from_memory(tray_png)?.to_rgba8();
            let (tw, th) = decoded.dimensions();
            let tray_icon = tauri::image::Image::new_owned(decoded.into_raw(), tw, th);

            let _tray = TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .icon_as_template(true) // macOS が白黒を menu bar に合わせて反転
                .menu(&menu)
                .show_menu_on_left_click(false) // 左クリックは独自処理
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "reset_token" => {
                            // Keychain からトークン削除 → frontend にイベント通知 →
                            // App.tsx 側で hasToken=false に戻し、ウィザード再表示
                            let _ = delete_token();
                            let _ = app.emit("token-reset", ());
                            // ウィザードを見せるためにウィンドウも開く
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                position_window_under_tray(&window, position);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 起動時はウィンドウを隠したまま
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.hide();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // ウィンドウからフォーカスが外れたら閉じる（メニューバー的挙動）
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

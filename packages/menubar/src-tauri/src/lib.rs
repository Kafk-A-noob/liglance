// =====================================================================
// linear-glance menubar — Tauri 2 backend
// =====================================================================
// 役割:
//   1. Keychain への API Key 保存／取得（service名は Übersicht 版と共通：
//      "linear-widget-token"）
//   2. Linear GraphQL API への HTTP リクエスト（CORS 回避のため Rust 側で実行）
//   3. メニューバートレイアイコンの設置とクリックでウィンドウ表示
// =====================================================================

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindow,
};

/// Übersicht ウィジェットと共有する Keychain サービス名
const KEYCHAIN_SERVICE: &str = "linear-widget-token";

/// Keychain の Account 名（macOS の `-a` 相当）
fn keychain_account() -> String {
    std::env::var("USER").unwrap_or_else(|_| "default".to_string())
}

// --- Tauri コマンド: トークン CRUD ----------------------------------------

#[tauri::command]
fn token_exists() -> bool {
    Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .and_then(|e| e.get_password())
        .is_ok()
}

#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .map_err(|e| format!("keyring entry: {}", e))?;
    entry
        .set_password(&token)
        .map_err(|e| format!("keyring set: {}", e))?;
    Ok(())
}

#[tauri::command]
fn delete_token() -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .map_err(|e| format!("keyring entry: {}", e))?;
    let _ = entry.delete_credential();
    Ok(())
}

// --- Tauri コマンド: Linear API ------------------------------------------

#[derive(Serialize, Deserialize)]
struct GqlBody {
    query: String,
}

const QUERY: &str = r#"
query {
  viewer {
    id
    name
    assignedIssues(filter: { state: { type: { neq: "completed" } } }, first: 50, orderBy: updatedAt) {
      nodes {
        identifier title url updatedAt
        state { name color type }
        project { id name }
        team { key }
      }
    }
    teamMemberships {
      nodes {
        team {
          id key name
          issues(filter: { state: { type: { neq: "completed" } } }, first: 30, orderBy: updatedAt) {
            nodes {
              identifier title url updatedAt
              state { name color type }
              project { id name color }
              assignee { displayName }
            }
          }
        }
      }
    }
  }
}
"#;

#[tauri::command]
async fn fetch_linear() -> Result<String, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &keychain_account())
        .map_err(|e| format!("keyring: {}", e))?;
    let token = entry
        .get_password()
        .map_err(|_| "NO_TOKEN".to_string())?;

    let body = GqlBody {
        query: QUERY.to_string(),
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

// --- ウィンドウ表示位置を menubar アイコン直下に合わせる ------------------

fn position_window_under_tray(window: &WebviewWindow, tray_position: PhysicalPosition<f64>) {
    let monitor = window.current_monitor().ok().flatten();
    let window_size = window.outer_size().unwrap_or_default();
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);

    // tray_position はトレイアイコンの位置（screen 座標, physical）
    // ウィンドウを中央寄せでアイコンの直下に配置
    let x = tray_position.x - (window_size.width as f64 / 2.0);
    let y = tray_position.y + (4.0 * scale); // アイコンから少し下

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

// --- エントリーポイント --------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            token_exists,
            save_token,
            delete_token,
            fetch_linear,
        ])
        .setup(|app| {
            // macOS: Dock から消す（メニューバーアプリにする）
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // トレイアイコンのメニュー（右クリック用）
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            let app_handle = app.handle().clone();
            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true) // macOS テンプレート画像扱い（白黒適応）
                .menu(&menu)
                .show_menu_on_left_click(false) // 左クリックは独自処理
                .on_menu_event(move |app, event| {
                    if event.id == "quit" {
                        app.exit(0);
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

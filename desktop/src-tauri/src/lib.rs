/*
 * MQ Player Desktop — Tauri shell (lib).
 *
 * Composition:
 *  - localhost proxy (proxy.rs) — the single network path to production;
 *  - SMTC media controls (smtc.rs, Windows) — system media overlay,
 *    hardware media keys, seek bar;
 *  - tray: Play/Pause · Next · Previous · Open · Quit;
 *  - close → hide to tray (music keeps playing, §23);
 *  - window state persistence (size/position restored, §5);
 *  - single instance + mq:// deep links (§34);
 *  - auto-updater (§31) — endpoint + pubkey come from tauri.conf.json.
 */
mod proxy;
#[cfg(windows)]
mod smtc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    tray::TrayIconEvent,
    Emitter, Manager, WindowEvent,
};

pub struct ShellState {
    pub jar: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, String>>>,
    pub persist_path: Option<std::path::PathBuf>,
}

#[tauri::command]
fn desktop_info(state: tauri::State<'_, std::sync::Mutex<ProxyPublic>>, app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let platform = if cfg!(windows) { "windows" } else { "other" }.to_string();
    Ok(vec![
        s.url.clone(),
        s.token.clone(),
        app.package_info().version.to_string(),
        format!("desktop-{}", app.package_info().version),
        platform,
    ])
}

pub struct ProxyPublic {
    pub url: String,
    pub token: String,
}

#[tauri::command]
fn auth_store_token(shell: tauri::State<'_, ShellState>, token: String) -> Result<(), String> {
    let jar = shell.jar.clone();
    let path = shell.persist_path.clone();
    tauri::async_runtime::spawn(async move {
        proxy::store_session_token(&jar, path.as_deref(), token).await;
    });
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
fn smtc_update(
    title: String,
    artist: String,
    album: String,
    artwork_path: String,
    duration_sec: f64,
    position_sec: f64,
    playing: bool,
    has_track: bool,
) -> Result<(), String> {
    smtc::update(smtc::SmtcUpdate {
        title,
        artist,
        album,
        artwork_path,
        duration_sec,
        position_sec,
        playing,
        has_track,
    });
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
fn smtc_update(
    _title: String,
    _artist: String,
    _album: String,
    _artwork_path: String,
    _duration_sec: f64,
    _position_sec: f64,
    _playing: bool,
    _has_track: bool,
) -> Result<(), String> {
    Ok(())
}

fn build_tray(app: &tauri::App) -> Result<(), tauri::Error> {
    let playpause = MenuItem::with_id(app, "playpause", "Играть / Пауза", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Следующий трек", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Предыдущий трек", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Открыть MQ Player", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&playpause, &next, &prev, &PredefinedMenuItem::separator(app)?, &open, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("mq-tray")
        .icon(app.default_window_icon().expect("app icon").clone())
        .tooltip("MQ Player")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "playpause" => {
                let _ = app.emit("smtc://event", serde_json::json!({ "kind": "playpause" }));
            }
            "next" => {
                let _ = app.emit("smtc://event", serde_json::json!({ "kind": "next" }));
            }
            "prev" => {
                let _ = app.emit("smtc://event", serde_json::json!({ "kind": "previous" }));
            }
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                let app = tray.app_handle().clone();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn run() {
    let single_instance = tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
        let _ = app.emit("second-instance", argv);
    });

    tauri::Builder::default()
        .plugin(single_instance)
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![desktop_info, auth_store_token, smtc_update])
        .setup(|app| {
            // 1. localhost proxy — must be up before the WebView asks
            //    desktop_info (the boot handshake). The SAME jar the proxy
            //    reads is managed as ShellState so auth_store_token writes
            //    land in live requests too.
            let handle = app.handle().clone();
            let startup = tauri::async_runtime::block_on(proxy::spawn(&handle))?;
            app.manage(std::sync::Mutex::new(ProxyPublic {
                url: startup.url.clone(),
                token: startup.token.clone(),
            }));
            app.manage(ShellState {
                jar: startup.jar,
                persist_path: startup.persist_path,
            });

            // 2. SMTC (Windows media controls + hardware media keys).
            #[cfg(windows)]
            {
                if let Err(e) = smtc::init(handle.clone()) {
                    log::error!("[smtc] disabled: {e}");
                }
            }

            // 3. Tray.
            build_tray(app)?;

            // 4. Close → hide to tray: music keeps playing (§23). Real quit
            //    lives in the tray menu (Выход) and in updater relaunch.
            let main = app
                .get_webview_window("main")
                .expect("main window configured");
            let close_handle = handle.clone();
            main.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = close_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("MQ Player desktop failed to start");
}

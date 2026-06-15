use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// The Clearmind CLI host serves the SPA + REST API + SSE on this port and
/// stores its data in %APPDATA%/Clearmind. Every other client in the
/// ecosystem (browser, mobile web, tray) talks to it, so pointing the desktop
/// windows here keeps them in perfect lockstep with all of them.
const HOST_URL: &str = "http://localhost:20129/";

/// Whether the user pinned the widget on top (toggled from the tray). Starts
/// false — the widget is a normal movable window by default, not floating.
static WIDGET_PINNED: AtomicBool = AtomicBool::new(false);

/// Fast probe for a running Clearmind host (400ms timeout keeps launch snappy).
fn host_is_running() -> bool {
    let Ok(mut addrs) = "127.0.0.1:20129".to_socket_addrs() else {
        return false;
    };
    addrs.any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok())
}

/// Sync mode when the host is up; standalone bundled SPA otherwise.
fn window_url(host_up: bool) -> WebviewUrl {
    if host_up {
        WebviewUrl::External(HOST_URL.parse().expect("valid host url"))
    } else {
        WebviewUrl::App("index.html".into())
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_widget(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("widget") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

/// Open the web dashboard in the user's default browser (tray menu).
fn open_dashboard() {
    let url = "http://localhost:20129/dashboard";
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

/// Pin / unpin the widget on top (tray menu — the single place to toggle it).
fn toggle_widget_pin(app: &AppHandle) {
    let pinned = !WIDGET_PINNED.load(Ordering::Relaxed);
    WIDGET_PINNED.store(pinned, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("widget") {
        let _ = w.set_always_on_top(pinned);
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Toggle "start with Windows" for the desktop app (tray menu).
#[cfg(desktop)]
fn toggle_autostart(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if m.is_enabled().unwrap_or(false) {
        let _ = m.disable();
    } else {
        let _ = m.enable();
    }
}
#[cfg(not(desktop))]
fn toggle_autostart(_app: &AppHandle) {}

/// Silent auto-update: ask the configured endpoint (GitHub Releases'
/// `latest.json`) whether a newer *signed* build exists; if so, download +
/// install it and relaunch into the new version. Best-effort — every error
/// (offline, no update, signature mismatch) is swallowed so launch is never
/// blocked or broken by the check.
#[cfg(desktop)]
async fn try_update(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    let Ok(updater) = app.updater() else {
        return;
    };
    if let Ok(Some(update)) = updater.check().await {
        if update
            .download_and_install(|_chunk, _total| {}, || {})
            .await
            .is_ok()
        {
            app.restart();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance MUST be first: a second launch hands its args here
        // and exits, so we simply surface the already-running main window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        // Remember each window's size + position across restarts.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Check GitHub Releases for a newer signed build on launch and, if
            // one exists, download + install it then relaunch into it. Runs off
            // the main thread so it never blocks startup; no-ops on the common
            // case (already latest) and on any network / updater error.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    try_update(handle).await;
                });
            }

            let host = host_is_running();

            // Primary window — the full app.
            WebviewWindowBuilder::new(app, "main", window_url(host))
                .title("Clearmind")
                .inner_size(1180.0, 800.0)
                .min_inner_size(380.0, 520.0)
                .build()?;

            // "Today" widget — a normal movable window (title bar so it can be
            // dragged, minimized and closed), shown in the taskbar, NOT forced
            // on top (the user pins it on demand from the tray). The injected
            // global tells the SPA to mount WidgetView (App.tsx).
            let widget = WebviewWindowBuilder::new(app, "widget", window_url(host))
                .title("Clearmind — Hôm nay")
                .inner_size(330.0, 460.0)
                .min_inner_size(260.0, 300.0)
                .decorations(true)
                .always_on_top(false)
                .skip_taskbar(false)
                .resizable(true)
                .initialization_script("window.__CLEARMIND_WIDGET__=true;")
                .build()?;

            // Park the widget in the top-right corner of the primary monitor.
            if let Ok(Some(monitor)) = widget.primary_monitor() {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let margin = (24.0 * scale) as i32;
                let win_w = (330.0 * scale) as i32;
                let x = size.width as i32 - win_w - margin;
                let y = margin + (40.0 * scale) as i32;
                let _ = widget.set_position(tauri::PhysicalPosition::new(x.max(0), y.max(0)));
            }

            // Global hotkey: Ctrl+Alt+C toggles the today-widget from anywhere.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };
                let sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyC);
                app.global_shortcut()
                    .on_shortcut(sc, move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            toggle_widget(app);
                        }
                    })?;
            }

            // Tray: open the app, toggle the widget, or quit. Left-click the
            // icon also surfaces the main window.
            let open = MenuItem::with_id(app, "open", "Mở Clearmind", true, None::<&str>)?;
            let dashboard = MenuItem::with_id(
                app,
                "dashboard",
                "Mở Dashboard (trình duyệt)",
                true,
                None::<&str>,
            )?;
            let toggle =
                MenuItem::with_id(app, "toggle", "Hiện/ẩn widget hôm nay", true, None::<&str>)?;
            let pin = MenuItem::with_id(
                app,
                "pin",
                "Ghim / bỏ ghim widget lên trên",
                true,
                None::<&str>,
            )?;
            let autostart = MenuItem::with_id(
                app,
                "autostart",
                "Bật / tắt khởi động cùng Windows",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Thoát Clearmind", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &dashboard, &toggle, &pin, &autostart, &quit],
            )?;

            let _tray = TrayIconBuilder::with_id("clearmind-tray")
                .icon(app.default_window_icon().expect("bundled icon").clone())
                .tooltip("Clearmind")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "dashboard" => open_dashboard(),
                    "toggle" => toggle_widget(app),
                    "pin" => toggle_widget_pin(app),
                    "autostart" => toggle_autostart(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Closing the main window hides it to the tray instead of quitting, so
        // the background (widget + tray + hotkey) keeps running. Quit from the
        // tray menu. The frameless widget has no close button, so it's exempt.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Both windows hide-to-tray instead of quitting; the app stays
                // alive in the tray and either can be reopened from there.
                if window.label() == "main" || window.label() == "widget" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

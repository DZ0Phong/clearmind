use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};

/// The Clearmind CLI host serves the SPA + REST API + SSE on this port and
/// stores its data in %APPDATA%/Clearmind. Every other client in the
/// ecosystem (browser, mobile web, tray) talks to it, so pointing the desktop
/// windows here keeps them in perfect lockstep with all of them — same data,
/// same live SSE updates — with zero changes to the web app itself.
const HOST_URL: &str = "http://localhost:20129/";

/// Best-effort, fast probe for a running Clearmind host. A 400ms timeout keeps
/// launch snappy when nothing is listening (we then fall back to the bundled
/// SPA, which runs standalone in the WebView's own localStorage).
fn host_is_running() -> bool {
    let Ok(mut addrs) = "127.0.0.1:20129".to_socket_addrs() else {
        return false;
    };
    addrs.any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok())
}

fn window_url(host_up: bool) -> WebviewUrl {
    if host_up {
        WebviewUrl::External(HOST_URL.parse().expect("valid host url"))
    } else {
        WebviewUrl::App("index.html".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let host = host_is_running();

            // Primary window — the full app.
            WebviewWindowBuilder::new(app, "main", window_url(host))
                .title("Clearmind")
                .inner_size(1180.0, 800.0)
                .min_inner_size(380.0, 520.0)
                .build()?;

            // Floating "today" widget — frameless, always-on-top, off the
            // taskbar. The injected global tells the SPA to mount WidgetView
            // (see App.tsx) instead of the full app, on the same data layer.
            let widget = WebviewWindowBuilder::new(app, "widget", window_url(host))
                .title("Clearmind — Today")
                .inner_size(330.0, 460.0)
                .min_inner_size(260.0, 300.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
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

            // Tray icon: open the app, toggle the today-widget, or quit.
            let open = MenuItem::with_id(app, "open", "Mở Clearmind", true, None::<&str>)?;
            let toggle = MenuItem::with_id(
                app,
                "toggle",
                "Hiện/ẩn widget hôm nay",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &toggle, &quit])?;

            let _tray = TrayIconBuilder::with_id("clearmind-tray")
                .icon(app.default_window_icon().expect("bundled icon").clone())
                .tooltip("Clearmind")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "toggle" => {
                        if let Some(w) = app.get_webview_window("widget") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

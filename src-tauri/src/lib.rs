use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// The Clearmind CLI host serves the SPA + REST API + SSE on this port and
/// stores its data in %APPDATA%/Clearmind. Every other client in the
/// ecosystem (browser, mobile web, tray) talks to it, so pointing the desktop
/// window here keeps the app in perfect lockstep with all of them — same
/// data, same live SSE updates — with zero changes to the web app itself.
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

            // Sync mode when the host is up; standalone (bundled SPA) otherwise.
            let url = if host_is_running() {
                tauri::WebviewUrl::External(HOST_URL.parse().expect("valid host url"))
            } else {
                tauri::WebviewUrl::App("index.html".into())
            };

            tauri::WebviewWindowBuilder::new(app.handle(), "main", url)
                .title("Clearmind")
                .inner_size(1180.0, 800.0)
                .min_inner_size(380.0, 520.0)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! PDFella desktop: a native window around https://www.pdfella.com.
//!
//! - Opens a local loading/offline screen (../src/index.html) that moves on to the
//!   site once it's reachable. The app needs an internet connection.
//! - Keeps PDFella pages in the window; every other link, and the sign-in step,
//!   opens in the system browser (Google blocks OAuth inside web views).
//! - Receives the sign-in back through `pdfella://auth#…` and hands it to
//!   /desktop-auth/complete (see src/lib/auth/desktop.ts in the web app).
//! - Saves downloads to the Downloads folder and reveals them.

use std::path::{Path, PathBuf};

use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://www.pdfella.com";

/// Pages that stay inside the app window.
fn stays_in_app(url: &Url) -> bool {
    match url.scheme() {
        // The local loading screen (macOS: tauri://localhost, Windows: http://tauri.localhost).
        "tauri" | "about" | "blob" | "data" => return true,
        "http" | "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or_default();
    if host == "tauri.localhost" || host == "localhost" {
        return true;
    }
    if host == "www.pdfella.com" || host == "pdfella.com" {
        // The browser half of desktop sign-in must run in the real browser.
        let path = url.path().trim_end_matches('/');
        return path != "/desktop-auth";
    }
    // Frames that the site embeds (Firebase Auth, Google APIs and avatars).
    host.ends_with(".firebaseapp.com")
        || host.ends_with(".googleapis.com")
        || host.ends_with(".gstatic.com")
        || host.ends_with(".googleusercontent.com")
        || host == "accounts.google.com"
}

/// `pdfella://auth#s=…&iv=…&c=…` → /desktop-auth/complete#… in the main window.
fn handle_deep_link(app: &AppHandle, url: &Url) {
    if url.scheme() != "pdfella" || url.host_str() != Some("auth") {
        return;
    }
    let Some(window) = app.get_webview_window("main") else { return };
    if let Ok(target) = Url::parse(&format!("{SITE}/desktop-auth/complete#{}", url.fragment().unwrap_or_default())) {
        let _ = window.navigate(target);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// A normal browser user agent plus a marker the site uses to switch to desktop sign-in.
fn user_agent() -> String {
    let version = env!("CARGO_PKG_VERSION");
    #[cfg(target_os = "macos")]
    let base = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    #[cfg(not(target_os = "macos"))]
    let base = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
    format!("{base} PDFellaDesktop/{version}")
}

/// `name.pdf`, then `name (1).pdf`, `name (2).pdf`… so downloads never overwrite.
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    (1..10_000)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(candidate)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // One app instance: a second launch (or a pdfella:// link on Windows) focuses the first.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            let nav_app = app.handle().clone();
            let dl_app = app.handle().clone();
            let downloads = app.path().download_dir().ok();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("PDFella")
                .inner_size(1280.0, 840.0)
                .min_inner_size(860.0, 580.0)
                .center()
                .user_agent(&user_agent())
                .on_navigation(move |url| {
                    if stays_in_app(url) {
                        return true;
                    }
                    let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .on_download(move |_webview, event| {
                    match event {
                        DownloadEvent::Requested { destination, .. } => {
                            if let Some(dir) = &downloads {
                                let name = destination
                                    .file_name()
                                    .map(|n| n.to_string_lossy().into_owned())
                                    .unwrap_or_else(|| "PDFella download".into());
                                *destination = unique_path(dir, &name);
                            }
                        }
                        DownloadEvent::Finished { path: Some(path), success: true, .. } => {
                            let _ = dl_app.opener().reveal_item_in_dir(path);
                        }
                        _ => {}
                    }
                    true
                })
                .build()?;

            let link_app = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&link_app, &url);
                }
            });
            // Opened by a pdfella:// link while the app wasn't running.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_deep_link(app.handle(), &url);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PDFella");
}

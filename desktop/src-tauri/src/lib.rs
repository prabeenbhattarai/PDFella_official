//! PDFella desktop: a native window around https://www.pdfella.com.
//!
//! - Opens a local loading/offline screen (../src/index.html) that moves on to the
//!   site once it's reachable. The app needs an internet connection.
//! - Keeps PDFella pages in the window; every other link, and the sign-in step,
//!   opens in the system browser (Google blocks OAuth inside web views).
//! - Receives the sign-in back through `pdfella://auth#…` and hands it to
//!   /desktop-auth/complete (see src/lib/auth/desktop.ts in the web app).
//! - Saves downloads to the Downloads folder and reveals them in Finder/Explorer.
//! - Opens double-clicked PDFs by passing their contents to the page once the site
//!   has loaded (see src/components/desktop/file-bridge.tsx in the web app). Drops
//!   are left to the page, which handles them the same way it does in a browser.

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use base64::Engine;
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
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

/// PDFs waiting for the site to be ready to receive them.
#[derive(Default)]
struct Inbox {
    paths: Mutex<Vec<PathBuf>>,
    site_loaded: Mutex<bool>,
    // One file at a time, so its chunks arrive in order.
    sending: Arc<Mutex<()>>,
}

/// The largest file any plan allows. The site applies each plan's own limit.
const MAX_FILE_BYTES: u64 = 500 * 1024 * 1024;
/// A multiple of 3, so each chunk's base64 decodes on its own.
const CHUNK_BYTES: usize = 384 * 1024;

fn is_pdf(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
}

fn is_site(url: &Url) -> bool {
    matches!(url.scheme(), "https") && matches!(url.host_str(), Some("www.pdfella.com" | "pdfella.com"))
}

fn queue_files(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let inbox = app.state::<Inbox>();
    inbox.paths.lock().unwrap().extend(paths.into_iter().filter(|p| is_pdf(p)));
    send_files(app);
}

fn send_files(app: &AppHandle) {
    let inbox = app.state::<Inbox>();
    if !*inbox.site_loaded.lock().unwrap() {
        return;
    }
    let paths: Vec<PathBuf> = std::mem::take(&mut *inbox.paths.lock().unwrap());
    if paths.is_empty() {
        return;
    }
    let (app, sending) = (app.clone(), inbox.sending.clone());
    std::thread::spawn(move || {
        let _one_at_a_time = sending.lock().unwrap();
        let Some(window) = app.get_webview_window("main") else { return };
        for path in paths {
            // Never hand a file to anything but PDFella's own pages.
            if !window.url().is_ok_and(|u| is_site(&u)) {
                return;
            }
            let _ = send_file(&window, &path);
        }
    });
}

fn send_file(window: &tauri::WebviewWindow, path: &Path) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "document.pdf".into());
    let name = serde_json::to_string(&name).unwrap_or_else(|_| "\"document.pdf\"".into());
    let start = "window.__pdfellaIncoming=window.__pdfellaIncoming||[];";
    let finish = "window.__pdfellaFileDone&&window.__pdfellaFileDone();";
    if std::fs::metadata(path)?.len() > MAX_FILE_BYTES {
        let _ = window.eval(format!("{start}window.__pdfellaIncoming.push({{name:{name},chunks:[],done:true,tooBig:true}});{finish}"));
        return Ok(());
    }
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; CHUNK_BYTES];
    let _ = window.eval(format!("{start}window.__pdfellaIncoming.push({{name:{name},chunks:[],done:false}});"));
    loop {
        let mut filled = 0;
        while filled < CHUNK_BYTES {
            let n = file.read(&mut buffer[filled..])?;
            if n == 0 {
                break;
            }
            filled += n;
        }
        if filled == 0 {
            break;
        }
        let chunk = base64::engine::general_purpose::STANDARD.encode(&buffer[..filled]);
        let _ = window.eval(format!("window.__pdfellaIncoming.at(-1).chunks.push(\"{chunk}\");"));
    }
    let _ = window.eval(format!("window.__pdfellaIncoming.at(-1).done=true;{finish}"));
    Ok(())
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
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            queue_files(app, argv.into_iter().skip(1).map(PathBuf::from));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .manage(Inbox::default())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            // Opened by double-clicking a PDF while the app wasn't running (Windows and Linux).
            queue_files(app.handle(), std::env::args().skip(1).map(PathBuf::from));

            let nav_app = app.handle().clone();
            let load_app = app.handle().clone();
            let dl_app = app.handle().clone();
            let downloads = app.path().download_dir().ok();
            // Where each download is going, by URL: on macOS the Finished event has no path.
            let saving: Arc<Mutex<HashMap<String, PathBuf>>> = Arc::default();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("PDFella")
                .inner_size(1280.0, 840.0)
                .min_inner_size(860.0, 580.0)
                .center()
                .user_agent(&user_agent())
                // Lets the page's own upload areas receive dropped files.
                .disable_drag_drop_handler()
                .on_page_load(move |_webview, payload| {
                    let inbox = load_app.state::<Inbox>();
                    let loaded = matches!(payload.event(), PageLoadEvent::Finished) && is_site(payload.url());
                    *inbox.site_loaded.lock().unwrap() = loaded;
                    if loaded {
                        send_files(&load_app);
                    }
                })
                .on_navigation(move |url| {
                    if stays_in_app(url) {
                        return true;
                    }
                    let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .on_download(move |_webview, event| {
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            if let Some(dir) = &downloads {
                                let name = destination
                                    .file_name()
                                    .map(|n| n.to_string_lossy().into_owned())
                                    .unwrap_or_else(|| "PDFella download".into());
                                *destination = unique_path(dir, &name);
                            }
                            saving.lock().unwrap().insert(url.to_string(), destination.clone());
                        }
                        DownloadEvent::Finished { url, path, success } => {
                            let saved = saving.lock().unwrap().remove(url.as_str());
                            if success {
                                if let Some(file) = path.or(saved) {
                                    let _ = dl_app.opener().reveal_item_in_dir(file);
                                }
                            }
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
        .build(tauri::generate_context!())
        .expect("error while building PDFella")
        .run(|_app, _event| {
            // macOS tells a running (or starting) app about double-clicked files with an event.
            #[cfg(target_os = "macos")]
            if let RunEvent::Opened { urls } = _event {
                queue_files(_app, urls.into_iter().filter_map(|u| u.to_file_path().ok()));
            }
        });
}

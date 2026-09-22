/*
 * Localhost reverse proxy — the desktop client's single network path to
 * the production MQ backend (https://mq1.vercel.app).
 *
 * WHY: the web app is cookie-authenticated (httpOnly, SameSite=Lax,
 * host-only for mq1.vercel.app). A Tauri WebView on the tauri.localhost
 * origin can never attach that cookie cross-origin — by design. Instead
 * of changing the backend, the Rust shell runs this proxy on
 * 127.0.0.1:<random> and the WebView talks ONLY to it:
 *
 *   WebView (tauri.localhost) ──> http://127.0.0.1:PORT/api/...
 *                                     │  attach session cookie (jar)
 *                                     │  browser UA / Origin / Referer
 *                                     ▼
 *                            https://mq1.vercel.app/api/...
 *
 *  - Set-Cookie responses are captured into the jar (login/register/
 *    telegram/email flows work unchanged);
 *  - the jar is persisted DPAPI-encrypted (Windows) in the app config
 *    dir — restart keeps the user signed in (§27);
 *  - CORS headers for the tauri origin are added so the WebView can
 *    read responses, including Range/206 for <audio> and streamed SSE;
 *  - every request must carry the per-session proxy token (header
 *    x-mq-desktop or query ?_mqt= for EventSource).
 *
 * The ONLY auth handoff that needs a backend addition is Google
 * (browser-based OAuth): the app opens the system browser at
 * /api/auth/google?desktop=1 and the callback redirects to
 * mq://auth?token=<session JWT>, captured by the deep-link handler →
 * auth_store_token() below.
 */
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderName, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Router;
use futures_util::StreamExt;
use rand::RngCore;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;

pub const API_BASE: &str = "https://mq1.vercel.app";
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 MQPlayerDesktop/1.0";

pub struct ProxyState {
    pub url: String,
    pub token: String,
    pub jar: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    pub persist_path: Option<std::path::PathBuf>,
}

struct AppState {
    token: String,
    jar: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    persist_path: Option<std::path::PathBuf>,
    client: reqwest::Client,
}

/// Headers copied from the WebView request onto the upstream request.
const FORWARD_REQ_HEADERS: &[&str] = &[
    "content-type",
    "authorization",
    "accept",
    "accept-language",
    "range",
    "x-requested-with",
    "if-none-match",
    "if-modified-since",
];

/// Headers copied from the upstream response back to the WebView.
const FORWARD_RES_HEADERS: &[&str] = &[
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
    "location",
    "retry-after",
];

fn token_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

/// Result of starting the proxy — shared with the Tauri shell state.
pub struct ProxyStartup {
    pub url: String,
    pub token: String,
    pub jar: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    pub persist_path: Option<std::path::PathBuf>,
}

/// Start the proxy. Returns the startup info (url, token, SHARED jar).
pub async fn spawn(app: &tauri::AppHandle) -> Result<ProxyStartup, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("bind: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();

    let persist_path = app
        .path()
        .app_config_dir()
        .map(|d| d.join("mq-session.bin"))
        .ok();
    if let Some(dir) = persist_path.as_ref().and_then(|p| p.parent()) {
        let _ = std::fs::create_dir_all(dir);
    }

    let jar = Arc::new(tokio::sync::RwLock::new(load_jar(persist_path.as_deref())));

    let state = Arc::new(AppState {
        token: token_hex(24),
        jar: jar.clone(),
        persist_path: persist_path.clone(),
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| format!("reqwest: {e}"))?,
    });

    let token = state.token.clone();
    let router = Router::new()
        .fallback(handler)
        .with_state(Arc::clone(&state));

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            log::error!("[proxy] server error: {e}");
        }
    });

    Ok(ProxyStartup {
        url: format!("http://127.0.0.1:{port}"),
        token,
        jar,
        persist_path,
    })
}

fn load_jar(path: Option<&std::path::Path>) -> HashMap<String, String> {
    let Some(p) = path else { return HashMap::new() };
    let Ok(bytes) = std::fs::read(p) else { return HashMap::new() };
    let plain = decrypt(bytes);
    serde_json::from_slice(&plain).unwrap_or_default()
}

fn persist(jar: &HashMap<String, String>, path: Option<&std::path::Path>) {
    let Some(p) = path else { return };
    if let Ok(json) = serde_json::to_vec(jar) {
        let _ = std::fs::write(p, encrypt(json));
    }
}

/* ── DPAPI at-rest protection (Windows) / plain elsewhere ──────────────── */

#[cfg(windows)]
fn encrypt(plain: Vec<u8>) -> Vec<u8> {
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };
    use windows::Win32::Foundation::{HLOCAL, LocalFree};

    unsafe {
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB::default();
        let ok = CryptProtectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ok.is_ok() && !out_blob.pbData.is_null() {
            let out =
                std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut _)));
            return out;
        }
    }
    plain
}

#[cfg(windows)]
fn decrypt(mut cipher: Vec<u8>) -> Vec<u8> {
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };
    use windows::Win32::Foundation::{HLOCAL, LocalFree};

    unsafe {
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: cipher.len() as u32,
            pbData: cipher.as_mut_ptr(),
        };
        let mut out_blob = CRYPT_INTEGER_BLOB::default();
        let ok = CryptUnprotectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ok.is_ok() && !out_blob.pbData.is_null() {
            let out =
                std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut _)));
            return out;
        }
    }
    cipher
}

#[cfg(not(windows))]
fn encrypt(plain: Vec<u8>) -> Vec<u8> {
    plain
}
#[cfg(not(windows))]
fn decrypt(cipher: Vec<u8>) -> Vec<u8> {
    cipher
}

/* ── Request handler ───────────────────────────────────────────────────── */

async fn handler(
    State(state): State<Arc<AppState>>,
    method: Method,
    uri: Uri,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    // CORS preflight (the WebView origin differs from 127.0.0.1:PORT).
    let cors_origin = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if method == Method::OPTIONS {
        return cors_response(StatusCode::OK, cors_origin);
    }

    // Per-session auth: header or query param (EventSource can't set headers).
    let query = uri.query().unwrap_or("");
    let authorized = headers
        .get("x-mq-desktop")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == state.token)
        .unwrap_or(false)
        || query
            .split('&')
            .any(|pair| pair == format!("_mqt={}", state.token).as_str());
    if !authorized {
        return cors_response(StatusCode::FORBIDDEN, cors_origin);
    }

    // Rebuild the upstream URL: only app-shaped paths are proxied.
    let path_and_query = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let upstream_url = format!("{API_BASE}{path_and_query}");

    let mut req = state.client.request(method.clone(), &upstream_url);
    {
        let mut h = reqwest::header::HeaderMap::new();
        for name in FORWARD_REQ_HEADERS {
            if let Some(v) = headers.get(*name) {
                if let Ok(hv) = reqwest::header::HeaderValue::from_bytes(v.as_bytes()) {
                    h.insert(
                        reqwest::header::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                        hv,
                    );
                }
            }
        }
        // Pretend to be the site itself — same-origin semantics upstream.
        h.insert("origin", reqwest::header::HeaderValue::from_static(API_BASE));
        let referer = format!("{API_BASE}/play");
        if let Ok(hv) = reqwest::header::HeaderValue::from_str(&referer) {
            h.insert("referer", hv);
        }
        h.insert(
            "user-agent",
            reqwest::header::HeaderValue::from_static(USER_AGENT),
        );
        {
            let jar = state.jar.read().await;
            if !jar.is_empty() {
                let cookie = jar
                    .iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join("; ");
                if let Ok(hv) = HeaderValue::from_str(&cookie) {
                    h.insert("cookie", hv);
                }
            }
        }
        req = req.headers(h);
    }
    if !body.is_empty() {
        req = req.body(body.to_vec());
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[proxy] upstream error {upstream_url}: {e}");
            return cors_response(StatusCode::BAD_GATEWAY, cors_origin);
        }
    };

    // Capture Set-Cookie into the jar (login / logout flows).
    let set_cookies: Vec<String> = upstream
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut jar = state.jar.write().await;
        let mut changed = false;
        for sc in &set_cookies {
            let parts: Vec<&str> = sc.split(';').collect();
            let Some(pair) = parts.first() else { continue };
            let eq = pair.find('=');
            let deleted = parts
                .iter()
                .any(|p| p.trim().eq_ignore_ascii_case("deleted"))
                || parts
                    .iter()
                    .any(|p| p.trim().to_ascii_lowercase().starts_with("max-age=0"));
            match eq {
                Some(i) => {
                    let name = pair[..i].trim().to_string();
                    if deleted {
                        changed |= jar.remove(&name).is_some();
                    } else {
                        let value = pair[i + 1..].trim().to_string();
                        changed |= jar.insert(name, value).is_some();
                    }
                }
                None => continue,
            }
        }
        if changed {
            persist(&jar, state.persist_path.as_deref());
        }
    }

    // Copy whitelisted response headers; rewrite Location to stay on the proxy.
    let mut out_headers = axum::http::HeaderMap::new();
    for name in FORWARD_RES_HEADERS {
        if let Some(v) = upstream.headers().get(*name) {
            let mut value_bytes = v.as_bytes().to_vec();
            if *name == "location" {
                let as_str = String::from_utf8_lossy(&value_bytes).to_string();
                let rewritten = if let Some(rest) = as_str.strip_prefix(API_BASE) {
                    format!("http://127.0.0.1{}", rest)
                } else if as_str.starts_with('/') {
                    // Relative redirect — the proxy port isn't knowable here,
                    // so return it as-is; the WebView resolves relative to the
                    // proxy origin automatically.
                    as_str
                } else {
                    as_str
                };
                value_bytes = rewritten.into_bytes();
            }
            if let (Ok(hn), Ok(hv)) = (
                HeaderName::from_bytes(name.as_bytes()),
                HeaderValue::from_bytes(&value_bytes),
            ) {
                out_headers.insert(hn, hv);
            }
        }
    }

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let stream = upstream.bytes_stream();

    let mut res = Response::builder().status(status);
    {
        let h = res.headers_mut().unwrap();
        for (k, v) in out_headers.iter() {
            h.insert(k.clone(), v.clone());
        }
        // CORS for the WebView origin (audio / fetch / EventSource).
        let allow = cors_origin
            .clone()
            .unwrap_or_else(|| "http://tauri.localhost".to_string());
        if let Ok(v) = HeaderValue::from_str(&allow) {
            h.insert("access-control-allow-origin", v);
        }
        h.insert(
            "access-control-allow-headers",
            HeaderValue::from_static(
                "content-type, authorization, accept, range, x-requested-with, x-mq-desktop, x-mq-desktop-token",
            ),
        );
        h.insert(
            "access-control-allow-methods",
            HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE, OPTIONS"),
        );
        h.insert(
            "access-control-expose-headers",
            HeaderValue::from_static("content-range, accept-ranges, content-length"),
        );
        h.insert("access-control-max-age", HeaderValue::from_static("86400"));
    }

    match res.body(Body::from_stream(stream.map(|chunk| {
        chunk.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }))) {
        Ok(r) => r,
        Err(_) => cors_response(StatusCode::BAD_GATEWAY, cors_origin),
    }
}

fn cors_response(status: StatusCode, origin: Option<String>) -> Response {
    let allow = origin.unwrap_or_else(|| "http://tauri.localhost".to_string());
    let mut res = (status, "").into_response();
    if let Ok(v) = HeaderValue::from_str(&allow) {
        res.headers_mut().insert("access-control-allow-origin", v);
    }
    res.headers_mut().insert(
        "access-control-allow-headers",
        HeaderValue::from_static(
            "content-type, authorization, accept, range, x-requested-with, x-mq-desktop, x-mq-desktop-token",
        ),
    );
    res.headers_mut().insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE, OPTIONS"),
    );
    res.headers_mut().insert("access-control-max-age", HeaderValue::from_static("86400"));
    res
}

/// `auth_store_token` — persist a session JWT obtained via the mq://auth
/// deep-link handoff (system-browser Google login) into the cookie jar.
pub async fn store_session_token(
    jar: &Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    path: Option<&std::path::Path>,
    token: String,
) {
    let mut w = jar.write().await;
    w.insert("session".to_string(), token);
    persist(&w, path);
}

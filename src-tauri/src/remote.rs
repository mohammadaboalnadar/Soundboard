//! Phone remote: a tiny LAN-only HTTP server (off by default) serving one page
//! and a PIN-protected JSON API. Commands are forwarded to the frontend as a
//! `remote` event; the frontend pushes a state snapshot back via `remote_sync`.

use std::net::{IpAddr, UdpSocket};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server};

const PAGE: &str = include_str!("../remote/index.html");
const FONT_UI: &[u8] = include_bytes!("../../src/fonts/SchibstedGrotesk-Variable.woff2");
const FONT_MONO: &[u8] = include_bytes!("../../src/fonts/MartianMono-Variable.woff2");

#[derive(Default)]
pub struct Remote {
    running: Mutex<Option<Running>>,
    snapshot: Arc<Mutex<String>>,
}

struct Running {
    server: Arc<Server>,
    thread: Option<JoinHandle<()>>,
    port: u16,
}

#[derive(serde::Serialize, Clone)]
pub struct RemoteInfo {
    pub url: String,
    pub port: u16,
}

#[derive(serde::Serialize, Clone)]
pub struct RemoteCommand {
    pub action: String,
    pub id: Option<String>,
}

/// The address other devices on the LAN can reach. Connecting a UDP socket
/// sends no packets; it only asks the OS which interface would be used.
pub fn lan_ip() -> Option<IpAddr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.168.0.1:9").ok()?;
    Some(s.local_addr().ok()?.ip())
}

fn constant_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn query_param<'a>(url: &'a str, key: &str) -> Option<&'a str> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then_some(v)
    })
}

impl Remote {
    pub fn start(&self, app: AppHandle, port: u16, pin: String) -> Result<RemoteInfo, String> {
        self.stop();
        if pin.len() < 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err("PIN must be 6 digits".into());
        }
        let server = Arc::new(Server::http(("0.0.0.0", port)).map_err(|e| format!("Port {port} is busy: {e}"))?);
        let srv = server.clone();
        let snapshot = self.snapshot.clone();
        let failures = Arc::new(AtomicU32::new(0));
        let thread = std::thread::spawn(move || {
            for req in srv.incoming_requests() {
                handle(&app, req, &pin, &snapshot, &failures);
            }
        });
        let ip = lan_ip().map(|i| i.to_string()).unwrap_or_else(|| "localhost".into());
        *self.running.lock().unwrap() = Some(Running { server, thread: Some(thread), port });
        Ok(RemoteInfo { url: format!("http://{ip}:{port}"), port })
    }

    pub fn stop(&self) {
        if let Some(mut r) = self.running.lock().unwrap().take() {
            r.server.unblock();
            if let Some(t) = r.thread.take() {
                let _ = t.join();
            }
            let _ = r.port;
        }
    }

    pub fn set_snapshot(&self, json: String) {
        *self.snapshot.lock().unwrap() = json;
    }
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

fn handle(app: &AppHandle, req: Request, pin: &str, snapshot: &Mutex<String>, failures: &AtomicU32) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let common = |r: Response<std::io::Cursor<Vec<u8>>>| {
        r.with_header(header("Cache-Control", "no-store"))
            .with_header(header("X-Content-Type-Options", "nosniff"))
            .with_header(header("Referrer-Policy", "no-referrer"))
    };

    if path == "/" && *req.method() == Method::Get {
        let resp = Response::from_string(PAGE)
            .with_header(header("Content-Type", "text/html; charset=utf-8"))
            .with_header(header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; font-src 'self'"));
        let _ = req.respond(common(resp));
        return;
    }
    let font = match path.as_str() {
        "/font/ui.woff2" => Some(FONT_UI),
        "/font/mono.woff2" => Some(FONT_MONO),
        _ => None,
    };
    if let Some(bytes) = font {
        let resp = Response::from_data(bytes.to_vec())
            .with_header(header("Content-Type", "font/woff2"))
            .with_header(header("Cache-Control", "max-age=86400"));
        let _ = req.respond(resp);
        return;
    }

    if !path.starts_with("/api/") {
        let _ = req.respond(common(Response::from_string("Not found").with_status_code(404)));
        return;
    }

    // Slow down guessing: every wrong PIN since the last good one adds delay.
    let given = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("X-Pin"))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default();
    if !constant_eq(&given, pin) {
        let n = failures.fetch_add(1, Ordering::Relaxed) + 1;
        std::thread::sleep(Duration::from_millis((n.min(20) as u64) * 250));
        let _ = req.respond(common(Response::from_string("{\"error\":\"pin\"}").with_status_code(401)));
        return;
    }
    failures.store(0, Ordering::Relaxed);

    let json = |s: String| common(Response::from_string(s).with_header(header("Content-Type", "application/json")));
    match (req.method().clone(), path.as_str()) {
        (Method::Get, "/api/state") => {
            let body = snapshot.lock().unwrap().clone();
            let _ = req.respond(json(if body.is_empty() { "{}".into() } else { body }));
        }
        (Method::Post, "/api/play") | (Method::Post, "/api/stop") | (Method::Post, "/api/bank") | (Method::Post, "/api/stopall") => {
            let action = path.trim_start_matches("/api/").to_string();
            let id = query_param(&url, "id").map(|s| s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').take(64).collect());
            let _ = app.emit("remote", RemoteCommand { action, id });
            let _ = req.respond(json("{\"ok\":true}".into()));
        }
        _ => {
            let _ = req.respond(common(Response::from_string("Not found").with_status_code(404)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_compare_and_query() {
        assert!(constant_eq("123456", "123456"));
        assert!(!constant_eq("123456", "123457"));
        assert!(!constant_eq("12345", "123456"));
        assert_eq!(query_param("/api/play?id=abc&x=1", "id"), Some("abc"));
        assert_eq!(query_param("/api/play", "id"), None);
    }
}

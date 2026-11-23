//! Phone remote: a tiny LAN-only HTTP server (off by default) serving one page
//! and a PIN-protected JSON API. Commands are forwarded to the frontend as a
//! `remote` event; the frontend pushes a state snapshot back via `remote_sync`.
//!
//! Hardening: wrong PINs are counted per client address and lock that address
//! out with a growing window (no sleeping on the handler thread), the Host
//! header must name this machine (DNS-rebinding guard), and the server binds
//! the LAN address so stopping it can always wake the accept loop.

use std::collections::HashMap;
use std::net::{IpAddr, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server};

const PAGE: &str = include_str!("../remote/index.html");
const FONT_UI: &[u8] = include_bytes!("../../src/fonts/SchibstedGrotesk-Variable.woff2");
const FONT_MONO: &[u8] = include_bytes!("../../src/fonts/MartianMono-Variable.woff2");
const FREE_TRIES: u32 = 5;

#[derive(Default)]
pub struct Remote {
    running: Mutex<Option<Running>>,
    snapshot: Arc<Mutex<String>>,
}

struct Running {
    server: Arc<Server>,
    thread: Option<JoinHandle<()>>,
    port: u16,
    pin: Arc<Mutex<String>>,
    url: String,
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
    let ip = s.local_addr().ok()?.ip();
    (!ip.is_unspecified()).then_some(ip)
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

/// Per-address wrong-PIN accounting. After FREE_TRIES failures an address is
/// locked out for 30 s, doubling per further failure up to 15 minutes.
#[derive(Default)]
pub struct Guard {
    clients: HashMap<IpAddr, (u32, Option<Instant>)>,
}

impl Guard {
    pub fn locked(&self, ip: IpAddr, now: Instant) -> bool {
        matches!(self.clients.get(&ip), Some((_, Some(until))) if now < *until)
    }

    pub fn fail(&mut self, ip: IpAddr, now: Instant) {
        let e = self.clients.entry(ip).or_insert((0, None));
        e.0 += 1;
        if e.0 >= FREE_TRIES {
            let secs = (30u64 << (e.0 - FREE_TRIES).min(5)).min(900);
            e.1 = Some(now + Duration::from_secs(secs));
        }
    }

    pub fn succeed(&mut self, ip: IpAddr) {
        self.clients.remove(&ip);
    }
}

/// Only accept requests addressed to this machine (blocks DNS rebinding).
fn host_ok(host: &str, lan: &str, port: u16) -> bool {
    let h = host.trim().to_ascii_lowercase();
    [lan.to_string(), "localhost".into(), "127.0.0.1".into()]
        .iter()
        .any(|name| h == *name || h == format!("{name}:{port}"))
}

impl Remote {
    pub fn start(&self, app: AppHandle, port: u16, pin: String) -> Result<RemoteInfo, String> {
        if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err("PIN must be 6 digits".into());
        }
        // Same port already serving: just swap the PIN (no rebind).
        if let Some(r) = self.running.lock().unwrap().as_ref() {
            if r.port == port {
                *r.pin.lock().unwrap() = pin;
                return Ok(RemoteInfo { url: r.url.clone(), port });
            }
        }
        self.stop();
        let ip = lan_ip();
        let bind_ip = ip.unwrap_or(IpAddr::from([127, 0, 0, 1]));
        let server = Arc::new(Server::http((bind_ip, port)).map_err(|e| format!("Port {port} is busy: {e}"))?);
        let lan = bind_ip.to_string();
        let pin = Arc::new(Mutex::new(pin));
        let (srv, snapshot, pin_t, lan_t) = (server.clone(), self.snapshot.clone(), pin.clone(), lan.clone());
        let thread = std::thread::spawn(move || {
            let mut guard = Guard::default();
            for req in srv.incoming_requests() {
                handle(&app, req, &pin_t, &snapshot, &mut guard, &lan_t, port);
            }
        });
        let url = format!("http://{lan}:{port}");
        *self.running.lock().unwrap() = Some(Running { server, thread: Some(thread), port, pin, url: url.clone() });
        Ok(RemoteInfo { url, port })
    }

    pub fn stop(&self) {
        let taken = self.running.lock().unwrap().take();
        if let Some(mut r) = taken {
            r.server.unblock();
            if let Some(t) = r.thread.take() {
                let _ = t.join();
            }
        }
    }

    pub fn set_snapshot(&self, json: String) {
        *self.snapshot.lock().unwrap() = json;
    }
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

fn header_value(req: &Request, name: &'static str) -> String {
    req.headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default()
}

fn handle(app: &AppHandle, req: Request, pin: &Mutex<String>, snapshot: &Mutex<String>, guard: &mut Guard, lan: &str, port: u16) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let common = |r: Response<std::io::Cursor<Vec<u8>>>| {
        r.with_header(header("Cache-Control", "no-store"))
            .with_header(header("X-Content-Type-Options", "nosniff"))
            .with_header(header("Referrer-Policy", "no-referrer"))
    };

    if !host_ok(&header_value(&req, "Host"), lan, port) {
        let _ = req.respond(common(Response::from_string("Bad host").with_status_code(421)));
        return;
    }

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

    let ip = req.remote_addr().map(|a| a.ip()).unwrap_or(IpAddr::from([0, 0, 0, 0]));
    let now = Instant::now();
    if guard.locked(ip, now) {
        let _ = req.respond(common(Response::from_string("{\"error\":\"locked\"}").with_status_code(429)));
        return;
    }
    let ok = constant_eq(&header_value(&req, "X-Pin"), &pin.lock().unwrap());
    if !ok {
        guard.fail(ip, now);
        let _ = req.respond(common(Response::from_string("{\"error\":\"pin\"}").with_status_code(401)));
        return;
    }
    guard.succeed(ip);

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

    #[test]
    fn guard_locks_per_address_and_does_not_reset_others() {
        let mut g = Guard::default();
        let (a, b) = (IpAddr::from([192, 168, 1, 9]), IpAddr::from([192, 168, 1, 10]));
        let t = Instant::now();
        for _ in 0..FREE_TRIES - 1 {
            g.fail(a, t);
        }
        assert!(!g.locked(a, t));
        g.fail(a, t);
        assert!(g.locked(a, t));
        g.succeed(b); // the phone succeeding must not unlock the attacker
        assert!(g.locked(a, t));
        assert!(!g.locked(a, t + Duration::from_secs(31)));
        g.fail(a, t + Duration::from_secs(31));
        assert!(g.locked(a, t + Duration::from_secs(80)), "second lockout is longer");
    }

    #[test]
    fn host_check() {
        assert!(host_ok("192.168.1.20:7878", "192.168.1.20", 7878));
        assert!(host_ok("localhost:7878", "192.168.1.20", 7878));
        assert!(!host_ok("evil.example:7878", "192.168.1.20", 7878));
        assert!(!host_ok("192.168.1.20:9999", "192.168.1.20", 7878));
    }
}

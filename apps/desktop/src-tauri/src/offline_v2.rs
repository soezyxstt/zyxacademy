use base64::Engine;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path, sync::{Mutex, atomic::{AtomicU64, Ordering}}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

pub(crate) const LIBRARY_FILE: &str = "library-v2.json";
pub(crate) static STORE_LOCK: Mutex<()> = Mutex::new(());
pub(crate) static STORE_GENERATION: AtomicU64 = AtomicU64::new(0);

pub(crate) fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

pub(crate) fn read_library(dir: &Path) -> Option<Value> {
    let path = dir.join(LIBRARY_FILE);
    if std::fs::metadata(&path).ok()?.len() > super::OFFLINE_MAX_SINGLE_BYTES as u64 { return None; }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn string<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

pub(crate) fn valid_library(value: &Value, origin: &str, now: u64) -> bool {
    let user = string(value, "userId");
    let locale = string(value, "locale");
    let scope = json!([origin, user, locale]).to_string();
    let verified = value["lastVerifiedAt"].as_u64().unwrap_or(0);
    let lease = value["accessValidUntil"].as_u64().unwrap_or(0);
    value["schemaVersion"] == 2 && !user.is_empty() && (locale == "id" || locale == "en")
        && string(value, "environment") == origin && string(value, "scopeKey") == scope
        && verified > 0 && verified <= now.saturating_add(300_000) && lease > now
        && lease <= verified.saturating_add(7 * 86_400_000)
}

pub(crate) fn readable(reading: &Value, library: Option<&Value>, origin: &str, now: u64) -> bool {
    let Some(library) = library else { return false; };
    let lease = reading["accessValidUntil"].as_u64().unwrap_or(0);
    let verified = reading["lastVerifiedAt"].as_u64().unwrap_or(0);
    valid_library(library, origin, now) && reading["schemaVersion"] == 2
        && course_access(reading, library, now)
        && reading["assetsComplete"] == true && reading["invalidated"] != true
        && string(reading, "scopeKey") == string(library, "scopeKey")
        && string(reading, "userId") == string(library, "userId")
        && string(reading, "environment") == origin && string(reading, "locale") == string(library, "locale")
        && !string(reading, "contentVersion").is_empty() && verified > 0 && verified <= now.saturating_add(300_000)
        && lease > now && lease <= verified.saturating_add(7 * 86_400_000)
}

fn course_access(reading: &Value, library: &Value, now: u64) -> bool {
    library["courses"].as_array().map(|courses| courses.iter().any(|course| {
        if string(course, "id") != string(reading, "courseId")
            || course["accessValidUntil"].as_u64().unwrap_or(library["accessValidUntil"].as_u64().unwrap_or(0)) <= now { return false; }
        let Some(allowed) = course["chapterIds"].as_array() else { return true; };
        reading["chapterIds"].as_array().map(|chapters| !chapters.is_empty() && chapters.iter().all(|chapter| allowed.contains(chapter))).unwrap_or(false)
    })).unwrap_or(false)
}

fn visible_library(mut snapshot: Value, now: u64) -> Value {
    let global_lease = snapshot["accessValidUntil"].as_u64().unwrap_or(0);
    let courses: Vec<Value> = snapshot["courses"].as_array().into_iter().flatten()
        .filter(|course| course["accessValidUntil"].as_u64().unwrap_or(global_lease) > now).cloned().collect();
    let materials: Vec<Value> = snapshot["materials"].as_array().into_iter().flatten()
        .filter(|material| material["accessValidUntil"].as_u64().unwrap_or(global_lease) > now
            && courses.iter().any(|course| course["id"] == material["courseId"])).cloned().collect();
    snapshot["courses"] = json!(courses); snapshot["materials"] = json!(materials); snapshot
}

pub(crate) fn quotas(library: Option<&Value>) -> (usize, u64) {
    let policy = library.map(|v| &v["policy"]);
    let entries = policy.and_then(|v| v["maxEntries"].as_u64()).unwrap_or(super::OFFLINE_MAX_ENTRIES as u64).clamp(25, 1000);
    let bytes = policy.and_then(|v| v["maxBytes"].as_u64()).unwrap_or(super::OFFLINE_MAX_TOTAL_BYTES).clamp(8 * 1024 * 1024, 1024 * 1024 * 1024);
    (entries as usize, bytes)
}

fn clear_store(dir: &Path) {
    STORE_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(files) = std::fs::read_dir(dir) {
        for item in files.flatten() {
            if item.file_type().map(|t| t.is_file()).unwrap_or(false) { let _ = std::fs::remove_file(item.path()); }
        }
    }
}

#[tauri::command]
pub async fn save_offline_library_snapshot(app: AppHandle, payload_json: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORE_LOCK.lock().map_err(|_| "Offline storage unavailable")?;
        if payload_json.len() > super::OFFLINE_MAX_SINGLE_BYTES { return Err("Offline library exceeds storage limit".into()); }
        let snapshot: Value = serde_json::from_str(&payload_json).map_err(|_| "Invalid offline library")?;
        let origin = super::get_desktop_server_origin();
        if !valid_library(&snapshot, &origin, now_ms()) { return Err("Offline library scope or access has expired".into()); }
        let dir = super::offline_store_dir(&app)?;
        let previous = read_library(&dir);
        if let Some(previous) = &previous {
            if previous["scopeKey"] == snapshot["scopeKey"] && previous["lastVerifiedAt"].as_u64() > snapshot["lastVerifiedAt"].as_u64() {
                return Err("A newer offline library is already stored".into());
            }
        }
        if previous.as_ref().map(|v| (&v["scopeKey"], &v["sessionId"])) != Some((&snapshot["scopeKey"], &snapshot["sessionId"])) {
            STORE_GENERATION.fetch_add(1, Ordering::SeqCst);
        }
        super::write_file_atomic(&dir.join(LIBRARY_FILE), &payload_json)?;
        super::enforce_offline_quota(&dir);
        Ok(json!({"saved":true}))
    }).await.map_err(|_| "Offline library task failed".to_string())?
}

#[tauri::command]
pub async fn get_offline_library_snapshot(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORE_LOCK.lock().map_err(|_| "Offline storage unavailable")?;
        let snapshot = read_library(&super::offline_store_dir(&app)?);
        let valid = snapshot.as_ref().map(|v| valid_library(v, &super::get_desktop_server_origin(), now_ms())).unwrap_or(false);
        let identity = snapshot.as_ref().map(|v| json!({"userId":v["userId"],"environment":v["environment"],"locale":v["locale"],"scopeKey":v["scopeKey"],"sessionId":v["sessionId"]}));
        Ok(json!({"snapshot":if valid {snapshot.clone().map(|value| visible_library(value, now_ms()))} else {None},"expired":snapshot.is_some() && !valid,"identity":identity}))
    }).await.map_err(|_| "Offline library task failed".to_string())?
}

#[tauri::command]
pub async fn clear_offline_library_snapshot(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = STORE_LOCK.lock().map_err(|_| "Offline storage unavailable")?;
        clear_store(&super::offline_store_dir(&app)?); Ok(())
    })
        .await.map_err(|_| "Offline library task failed".to_string())?
}

fn allowed_path(method: &str, path: &str) -> bool {
    if !path.starts_with('/') || path.starts_with("//") || path.contains(['\\','\r','\n','#']) { return false; }
    let route = path.split('?').next().unwrap_or("");
    (method == "POST" && route == "/api/offline/sync") || (method == "GET"
        && matches!(route, "/api/offline/resource" | "/api/offline/manifest" | "/api/offline/asset"))
}

#[tauri::command]
pub async fn offline_request(app: AppHandle, path: String, method: Option<String>, body: Option<String>, etag: Option<String>, expected_account_id: String, expected_scope_key: String) -> Result<Value, String> {
    let method = method.unwrap_or_else(|| "GET".into());
    let body = body.unwrap_or_default();
    if !allowed_path(&method, &path) || expected_account_id.is_empty() || body.len() > 64 * 1024 { return Err("Offline request is not allowed".into()); }
    let dir = super::offline_store_dir(&app)?;
    let (before, generation) = {
        let _guard = STORE_LOCK.lock().map_err(|_| "Offline storage unavailable")?;
        (read_library(&dir).ok_or("Offline account changed")?, STORE_GENERATION.load(Ordering::SeqCst))
    };
    if string(&before, "userId") != expected_account_id || string(&before, "scopeKey") != expected_scope_key { return Err("Offline account changed".into()); }
    let origin = super::configured_origin();
    let request_url = origin.join(&path).map_err(|_| "Invalid offline path")?;
    if request_url.origin() != origin.origin() { return Err("Offline origin changed".into()); }
    let window = app.get_webview_window("main").ok_or("Main window unavailable")?;
    let cookie_url = request_url.clone();
    // WebView2 cookie access must run outside synchronous commands and the UI thread.
    let cookies = tauri::async_runtime::spawn_blocking(move || window.cookies_for_url(cookie_url))
        .await.map_err(|_| "Offline session unavailable")?.map_err(|_| "Offline session unavailable")?;
    let cookie_header = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(30)).build().map_err(|_| "Offline connection unavailable")?;
    let mut request = client.request(if method == "POST" {reqwest::Method::POST} else {reqwest::Method::GET}, request_url)
        .header("Origin", origin.origin().ascii_serialization()).header("Cache-Control", "no-cache")
        .header("x-offline-account-id", &expected_account_id).header("Accept", "application/json,image/*");
    if !cookie_header.is_empty() { request = request.header(reqwest::header::COOKIE, cookie_header); }
    let session = string(&before,"sessionId");
    if !session.is_empty() { request = request.header("x-offline-session-id", session); }
    if let Some(etag) = etag.filter(|v| v.len() < 2048 && !v.contains(['\r','\n'])) { request = request.header("If-None-Match", etag); }
    if method == "POST" { request = request.header("Content-Type", "application/json").body(body); }
    let response = request.send().await.map_err(|_| "Offline sync connection failed")?;
    let mut status = response.status().as_u16();
    let response_user = response.headers().get("x-offline-account-id").and_then(|v| v.to_str().ok());
    if (200..400).contains(&status) && response_user != Some(expected_account_id.as_str()) { status = 403; }
    let mut headers = BTreeMap::new();
    if status != 403 && status != 409 {
        for name in ["content-type","etag","x-offline-account-id","x-offline-session-id","x-offline-environment","x-offline-locale","x-offline-lease-expires-at","x-offline-cursor","x-offline-revision","x-offline-validated-at"] {
            if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) { headers.insert(name.to_string(), value.to_string()); }
        }
    }
    let mut bytes = Vec::new();
    if (200..300).contains(&status) {
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| "Offline download failed")?;
            if bytes.len() + chunk.len() > super::OFFLINE_MAX_SINGLE_BYTES { return Err("Offline response too large".into()); }
            bytes.extend_from_slice(&chunk);
        }
    }
    {
        let _guard = STORE_LOCK.lock().map_err(|_| "Offline storage unavailable")?;
        let after = read_library(&dir);
        if STORE_GENERATION.load(Ordering::SeqCst) != generation
            || after.as_ref().map(|v| string(v,"scopeKey")) != Some(expected_scope_key.as_str())
            || after.as_ref().map(|v| string(v,"sessionId")) != Some(session) {
            status = 409; bytes.clear(); headers.clear();
        } else if status == 401 || status == 403 { clear_store(&dir); }
    }
    Ok(json!({"status":status,"headers":headers,"bodyBase64":base64::engine::general_purpose::STANDARD.encode(bytes)}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transport_is_fixed_to_read_only_offline_routes() {
        assert!(allowed_path("POST", "/api/offline/sync"));
        assert!(allowed_path("GET", "/api/offline/asset?kind=article&id=a"));
        for path in ["https://evil.example/api/offline/resource", "//evil.example/api/offline/resource", "/api/auth/session", "/api/offline/../auth", "/api/offline/resource#x", "/api/offline/resource\r\nCookie:x"] { assert!(!allowed_path("GET", path)); }
        assert!(!allowed_path("POST", "/api/offline/resource"));
    }
    #[test]
    fn expired_or_foreign_snapshots_never_open() {
        let origin = "https://staging.zyxacademy.com";
        let library = json!({"schemaVersion":2,"userId":"u","locale":"id","environment":origin,"scopeKey":json!([origin,"u","id"]).to_string(),"lastVerifiedAt":1000,"accessValidUntil":2000,"courses":[{"id":"math","chapterIds":["intro"],"accessValidUntil":1800}]});
        let mut reading = library.clone(); reading["contentVersion"] = json!("v1"); reading["assetsComplete"] = json!(true); reading["courseId"] = json!("math"); reading["chapterIds"] = json!(["intro"]);
        assert!(readable(&reading,Some(&library),origin,1500));
        assert!(!readable(&reading,Some(&library),origin,1900));
        assert!(!readable(&reading,Some(&library),origin,2500));
        reading["chapterIds"] = json!(["private"]);
        assert!(!readable(&reading,Some(&library),origin,1500));
        reading["chapterIds"] = json!(["intro"]);
        reading["userId"] = json!("other");
        assert!(!readable(&reading,Some(&library),origin,1500));
    }
    #[test]
    fn metadata_hides_expired_course_and_material_grants() {
        let snapshot = json!({"accessValidUntil":3000,"courses":[{"id":"a","accessValidUntil":1000},{"id":"b","accessValidUntil":2500}],"materials":[{"id":"hidden-course","courseId":"a"},{"id":"expired-material","courseId":"b","accessValidUntil":1000},{"id":"visible","courseId":"b","accessValidUntil":2500}]});
        let visible = visible_library(snapshot, 1500);
        assert_eq!(visible["courses"].as_array().unwrap().len(), 1);
        assert_eq!(visible["materials"].as_array().unwrap().len(), 1);
        assert_eq!(visible["materials"][0]["id"], "visible");
    }
}

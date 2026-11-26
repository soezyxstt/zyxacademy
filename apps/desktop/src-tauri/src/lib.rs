mod update_delta;
mod window_state;

use futures_util::StreamExt;
use serde::Serialize;
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const SERVER_URL_ENV: &str = "ZYX_DESKTOP_SERVER_URL";
const OFFLINE_MAX_ENTRIES: usize = 25;
const OFFLINE_MAX_TOTAL_BYTES: u64 = 8 * 1024 * 1024;
const OFFLINE_MAX_SINGLE_BYTES: usize = 2 * 1024 * 1024;
const OFFLINE_MAX_POSITION_BYTES: usize = 8192;

fn offline_key_to_filename(key: &str) -> Option<String> {
    if key.is_empty() {
        return None;
    }
    // Dual 64-bit FNV-1a hash (128-bit hex) to guarantee safe, deterministic filenames without path traversal.
    let mut h1: u64 = 0xcbf29ce484222325;
    let mut h2: u64 = 0x84222325cbf29ce4;
    for byte in key.as_bytes() {
        h1 ^= u64::from(*byte);
        h1 = h1.wrapping_mul(0x100000001b3);
        h2 = h2.wrapping_mul(0x100000001b3);
        h2 ^= u64::from(*byte);
    }
    Some(format!("{h1:016x}{h2:016x}.json"))
}

fn offline_store_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve local data directory: {e}"))?;
    let dir = base.join("offline-readings");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create offline readings directory: {e}"))?;
    Ok(dir)
}

fn write_file_atomic(path: &std::path::Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp)
            .map_err(|e| format!("Failed to create temp offline file: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write offline file: {e}"))?;
        file.flush()
            .map_err(|e| format!("Failed to flush offline file: {e}"))?;
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Failed to finalize offline file: {e}")
    })
}

fn merge_newer_reading_position(
    existing: &serde_json::Value,
    incoming: &mut serde_json::Value,
) {
    let Some(existing_pos) = existing.get("readingPosition").filter(|v| v.is_object()) else {
        return;
    };
    let existing_at = existing_pos
        .get("updatedAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let incoming_at = incoming
        .get("readingPosition")
        .and_then(|v| v.get("updatedAt"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if existing_at > incoming_at {
        if let Some(obj) = incoming.as_object_mut() {
            obj.insert("readingPosition".to_string(), existing_pos.clone());
        }
    }
}

struct OfflineEntryMeta {
    path: std::path::PathBuf,
    last_accessed_at: i64,
    size_bytes: u64,
    json: serde_json::Value,
}

fn load_all_offline_entries(dir: &std::path::Path) -> Vec<OfflineEntryMeta> {
    let mut entries = Vec::new();
    let Ok(read_dir) = std::fs::read_dir(dir) else {
        return entries;
    };
    for item in read_dir.flatten() {
        let path = item.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Ok(meta) = item.metadata() else {
            continue;
        };
        if !meta.is_file() || meta.len() > OFFLINE_MAX_SINGLE_BYTES as u64 {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        let last_accessed_at = json
            .get("lastAccessedAt")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let declared_size = json.get("sizeBytes").and_then(|v| v.as_u64()).unwrap_or(0);
        entries.push(OfflineEntryMeta {
            path,
            last_accessed_at,
            size_bytes: declared_size.max(meta.len()),
            json,
        });
    }
    entries
}

fn enforce_offline_quota(dir: &std::path::Path) {
    let mut entries = load_all_offline_entries(dir);
    entries.sort_by_key(|e| e.last_accessed_at);
    let mut total_bytes: u64 = entries.iter().map(|e| e.size_bytes).sum();
    let mut remaining = entries.len();
    for entry in entries {
        if remaining <= OFFLINE_MAX_ENTRIES && total_bytes <= OFFLINE_MAX_TOTAL_BYTES {
            break;
        }
        if std::fs::remove_file(&entry.path).is_ok() {
            remaining = remaining.saturating_sub(1);
            total_bytes = total_bytes.saturating_sub(entry.size_bytes);
        }
    }
}

#[tauri::command]
fn get_desktop_server_origin() -> String {
    configured_origin().as_str().trim_end_matches('/').to_string()
}

#[tauri::command]
async fn save_offline_reading(
    app: AppHandle,
    key: String,
    payload_json: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_name =
            offline_key_to_filename(&key).ok_or_else(|| "Invalid offline key".to_string())?;
        if payload_json.is_empty() || payload_json.len() > OFFLINE_MAX_SINGLE_BYTES {
            return Err("Offline reading payload invalid or exceeds size limit".to_string());
        }
        let mut incoming: serde_json::Value =
            serde_json::from_str(&payload_json).map_err(|_| "Invalid JSON payload".to_string())?;
        if !incoming.is_object() {
            return Err("Offline reading payload must be a JSON object".to_string());
        }
        let dir = offline_store_dir(&app)?;
        let target = dir.join(file_name);
        if target.is_file() {
            if let Ok(raw) = std::fs::read_to_string(&target) {
                if let Ok(existing) = serde_json::from_str::<serde_json::Value>(&raw) {
                    merge_newer_reading_position(&existing, &mut incoming);
                }
            }
        }
        let serialized = serde_json::to_string(&incoming)
            .map_err(|e| format!("Failed to serialize offline reading: {e}"))?;
        write_file_atomic(&target, &serialized)?;
        enforce_offline_quota(&dir);
        Ok(true)
    })
    .await
    .map_err(|e| format!("Offline save task failed: {e}"))?
}

#[tauri::command]
async fn save_offline_reading_position(
    app: AppHandle,
    key: String,
    position_json: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file_name) = offline_key_to_filename(&key) else {
            return Ok(false);
        };
        if position_json.is_empty() || position_json.len() > OFFLINE_MAX_POSITION_BYTES {
            return Err("Invalid reading position payload".to_string());
        }
        let dir = offline_store_dir(&app)?;
        let target = dir.join(file_name);
        if !target.is_file() {
            return Ok(false);
        }
        let position: serde_json::Value = serde_json::from_str(&position_json)
            .map_err(|_| "Invalid position JSON".to_string())?;
        if !position.is_object() {
            return Err("Position payload must be a JSON object".to_string());
        }
        let raw = std::fs::read_to_string(&target)
            .map_err(|e| format!("Failed to read offline item: {e}"))?;
        let mut parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|_| "Corrupt offline reading".to_string())?;
        let existing_at = parsed
            .get("readingPosition")
            .and_then(|v| v.get("updatedAt"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let incoming_at = position
            .get("updatedAt")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if incoming_at >= existing_at {
            if let Some(obj) = parsed.as_object_mut() {
                obj.insert("readingPosition".to_string(), position);
            }
            let serialized = serde_json::to_string(&parsed)
                .map_err(|e| format!("Failed to serialize reading position: {e}"))?;
            write_file_atomic(&target, &serialized)?;
        }
        Ok(true)
    })
    .await
    .map_err(|e| format!("Offline position save task failed: {e}"))?
}

#[tauri::command]
async fn list_offline_readings(app: AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = offline_store_dir(&app)?;
        let mut entries = load_all_offline_entries(&dir);
        entries.sort_by(|a, b| b.last_accessed_at.cmp(&a.last_accessed_at));

        let mut total_bytes: u64 = 0;
        let mut items = Vec::with_capacity(entries.len());
        for entry in &entries {
            total_bytes += entry.size_bytes;
            items.push(serde_json::json!({
                "key": entry.json.get("key").and_then(|v| v.as_str()).unwrap_or(""),
                "title": entry.json.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "courseTitle": entry.json.get("courseTitle").and_then(|v| v.as_str()).unwrap_or(""),
                "chapterTitle": entry.json.get("chapterTitle").and_then(|v| v.as_str()).unwrap_or(""),
                "estimatedMinutes": entry.json.get("estimatedMinutes").and_then(|v| v.as_i64()).unwrap_or(0),
                "sizeBytes": entry.size_bytes,
                "savedAt": entry.json.get("savedAt").and_then(|v| v.as_i64()).unwrap_or(0),
                "lastAccessedAt": entry.last_accessed_at,
            }));
        }

        Ok(serde_json::json!({
            "items": items,
            "count": entries.len(),
            "totalBytes": total_bytes,
            "maxEntries": OFFLINE_MAX_ENTRIES,
            "maxBytes": OFFLINE_MAX_TOTAL_BYTES,
        }))
    })
    .await
    .map_err(|e| format!("Offline list task failed: {e}"))?
}

#[tauri::command]
async fn get_offline_reading(app: AppHandle, key: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_name = offline_key_to_filename(&key).ok_or_else(|| "Invalid key".to_string())?;
        let dir = offline_store_dir(&app)?;
        let target = dir.join(file_name);
        if !target.is_file() {
            return Ok(serde_json::json!({ "reading": serde_json::Value::Null }));
        }
        let raw = std::fs::read_to_string(&target)
            .map_err(|e| format!("Failed to read offline item: {e}"))?;
        let mut parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|_| "Corrupt offline reading".to_string())?;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if let Some(obj) = parsed.as_object_mut() {
            obj.insert("lastAccessedAt".to_string(), serde_json::json!(now_ms));
        }
        if let Ok(serialized) = serde_json::to_string(&parsed) {
            let _ = write_file_atomic(&target, &serialized);
        }
        Ok(serde_json::json!({ "reading": parsed }))
    })
    .await
    .map_err(|e| format!("Offline get task failed: {e}"))?
}

#[tauri::command]
async fn remove_offline_reading(app: AppHandle, key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file_name) = offline_key_to_filename(&key) else {
            return Ok(());
        };
        let dir = offline_store_dir(&app)?;
        let target = dir.join(file_name);
        if target.exists() {
            let _ = std::fs::remove_file(target);
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Offline remove task failed: {e}"))?
}

#[tauri::command]
async fn clear_other_offline_users(app: AppHandle, user_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = offline_store_dir(&app)?;
        let entries = load_all_offline_entries(&dir);
        for entry in entries {
            let owner = entry
                .json
                .get("userId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if user_id.is_empty() || owner != user_id {
                let _ = std::fs::remove_file(entry.path);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Offline clear task failed: {e}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateInfo {
    version: &'static str,
    channel: &'static str,
    build_id: &'static str,
    platform: &'static str,
    app_image: bool,
}

#[derive(Serialize, Clone)]
struct UpdateProgressPayload {
    percent: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeUpdaterCheckResult {
    configured: bool,
    update_available: bool,
    version: Option<String>,
    notes: Option<String>,
}

fn build_channel() -> &'static str {
    match option_env!("ZYX_BUILD_CHANNEL") {
        Some("nightly") => "nightly",
        _ => "stable",
    }
}

fn build_sha() -> &'static str {
    option_env!("ZYX_BUILD_SHA").unwrap_or("dev")
}

fn desktop_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn default_server_url() -> &'static str {
    if build_channel() == "nightly" {
        "https://staging.zyxacademy.com"
    } else {
        "https://www.zyxacademy.com"
    }
}

fn deep_link_scheme() -> &'static str {
    if build_channel() == "nightly" {
        "zyxacademy-nightly"
    } else {
        "zyxacademy"
    }
}

fn validate_release_asset(raw_url: &str) -> Result<(Url, String), String> {
    let lower_raw = raw_url.to_ascii_lowercase();
    if lower_raw.contains("..")
        || lower_raw.contains("%2e")
        || lower_raw.contains("%2f")
        || lower_raw.contains("%5c")
        || lower_raw.contains('\\')
        || lower_raw.contains('?')
        || lower_raw.contains('#')
    {
        return Err("Invalid update URL".to_string());
    }

    let parsed = Url::parse(raw_url).map_err(|_| "Malformed update URL".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Invalid update URL".to_string());
    }

    let segments: Vec<&str> = parsed
        .path_segments()
        .ok_or_else(|| "Invalid update URL path".to_string())?
        .collect();
    // Exact 6 segments: soezyxstt / zyxacademy / releases / download / <tag> / <asset>
    if segments.len() != 6
        || segments[0] != "soezyxstt"
        || segments[1] != "zyxacademy"
        || segments[2] != "releases"
        || segments[3] != "download"
    {
        return Err("Invalid update URL path".to_string());
    }

    let tag = segments[4];
    let asset = segments[5];
    if tag.is_empty() || asset.is_empty() || tag == "." || asset == "." {
        return Err("Invalid update file name".to_string());
    }

    let asset_name = asset.to_string();
    Ok((parsed, asset_name))
}

fn validate_update_download_url(raw_url: &str) -> Result<(Url, String), String> {
    let (parsed, asset) = validate_release_asset(raw_url)?;
    let lower_asset = asset.to_ascii_lowercase();
    let allowed_ext = lower_asset.ends_with(".exe")
        || lower_asset.ends_with(".dmg")
        || lower_asset.ends_with(".deb")
        || lower_asset.ends_with(".appimage");
    if !allowed_ext {
        return Err("Unsupported update file type".to_string());
    }

    Ok((parsed, asset))
}

fn is_channel_release_asset(url: &Url, asset: &str) -> bool {
    let Some(tag) = url
        .path_segments()
        .and_then(|mut segments| segments.nth(4))
    else {
        return false;
    };
    if build_channel() == "nightly" {
        asset.starts_with("zyx-academy-nightly-")
            && tag.starts_with("app-v")
            && tag.contains("-nightly.")
    } else {
        asset.starts_with("zyx-academy-")
            && !asset.starts_with("zyx-academy-nightly-")
            && tag.starts_with("app-v")
            && !tag.contains("-nightly.")
    }
}

fn updater_pubkey(app: &AppHandle) -> Option<String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.get("pubkey"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn is_allowed_redirect_host(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    lower == "github.com"
        || lower == "objects.githubusercontent.com"
        || lower == "release-assets.githubusercontent.com"
}

#[tauri::command]
fn get_app_update_info() -> AppUpdateInfo {
    AppUpdateInfo {
        version: env!("ZYX_BUILD_VERSION"),
        channel: build_channel(),
        build_id: build_sha(),
        platform: desktop_platform(),
        app_image: cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some(),
    }
}

fn is_updater_config_valid(updater_value: Option<&serde_json::Value>) -> bool {
    let Some(obj) = updater_value.and_then(|v| v.as_object()) else {
        return false;
    };

    let has_pubkey = obj
        .get("pubkey")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let has_endpoints = obj
        .get("endpoints")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .any(|item| item.as_str().map(|s| !s.trim().is_empty()).unwrap_or(false))
        })
        .unwrap_or(false);

    has_pubkey && has_endpoints
}

fn has_updater_config(app: &AppHandle) -> bool {
    is_updater_config_valid(app.config().plugins.0.get("updater"))
}

#[tauri::command]
async fn check_native_updater(app: AppHandle) -> Result<NativeUpdaterCheckResult, String> {
    if !has_updater_config(&app) {
        return Ok(NativeUpdaterCheckResult {
            configured: false,
            update_available: false,
            version: None,
            notes: None,
        });
    }

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(_) => {
            return Ok(NativeUpdaterCheckResult {
                configured: false,
                update_available: false,
                version: None,
                notes: None,
            });
        }
    };

    match updater.check().await {
        Ok(Some(update)) if matches_installed_bundle(&update) => Ok(NativeUpdaterCheckResult {
            configured: true,
            update_available: true,
            version: Some(update.version),
            notes: update.body,
        }),
        Ok(_) => Ok(NativeUpdaterCheckResult {
            configured: true,
            update_available: false,
            version: None,
            notes: None,
        }),
        Err(err) => Err(format!("Updater check failed: {err}")),
    }
}

fn matches_installed_bundle(update: &tauri_plugin_updater::Update) -> bool {
    #[cfg(target_os = "linux")]
    if build_channel() == "nightly" {
        use tauri::utils::config::BundleType;
        if matches!(tauri::utils::platform::bundle_type(), Some(BundleType::Deb)) {
            return update.download_url.path().ends_with(".deb");
        }
    }
    let _ = update;
    true
}

fn make_progress_reporter(app: &AppHandle) -> impl FnMut(usize, Option<u64>) {
    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;
    move |chunk_length: usize, content_length: Option<u64>| {
        downloaded = downloaded.saturating_add(chunk_length as u64);
        if let Some(total) = content_length.filter(|&v| v > 0) {
            let percent = ((downloaded.saturating_mul(100)) / total).min(100) as u8;
            if percent != last_percent {
                last_percent = percent;
                let _ =
                    progress_app.emit("zyx-update-progress", UpdateProgressPayload { percent });
            }
        }
    }
}

#[tauri::command]
async fn install_native_update(app: AppHandle) -> Result<String, String> {
    if !has_updater_config(&app) {
        return Err("NATIVE_UPDATER_UNCONFIGURED".to_string());
    }

    let updater = app
        .updater()
        .map_err(|_| "NATIVE_UPDATER_UNCONFIGURED".to_string())?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for update: {e}"))?
    else {
        return Err("NO_UPDATE_AVAILABLE".to_string());
    };

    if !matches_installed_bundle(&update) {
        return Err("NO_UPDATE_AVAILABLE".to_string());
    }
    let guard = lock_update()?;

    let release_asset = validate_release_asset(update.download_url.as_str())
        .ok()
        .filter(|(url, asset)| is_channel_release_asset(url, asset));
    if let Some((url, asset)) = release_asset {
        let mut bytes = None;
        let mut from_installed_executable = false;

        // First try installed-executable delta (e.g. Windows NSIS .exe or Linux .deb)
        // verified with the same Minisign public key used by the native updater.
        if supports_installed_executable_patch(&asset) {
            if let (Ok(executable), Ok(client), Some(pubkey)) = (
                std::env::current_exe(),
                installer_client(),
                updater_pubkey(&app),
            ) {
                if let Some(reconstructed) = update_delta::download_installer(
                    &client,
                    &url,
                    &asset,
                    &executable,
                    Some(&pubkey),
                    make_progress_reporter(&app),
                )
                .await
                {
                    bytes = Some(reconstructed);
                    from_installed_executable = true;
                }
            }
        }

        let cache = app
            .path()
            .app_cache_dir()
            .ok()
            .map(|dir| dir.join("updates").join("signed-package"));
        if bytes.is_none() {
            if let Some(base) = cache.as_deref().and_then(update_delta::read_base) {
                if update.verify(&base).is_ok() {
                    bytes = Some(base);
                } else if let Ok(client) = installer_client() {
                    bytes = update_delta::download(
                        &client,
                        &url,
                        &asset,
                        &base,
                        make_progress_reporter(&app),
                    )
                    .await
                    .filter(|target| update.verify(target).is_ok());
                }
            }
        }
        #[cfg(target_os = "linux")]
        if bytes.is_none() && asset.ends_with(".AppImage") {
            if let (Some(base), Ok(client)) = (
                std::env::var_os("APPIMAGE")
                    .as_deref()
                    .and_then(|path| update_delta::read_base(std::path::Path::new(path))),
                installer_client(),
            ) {
                bytes = update_delta::download(
                    &client,
                    &url,
                    &asset,
                    &base,
                    make_progress_reporter(&app),
                )
                .await
                .filter(|target| update.verify(target).is_ok());
            }
        }
        let bytes = match bytes {
            Some(bytes) => bytes,
            None => update
                .download(make_progress_reporter(&app), || {})
                .await
                .map_err(|e| format!("Failed to download update: {e}"))?,
        };
        if !from_installed_executable {
            if let Some(path) = cache.as_deref() {
                let _ = update_delta::cache(path, &bytes);
            }
        }
        update.install(&bytes)
    } else {
        update
            .download_and_install(make_progress_reporter(&app), || {})
            .await
    }
    .map_err(|e| format!("Failed to install update: {e}"))?;

    let _ = app.emit(
        "zyx-update-progress",
        UpdateProgressPayload { percent: 100 },
    );

    restart_after_update(app, guard);
    Ok("restarting".to_string())
}

fn restart_after_update(restart_handle: AppHandle, guard: UpdateGuard) {
    std::thread::spawn(move || {
        let _guard = guard;
        std::thread::sleep(std::time::Duration::from_millis(250));
        window_state::flush_window_state(&restart_handle);
        restart_handle.restart();
    });
}

static INSTALLING_UPDATE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

struct UpdateGuard;

impl Drop for UpdateGuard {
    fn drop(&mut self) {
        INSTALLING_UPDATE.store(false, std::sync::atomic::Ordering::Release);
    }
}

fn lock_update() -> Result<UpdateGuard, String> {
    INSTALLING_UPDATE
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::Acquire,
            std::sync::atomic::Ordering::Relaxed,
        )
        .map(|_| UpdateGuard)
        .map_err(|_| "An update is already being installed".to_string())
}

fn installer_client() -> Result<reqwest::Client, String> {
    let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            return attempt.error("Too many redirects");
        }
        let target = attempt.url();
        let valid_host = target
            .host_str()
            .map(is_allowed_redirect_host)
            .unwrap_or(false);
        if target.scheme() == "https" && valid_host {
            attempt.follow()
        } else {
            attempt.error("Disallowed redirect host")
        }
    });

    reqwest::Client::builder()
        .redirect(redirect_policy)
        .user_agent("ZyxAcademyUpdater/1.0")
        .build()
        .map_err(|e| format!("Failed to initialize updater client: {e}"))
}

#[tauri::command]
async fn download_and_launch_update(app: AppHandle, url: String) -> Result<String, String> {
    let (parsed, file_name) = validate_update_download_url(&url)?;
    let guard = lock_update()?;
    let client = installer_client()?;

    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to resolve private app cache directory: {e}"))?;
    let update_dir = cache_root.join("updates");
    std::fs::create_dir_all(&update_dir)
        .map_err(|e| format!("Failed to create updates directory: {e}"))?;
    let target_path = update_dir.join(&file_name);
    let channel_asset = is_channel_release_asset(&parsed, &file_name);
    let nightly = build_channel() == "nightly" && channel_asset;

    if channel_asset && supports_installed_executable_patch(&file_name) {
        if let Ok(executable) = std::env::current_exe() {
            let required_pubkey = updater_pubkey(&app);
            if let Some(bytes) = update_delta::download_installer(
                &client,
                &parsed,
                &file_name,
                &executable,
                required_pubkey.as_deref(),
                make_progress_reporter(&app),
            )
            .await
            {
                // Keep the reconstructed installer out of the full installer cache.
                let reconstructed = update_dir.join(format!("delta-{file_name}"));
                if update_delta::cache(&reconstructed, &bytes).is_ok() {
                    if let Ok(result) = launch_installer(&app, &reconstructed, &file_name) {
                        let _ = app.emit(
                            "zyx-update-progress",
                            UpdateProgressPayload { percent: 100 },
                        );
                        return Ok(result);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    let installed_app_image = if nightly && file_name.ends_with(".AppImage") {
        let target = parsed
            .path_segments()
            .and_then(|mut segments| segments.nth(4))
            .and_then(|tag| tag.strip_prefix("app-v"))
            .and_then(|tag| tag.rsplit_once("-nightly."))
            .and_then(|(version, suffix)| {
                let (_, build_id) = suffix.split_once('.')?;
                let version = semver::Version::parse(version).ok()?;
                Some((version, build_id))
            });
        let installed_version = &app.package_info().version;
        if target.as_ref().is_none_or(|(version, build_id)| {
            version < installed_version
                || (version == installed_version && build_id.eq_ignore_ascii_case(build_sha()))
        }) {
            return Err("AppImage update is older or already installed".to_string());
        }
        app.env()
            .appimage
            .and_then(|path| std::fs::canonicalize(path).ok())
    } else {
        None
    };
    #[cfg(not(target_os = "linux"))]
    let installed_app_image: Option<std::path::PathBuf> = None;

    let mut reconstructed = false;
    if channel_asset {
        let base_path = installed_app_image
            .clone()
            .or_else(|| cached_installer(&update_dir, &file_name));
        if let Some(base) = base_path.as_deref().and_then(update_delta::read_base) {
            if let Some(bytes) = update_delta::download(
                &client,
                &parsed,
                &file_name,
                &base,
                make_progress_reporter(&app),
            )
            .await
            {
                if update_delta::matches_release_checksum(&client, &parsed, &file_name, &bytes)
                    .await
                    .is_some()
                    && update_delta::cache(&target_path, &bytes).is_ok()
                {
                    reconstructed = true;
                }
            }
        }
    }

    if !reconstructed {
        download_installer(&app, &client, &parsed, &target_path).await?;
    }
    let _ = app.emit(
        "zyx-update-progress",
        UpdateProgressPayload { percent: 100 },
    );

    #[cfg(target_os = "linux")]
    if let Some(path) = installed_app_image {
        let bytes = update_delta::read_base(&target_path)
            .filter(|bytes| bytes.starts_with(b"\x7fELF") && bytes.get(8..11) == Some(b"AI\x02"))
            .ok_or_else(|| "Invalid AppImage update".to_string())?;
        if !reconstructed
            && update_delta::matches_release_checksum(&client, &parsed, &file_name, &bytes)
                .await
                .is_none()
        {
            return Err("Could not verify the AppImage release checksum".to_string());
        }
        if replace_app_image(&path, &bytes).is_ok() {
            restart_after_update(app, guard);
            return Ok("restarting".to_string());
        }
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Could not prepare the downloaded AppImage: {e}"))?;
        return Err(format!("APPIMAGE_MANUAL_REPLACE:{}", target_path.display()));
    }

    let result = launch_installer(&app, &target_path, &file_name);
    drop(guard);
    result
}

fn supports_installed_executable_patch(file_name: &str) -> bool {
    #[cfg(target_os = "linux")]
    {
        use tauri::utils::config::BundleType;
        file_name.ends_with(".deb")
            && matches!(tauri::utils::platform::bundle_type(), Some(BundleType::Deb))
    }
    #[cfg(not(target_os = "linux"))]
    {
        cfg!(target_os = "windows") && file_name.ends_with(".exe")
    }
}

#[cfg(target_os = "linux")]
fn replace_app_image(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    temp.write_all(bytes)?;
    temp.as_file()
        .set_permissions(std::fs::metadata(path)?.permissions())?;
    temp.as_file().sync_all()?;
    temp.persist(path)?;
    Ok(())
}

async fn download_installer(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &Url,
    target: &std::path::Path,
) -> Result<(), String> {
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let directory = target
        .parent()
        .ok_or_else(|| "Missing installer directory".to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(directory)
        .map_err(|e| format!("Failed to create installer file: {e}"))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write update file: {e}"))?;
        downloaded += bytes.len() as u64;
        if total_size > 0 {
            let percent = ((downloaded.saturating_mul(100)) / total_size).min(100) as u8;
            if percent != last_percent {
                last_percent = percent;
                let _ = app.emit("zyx-update-progress", UpdateProgressPayload { percent });
            }
        }
    }

    file.flush()
        .map_err(|e| format!("Failed to finalize update file: {e}"))?;
    file.persist(target)
        .map_err(|e| format!("Failed to finalize installer file: {e}"))?;
    Ok(())
}

fn cached_installer(directory: &std::path::Path, target: &str) -> Option<std::path::PathBuf> {
    let (_, extension) = target.rsplit_once('.')?;
    let is_nightly = build_channel() == "nightly";
    std::fs::read_dir(directory)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            let matches_channel = if is_nightly {
                name.starts_with("zyx-academy-nightly-")
            } else {
                name.starts_with("zyx-academy-") && !name.starts_with("zyx-academy-nightly-")
            };
            if !matches_channel
                || name == target
                || path.extension().and_then(|ext| ext.to_str()) != Some(extension)
            {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn launch_installer(
    app: &AppHandle,
    target_path: &std::path::Path,
    file_name: &str,
) -> Result<String, String> {
    #[cfg(unix)]
    {
        if file_name.to_ascii_lowercase().ends_with(".appimage") {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(target_path, std::fs::Permissions::from_mode(0o755));
        }
    }

    let path_str = target_path.to_string_lossy().to_string();
    app.opener()
        .open_path(&path_str, None::<&str>)
        .map_err(|e| format!("Failed to launch installer: {e}"))?;

    Ok(path_str)
}

fn is_allowed_override_origin(parsed: &Url) -> bool {
    if !parsed.has_host() {
        return false;
    }

    #[cfg(debug_assertions)]
    {
        if matches!(parsed.scheme(), "http" | "https") {
            return true;
        }
    }

    #[cfg(not(debug_assertions))]
    {
        if parsed.scheme() == "https" {
            if let Some(host) = parsed.host_str() {
                return host == "zyxacademy.com" || host.ends_with(".zyxacademy.com");
            }
        }
    }

    false
}

fn configured_origin() -> Url {
    if let Ok(raw) = std::env::var(SERVER_URL_ENV) {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if let Ok(parsed) = Url::parse(trimmed) {
                if is_allowed_override_origin(&parsed) {
                    return parsed;
                }
            }
        }
    }

    Url::parse(default_server_url()).expect("default server URL must be valid")
}

fn resolve_deep_link_target(origin: &Url, incoming: &Url, scheme: &str) -> Option<Url> {
    if !incoming.scheme().eq_ignore_ascii_case(scheme) {
        return None;
    }

    let mut path_segments = String::new();
    if let Some(host) = incoming.host_str() {
        if !host.is_empty() {
            path_segments.push('/');
            path_segments.push_str(host);
        }
    }

    let raw_path = incoming.path();
    if !raw_path.is_empty() && raw_path != "/" {
        let cleaned = raw_path.trim_start_matches('/');
        if cleaned.contains('\\') {
            return None;
        }
        if !cleaned.is_empty() {
            path_segments.push('/');
            path_segments.push_str(cleaned);
        }
    }

    if path_segments.is_empty() {
        path_segments.push('/');
    }

    if path_segments.starts_with("//") || path_segments.contains('\\') {
        return None;
    }

    let mut target = origin.clone();
    target.set_path(&path_segments);
    target.set_query(incoming.query());
    target.set_fragment(incoming.fragment());

    if target.origin() != origin.origin() {
        return None;
    }

    Some(target)
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn extract_deep_link_from_args(args: &[String], scheme: &str) -> Option<Url> {
    args.iter().find_map(|arg| {
        let trimmed = arg.trim();
        let parsed = Url::parse(trimmed).ok()?;
        if parsed.scheme().eq_ignore_ascii_case(scheme) {
            Some(parsed)
        } else {
            None
        }
    })
}

fn route_deep_link(app: &AppHandle, origin: &Url, incoming: &Url) {
    let Some(target) = resolve_deep_link_target(origin, incoming, deep_link_scheme()) else {
        return;
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(target);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let origin = configured_origin();
    let single_instance_origin = origin.clone();
    let initial_origin = origin.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(move |app, argv, _cwd| {
            if let Some(url) = extract_deep_link_from_args(&argv, deep_link_scheme()) {
                route_deep_link(app, &single_instance_origin, &url);
            } else {
                focus_main_window(app);
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            get_app_update_info,
            check_native_updater,
            install_native_update,
            download_and_launch_update,
            get_desktop_server_origin,
            save_offline_reading,
            save_offline_reading_position,
            list_offline_readings,
            get_offline_reading,
            remove_offline_reading,
            clear_other_offline_users
        ])
        .setup(move |app| {
            if has_updater_config(app.handle()) {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            if let Some(window) = app.get_webview_window("main") {
                window_state::restore_window_geometry(app.handle(), &window);
                window_state::attach_window_state_listeners(app.handle().clone(), &window);
            }
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    route_deep_link(app.handle(), &initial_origin, &url);
                }
            }

            let handle = app.handle().clone();
            let deep_link_origin = initial_origin.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    route_deep_link(&handle, &deep_link_origin, &url);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zyx Academy desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_deep_link_with_host_path_query_and_fragment() {
        let origin = Url::parse("https://www.zyxacademy.com").unwrap();
        let link = Url::parse("zyxacademy://courses/123?tab=notes#top").unwrap();
        let target = resolve_deep_link_target(&origin, &link, "zyxacademy").unwrap();
        assert_eq!(
            target.as_str(),
            "https://www.zyxacademy.com/courses/123?tab=notes#top"
        );
    }

    #[test]
    fn resolves_nightly_deep_link_to_staging_origin() {
        let origin = Url::parse("https://staging.zyxacademy.com").unwrap();
        let link = Url::parse("zyxacademy-nightly:///dashboard").unwrap();
        let target = resolve_deep_link_target(&origin, &link, "zyxacademy-nightly").unwrap();
        assert_eq!(target.as_str(), "https://staging.zyxacademy.com/dashboard");
    }

    #[test]
    fn prevents_scheme_relative_and_backslash_open_redirects() {
        let origin = Url::parse("https://www.zyxacademy.com").unwrap();
        let slash_link = Url::parse("zyxacademy:////evil.com/phish").unwrap();
        let resolved = resolve_deep_link_target(&origin, &slash_link, "zyxacademy").unwrap();
        assert_eq!(resolved.origin(), origin.origin());
        assert_eq!(resolved.as_str(), "https://www.zyxacademy.com/evil.com/phish");

        let backslash_link = Url::parse("zyxacademy:///\\evil.com").unwrap();
        assert!(resolve_deep_link_target(&origin, &backslash_link, "zyxacademy").is_none());
    }

    #[test]
    fn validates_update_download_urls_strictly() {
        assert!(validate_update_download_url(
            "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.1.0/zyx.exe"
        )
        .is_ok());
        assert!(validate_update_download_url("https://evil.com/zyx.exe").is_err());
        assert!(validate_update_download_url(
            "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.1.0/script.sh"
        )
        .is_err());
        assert!(validate_update_download_url(
            "https://github.com/soezyxstt/zyxacademy/releases/download/../../../../attacker/repo/releases/download/v1/malware.exe"
        )
        .is_err());
        assert!(validate_update_download_url(
            "https://github.com/soezyxstt/zyxacademy/releases/download/v1/script.bat?x=.exe"
        )
        .is_err());
        assert!(!is_allowed_redirect_host("raw.githubusercontent.com"));
        assert!(is_allowed_redirect_host("objects.githubusercontent.com"));
    }

    #[test]
    fn ignores_unknown_schemes() {
        let origin = Url::parse("https://www.zyxacademy.com").unwrap();
        let link = Url::parse("https://example.com/courses").unwrap();
        assert!(resolve_deep_link_target(&origin, &link, "zyxacademy").is_none());
    }

    #[test]
    fn hashes_offline_keys_deterministically_without_traversal() {
        assert!(offline_key_to_filename("").is_none());
        let name = offline_key_to_filename("u1::c1::../etc/passwd").unwrap();
        assert!(name.ends_with(".json"));
        assert!(!name.contains('/'));
        assert!(!name.contains('\\'));
        assert!(!name.contains(".."));
        assert_eq!(name, offline_key_to_filename("u1::c1::../etc/passwd").unwrap());
        assert_ne!(name, offline_key_to_filename("u1::c1::other").unwrap());
    }

    #[test]
    fn preserves_newer_reading_position_on_resave() {
        let existing = serde_json::json!({
            "key": "u1::c1::m1",
            "readingPosition": { "scrollY": 420, "scrollRatio": 0.4, "updatedAt": 2000 }
        });
        let mut incoming = serde_json::json!({
            "key": "u1::c1::m1",
            "readingPosition": { "scrollY": 100, "scrollRatio": 0.1, "updatedAt": 1000 }
        });
        merge_newer_reading_position(&existing, &mut incoming);
        assert_eq!(incoming["readingPosition"]["scrollY"], 420);
        assert_eq!(incoming["readingPosition"]["updatedAt"], 2000);
    }

    #[test]
    fn extracts_oauth_deep_link_from_second_instance_argv() {
        let args = vec![
            "C:\\Program Files\\Zyx Academy\\zyx-academy-desktop.exe".to_string(),
            "zyxacademy://auth/native-finish#token=tok_123&state=abc123def4567890&next=%2Fdashboard"
                .to_string(),
        ];
        let extracted = extract_deep_link_from_args(&args, "zyxacademy").unwrap();
        assert_eq!(extracted.scheme(), "zyxacademy");
        assert_eq!(extracted.host_str(), Some("auth"));
        assert_eq!(extracted.path(), "/native-finish");
        assert_eq!(
            extracted.fragment(),
            Some("token=tok_123&state=abc123def4567890&next=%2Fdashboard")
        );

        // Wrong channel scheme must be ignored
        assert!(extract_deep_link_from_args(&args, "zyxacademy-nightly").is_none());

        // Plain launch without deep link returns None (will just focus window)
        let plain = vec!["/usr/bin/zyx-academy-desktop".to_string()];
        assert!(extract_deep_link_from_args(&plain, "zyxacademy").is_none());
    }

    #[test]
    fn validates_updater_plugin_config_before_registration() {
        assert!(!is_updater_config_valid(None));

        let empty_obj = serde_json::json!({});
        assert!(!is_updater_config_valid(Some(&empty_obj)));

        let missing_endpoints = serde_json::json!({
            "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
        });
        assert!(!is_updater_config_valid(Some(&missing_endpoints)));

        let blank_pubkey = serde_json::json!({
            "pubkey": "   ",
            "endpoints": ["https://github.com/soezyxstt/zyxacademy/releases/latest/download/latest.json"]
        });
        assert!(!is_updater_config_valid(Some(&blank_pubkey)));

        let blank_endpoints = serde_json::json!({
            "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...",
            "endpoints": ["  "]
        });
        assert!(!is_updater_config_valid(Some(&blank_endpoints)));

        let valid = serde_json::json!({
            "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...",
            "endpoints": ["https://github.com/soezyxstt/zyxacademy/releases/latest/download/latest.json"]
        });
        assert!(is_updater_config_valid(Some(&valid)));
    }
}

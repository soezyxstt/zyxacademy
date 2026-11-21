mod window_state;

use futures_util::StreamExt;
use serde::Serialize;
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager, Url};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const SERVER_URL_ENV: &str = "ZYX_DESKTOP_SERVER_URL";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateInfo {
    version: &'static str,
    channel: &'static str,
    build_id: &'static str,
    platform: &'static str,
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

fn validate_update_download_url(raw_url: &str) -> Result<(Url, String), String> {
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

    let lower_asset = asset.to_ascii_lowercase();
    let allowed_ext = lower_asset.ends_with(".exe")
        || lower_asset.ends_with(".dmg")
        || lower_asset.ends_with(".deb")
        || lower_asset.ends_with(".appimage");
    if !allowed_ext {
        return Err("Unsupported update file type".to_string());
    }

    let asset_name = asset.to_string();
    Ok((parsed, asset_name))
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
        Ok(Some(update)) => Ok(NativeUpdaterCheckResult {
            configured: true,
            update_available: true,
            version: Some(update.version),
            notes: update.body,
        }),
        Ok(None) => Ok(NativeUpdaterCheckResult {
            configured: true,
            update_available: false,
            version: None,
            notes: None,
        }),
        Err(err) => Err(format!("Updater check failed: {err}")),
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

    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                if let Some(total) = content_length.filter(|&v| v > 0) {
                    let percent = ((downloaded.saturating_mul(100)) / total).min(100) as u8;
                    if percent != last_percent {
                        last_percent = percent;
                        let _ = progress_app
                            .emit("zyx-update-progress", UpdateProgressPayload { percent });
                    }
                }
            },
            || {},
        )
        .await
        .map_err(|e| format!("Failed to install update: {e}"))?;

    let _ = app.emit("zyx-update-progress", UpdateProgressPayload { percent: 100 });

    let restart_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        restart_handle.restart();
    });

    Ok("restarting".to_string())
}

#[tauri::command]
async fn download_and_launch_update(app: AppHandle, url: String) -> Result<String, String> {
    let (parsed, file_name) = validate_update_download_url(&url)?;

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

    let client = reqwest::Client::builder()
        .redirect(redirect_policy)
        .user_agent("ZyxAcademyUpdater/1.0")
        .build()
        .map_err(|e| format!("Failed to initialize updater client: {e}"))?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to resolve private app cache directory: {e}"))?;
    let update_dir = cache_root.join("updates");
    std::fs::create_dir_all(&update_dir)
        .map_err(|e| format!("Failed to create updates directory: {e}"))?;
    let target_path = update_dir.join(&file_name);

    let mut file = std::fs::File::create(&target_path)
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
    drop(file);

    #[cfg(unix)]
    {
        if file_name.to_ascii_lowercase().ends_with(".appimage") {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&target_path, std::fs::Permissions::from_mode(0o755));
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            get_app_update_info,
            check_native_updater,
            install_native_update,
            download_and_launch_update
        ])
        .setup(move |app| {
            if has_updater_config(app.handle()) {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            if let Some(window) = app.get_webview_window("main") {
                window_state::restore_window_geometry(app.handle(), &window);
                window_state::attach_window_state_listeners(app.handle().clone(), &window);

                let default_origin =
                    Url::parse(default_server_url()).expect("default server URL must be valid");
                if initial_origin != default_origin {
                    let _ = window.navigate(initial_origin.clone());
                }
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

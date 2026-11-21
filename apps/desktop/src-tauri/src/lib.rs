use tauri::{AppHandle, Manager, Url};
use tauri_plugin_deep_link::DeepLinkExt;

const SERVER_URL_ENV: &str = "ZYX_DESKTOP_SERVER_URL";

fn build_channel() -> &'static str {
    match option_env!("ZYX_BUILD_CHANNEL") {
        Some("nightly") => "nightly",
        _ => "stable",
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

fn user_agent_token() -> String {
    format!("ZyxDesktopApp/0.1.0-alpha.1 (Tauri; {})", build_channel())
}

fn configured_origin() -> Url {
    if let Ok(raw) = std::env::var(SERVER_URL_ENV) {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if let Ok(parsed) = Url::parse(trimmed) {
                if matches!(parsed.scheme(), "http" | "https") && parsed.has_host() {
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
        if !raw_path.starts_with('/') {
            path_segments.push('/');
        }
        path_segments.push_str(raw_path);
    }

    if path_segments.is_empty() {
        path_segments.push('/');
    }

    let mut target = origin.join(&path_segments).ok()?;
    target.set_query(incoming.query());
    target.set_fragment(incoming.fragment());
    Some(target)
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

fn user_agent_override_script() -> String {
    let token = user_agent_token();
    format!(
        r#"(() => {{
  try {{
    const token = "{token}";
    if (typeof navigator !== "undefined" && !navigator.userAgent.includes(token)) {{
      const nextUa = `${{navigator.userAgent}} ${{token}}`;
      Object.defineProperty(navigator, "userAgent", {{
        get: () => nextUa,
        configurable: true,
      }});
    }}
  }} catch (_) {{}}
}})();"#
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let origin = configured_origin();
    let initial_origin = origin.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let default_origin =
                    Url::parse(default_server_url()).expect("default server URL must be valid");
                if initial_origin != default_origin {
                    let _ = window.navigate(initial_origin.clone());
                }

                // Tauri v2 does not expose a cross-platform append-only user-agent setter on an
                // already-created WebviewWindow, so expose the desktop token via navigator.userAgent
                // for client-side detection without replacing the platform WebView UA string.
                let _ = window.eval(user_agent_override_script());
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
    fn ignores_unknown_schemes() {
        let origin = Url::parse("https://www.zyxacademy.com").unwrap();
        let link = Url::parse("https://example.com/courses").unwrap();
        assert!(resolve_deep_link_target(&origin, &link, "zyxacademy").is_none());
    }
}

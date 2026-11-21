use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

pub const MIN_WINDOW_WIDTH: u32 = 480;
pub const MIN_WINDOW_HEIGHT: u32 = 540;
const STATE_FILE_NAME: &str = "window-state.json";
const SAVE_THROTTLE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedWindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

impl MonitorRect {
    fn right(&self) -> i64 {
        self.x as i64 + self.width as i64
    }

    fn bottom(&self) -> i64 {
        self.y as i64 + self.height as i64
    }

    fn overlap_area(&self, state: &PersistedWindowState) -> i64 {
        let win_left = state.x as i64;
        let win_top = state.y as i64;
        let win_right = win_left + state.width as i64;
        let win_bottom = win_top + state.height as i64;

        let overlap_w = (win_right.min(self.right()) - win_left.max(self.x as i64)).max(0);
        let overlap_h = (win_bottom.min(self.bottom()) - win_top.max(self.y as i64)).max(0);
        overlap_w.saturating_mul(overlap_h)
    }

    fn min_physical_width(&self) -> u32 {
        let factor = if self.scale_factor.is_finite() && self.scale_factor > 0.0 {
            self.scale_factor
        } else {
            1.0
        };
        ((MIN_WINDOW_WIDTH as f64) * factor).round().max(1.0) as u32
    }

    fn min_physical_height(&self) -> u32 {
        let factor = if self.scale_factor.is_finite() && self.scale_factor > 0.0 {
            self.scale_factor
        } else {
            1.0
        };
        ((MIN_WINDOW_HEIGHT as f64) * factor).round().max(1.0) as u32
    }
}

/// Validates and clamps a persisted window geometry against currently connected monitors.
/// Returns `None` if the saved geometry is degenerate or no monitors are available.
pub fn sanitize_window_geometry(
    saved: &PersistedWindowState,
    monitors: &[MonitorRect],
) -> Option<PersistedWindowState> {
    if saved.width == 0 || saved.height == 0 || monitors.is_empty() {
        return None;
    }

    let best_monitor = monitors
        .iter()
        .max_by_key(|m| m.overlap_area(saved))
        .filter(|m| m.overlap_area(saved) > 0);

    let (monitor, fell_back_to_primary) = match best_monitor {
        Some(m) => (m, false),
        None => (&monitors[0], true),
    };

    if monitor.width == 0 || monitor.height == 0 {
        return None;
    }

    let min_w = monitor.min_physical_width().min(monitor.width);
    let min_h = monitor.min_physical_height().min(monitor.height);

    let width = saved.width.clamp(min_w, monitor.width);
    let height = saved.height.clamp(min_h, monitor.height);

    let (x, y) = if fell_back_to_primary {
        // Center on the primary monitor when the previous display is no longer connected.
        let cx = monitor.x as i64 + (monitor.width as i64 - width as i64) / 2;
        let cy = monitor.y as i64 + (monitor.height as i64 - height as i64) / 2;
        (cx as i32, cy as i32)
    } else {
        let max_x = monitor.right() - width as i64;
        let max_y = monitor.bottom() - height as i64;
        let clamped_x = (saved.x as i64).clamp(monitor.x as i64, max_x.max(monitor.x as i64));
        let clamped_y = (saved.y as i64).clamp(monitor.y as i64, max_y.max(monitor.y as i64));
        (clamped_x as i32, clamped_y as i32)
    };

    Some(PersistedWindowState {
        x,
        y,
        width,
        height,
        maximized: saved.maximized,
    })
}

fn state_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(STATE_FILE_NAME))
}

fn load_window_state(app: &AppHandle) -> Option<PersistedWindowState> {
    let path = state_file_path(app)?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_window_state(app: &AppHandle, state: &PersistedWindowState) {
    let Some(path) = state_file_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

fn collect_monitors(window: &WebviewWindow) -> Vec<MonitorRect> {
    let mut rects = Vec::new();
    if let Ok(Some(primary)) = window.primary_monitor() {
        let pos = primary.position();
        let size = primary.size();
        rects.push(MonitorRect {
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            scale_factor: primary.scale_factor(),
        });
    }
    if let Ok(available) = window.available_monitors() {
        for monitor in available {
            let pos = monitor.position();
            let size = monitor.size();
            let rect = MonitorRect {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: monitor.scale_factor(),
            };
            if !rects.contains(&rect) {
                rects.push(rect);
            }
        }
    }
    rects
}

pub fn restore_window_geometry(app: &AppHandle, window: &WebviewWindow) {
    let Some(saved) = load_window_state(app) else {
        return;
    };
    let monitors = collect_monitors(window);
    let Some(sanitized) = sanitize_window_geometry(&saved, &monitors) else {
        return;
    };

    let _ = window.set_size(PhysicalSize::new(sanitized.width, sanitized.height));
    let _ = window.set_position(PhysicalPosition::new(sanitized.x, sanitized.y));
    if sanitized.maximized {
        let _ = window.maximize();
    }
}

struct TrackedState {
    latest: Option<PersistedWindowState>,
    last_saved: Option<Instant>,
}

fn capture_window_state(
    window: &WebviewWindow,
    previous: Option<&PersistedWindowState>,
) -> Option<PersistedWindowState> {
    if window.is_minimized().unwrap_or(false) {
        return previous.cloned();
    }

    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        if let Some(prev) = previous {
            return Some(PersistedWindowState {
                maximized: true,
                ..prev.clone()
            });
        }
    }

    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return previous.cloned();
    }

    Some(PersistedWindowState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

pub fn attach_window_state_listeners(app: AppHandle, window: &WebviewWindow) {
    let initial = load_window_state(&app);
    let tracker = Arc::new(Mutex::new(TrackedState {
        latest: initial,
        last_saved: None,
    }));

    let win_for_events = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Ok(mut guard) = tracker.lock() {
                if let Some(captured) =
                    capture_window_state(&win_for_events, guard.latest.as_ref())
                {
                    guard.latest = Some(captured.clone());
                    let should_flush = guard
                        .last_saved
                        .map(|t| t.elapsed() >= SAVE_THROTTLE)
                        .unwrap_or(true);
                    if should_flush {
                        save_window_state(&app, &captured);
                        guard.last_saved = Some(Instant::now());
                    }
                }
            }
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            if let Ok(mut guard) = tracker.lock() {
                if let Some(captured) =
                    capture_window_state(&win_for_events, guard.latest.as_ref())
                {
                    guard.latest = Some(captured.clone());
                    save_window_state(&app, &captured);
                    guard.last_saved = Some(Instant::now());
                } else if let Some(existing) = guard.latest.as_ref() {
                    save_window_state(&app, existing);
                    guard.last_saved = Some(Instant::now());
                }
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn primary_monitor() -> MonitorRect {
        MonitorRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
        }
    }

    #[test]
    fn restores_valid_side_by_side_geometry_verbatim() {
        let saved = PersistedWindowState {
            x: 0,
            y: 40,
            width: 680,
            height: 980,
            maximized: false,
        };
        let result = sanitize_window_geometry(&saved, &[primary_monitor()]).unwrap();
        assert_eq!(result, saved);
    }

    #[test]
    fn clamps_undersized_window_to_minimum_dimensions() {
        let saved = PersistedWindowState {
            x: 100,
            y: 100,
            width: 300,
            height: 320,
            maximized: false,
        };
        let result = sanitize_window_geometry(&saved, &[primary_monitor()]).unwrap();
        assert_eq!(result.width, MIN_WINDOW_WIDTH);
        assert_eq!(result.height, MIN_WINDOW_HEIGHT);
        assert_eq!(result.x, 100);
        assert_eq!(result.y, 100);
    }

    #[test]
    fn clamps_oversized_window_and_partially_offscreen_position() {
        let saved = PersistedWindowState {
            x: 1600,
            y: 900,
            width: 2400,
            height: 1400,
            maximized: true,
        };
        let result = sanitize_window_geometry(&saved, &[primary_monitor()]).unwrap();
        assert_eq!(result.width, 1920);
        assert_eq!(result.height, 1080);
        assert_eq!(result.x, 0);
        assert_eq!(result.y, 0);
        assert!(result.maximized);
    }

    #[test]
    fn centers_on_primary_monitor_when_external_display_disconnected() {
        let saved = PersistedWindowState {
            x: 2400,
            y: 120,
            width: 720,
            height: 820,
            maximized: false,
        };
        let result = sanitize_window_geometry(&saved, &[primary_monitor()]).unwrap();
        assert_eq!(result.width, 720);
        assert_eq!(result.height, 820);
        assert_eq!(result.x, (1920 - 720) / 2);
        assert_eq!(result.y, (1080 - 820) / 2);
    }

    #[test]
    fn preserves_position_on_secondary_monitor_when_connected() {
        let secondary = MonitorRect {
            x: 1920,
            y: 0,
            width: 1440,
            height: 900,
            scale_factor: 1.0,
        };
        let saved = PersistedWindowState {
            x: 2000,
            y: 50,
            width: 700,
            height: 800,
            maximized: false,
        };
        let result =
            sanitize_window_geometry(&saved, &[primary_monitor(), secondary]).unwrap();
        assert_eq!(result, saved);
    }

    #[test]
    fn scales_minimum_dimensions_on_hidpi_monitor() {
        let hidpi = MonitorRect {
            x: 0,
            y: 0,
            width: 2880,
            height: 1800,
            scale_factor: 2.0,
        };
        let saved = PersistedWindowState {
            x: 100,
            y: 100,
            width: 500,
            height: 600,
            maximized: false,
        };
        let result = sanitize_window_geometry(&saved, &[hidpi]).unwrap();
        assert_eq!(result.width, MIN_WINDOW_WIDTH * 2);
        assert_eq!(result.height, MIN_WINDOW_HEIGHT * 2);
    }

    #[test]
    fn rejects_zero_dimension_or_empty_monitors() {
        let zero = PersistedWindowState {
            x: 0,
            y: 0,
            width: 0,
            height: 600,
            maximized: false,
        };
        assert!(sanitize_window_geometry(&zero, &[primary_monitor()]).is_none());

        let valid = PersistedWindowState {
            x: 10,
            y: 10,
            width: 600,
            height: 700,
            maximized: false,
        };
        assert!(sanitize_window_geometry(&valid, &[]).is_none());
    }
}

//! Showing, hiding, and remembering the window. PRD Section 14.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::settings::{read_session, write_session};
use crate::state::AppState;

/// The smallest window QuickNote will restore itself to.
const MIN_WIDTH: u32 = 420;
const MIN_HEIGHT: u32 = 320;

/// How long a frontend gets to flush before the process ends anyway.
const EXIT_FALLBACK: Duration = Duration::from_secs(2);

/// Rounds a logical dimension to whole points.
///
/// The clamp happens before the cast, so the value is always inside the range
/// the field can hold and the conversion cannot truncate or wrap.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn to_points_u32(value: f64, fallback: u32) -> u32 {
    if !value.is_finite() {
        return fallback;
    }
    value.round().clamp(1.0, f64::from(u32::MAX)) as u32
}

#[allow(clippy::cast_possible_truncation)]
fn to_points_i32(value: f64) -> i32 {
    if !value.is_finite() {
        return -1;
    }
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

/// Stores the window's size and position in logical points.
///
/// Physical pixels would halve the window on the next launch on a 2x display,
/// and would not survive moving it to another screen.
pub fn save_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let mut session = read_session();

    if let Ok(size) = window.outer_size() {
        let logical = size.to_logical::<f64>(scale);
        session.window_width = to_points_u32(logical.width, session.window_width);
        session.window_height = to_points_u32(logical.height, session.window_height);
    }
    if let Ok(position) = window.outer_position() {
        let logical = position.to_logical::<f64>(scale);
        session.window_x = to_points_i32(logical.x);
        session.window_y = to_points_i32(logical.y);
    }

    drop(write_session(&session));
}

pub fn restore_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let session = read_session();

    drop(window.set_size(tauri::LogicalSize::new(
        session.window_width.max(MIN_WIDTH),
        session.window_height.max(MIN_HEIGHT),
    )));

    if session.window_x >= 0 && session.window_y >= 0 {
        drop(window.set_position(tauri::LogicalPosition::new(
            session.window_x,
            session.window_y,
        )));
    } else {
        drop(window.center());
    }
}

/// The global shortcut toggles. Pressing it on a focused window hides it.
pub fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        drop(app.emit("quicknote://flush-and-hide", ()));
        return;
    }

    drop(window.show());
    drop(window.unminimize());
    drop(window.set_focus());
    drop(app.emit("quicknote://shown", ()));
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        drop(window.show());
        drop(window.unminimize());
        drop(window.set_focus());
    }
    drop(app.emit("quicknote://shown", ()));
}

pub fn hide(app: &AppHandle) {
    save_geometry(app);
    if let Some(window) = app.get_webview_window("main") {
        drop(window.hide());
    }
}

/// Starts the shutdown that lets the frontend write before the process ends.
///
/// Returns true when this call started it. A second request must not restart
/// the sequence or add a second fallback timer — see `AppState::begin_exit`.
pub fn begin_exit(app: &AppHandle) -> bool {
    let state: State<AppState> = app.state();
    if !state.begin_exit().unwrap_or(false) {
        return false;
    }

    drop(app.emit("quicknote://flush-and-exit", ()));

    // A frontend that never answers must not block the quit.
    let fallback = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(EXIT_FALLBACK);
        fallback.exit(0);
    });
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_points_round_to_whole_numbers() {
        assert_eq!(to_points_u32(799.6, 800), 800);
        assert_eq!(to_points_i32(-12.4), -12);
    }

    /// A window can never be restored to zero width.
    #[test]
    fn a_dimension_never_falls_below_one_point() {
        assert_eq!(to_points_u32(0.0, 800), 1);
        assert_eq!(to_points_u32(-40.0, 800), 1);
    }

    /// A window driver that reports nothing usable leaves the stored size
    /// alone rather than replacing it with a nonsense one.
    #[test]
    fn a_dimension_that_is_not_a_number_keeps_the_previous_value() {
        assert_eq!(to_points_u32(f64::NAN, 800), 800);
        assert_eq!(to_points_u32(f64::INFINITY, 800), 800);
        assert_eq!(to_points_i32(f64::NAN), -1);
    }
}

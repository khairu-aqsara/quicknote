//! Everything the frontend can ask for. PRD Section 23.
//!
//! Each function here resolves the note path, calls one domain module, and
//! returns. The rules live in `note`, `settings`, and `window`; nothing in this
//! file decides anything.

// Tauri builds every command's argument list by value — a borrowed `String` or
// `AppHandle` will not compile as a command parameter. The lint is right in
// general and wrong for this file.
#![allow(clippy::needless_pass_by_value)]

use std::path::{Path, PathBuf};
use std::str::FromStr;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::error::Result;
use crate::note::{self, NoteCheck, NoteLoad, NoteSave};
use crate::paths::expand;
use crate::settings::{self, Config, Session};
use crate::state::AppState;
use crate::window;

/// Lets the WebView load images that sit beside the note.
///
/// The static scope in `tauri.conf.json` reaches `$HOME` only. A note on an
/// external volume falls outside it, and every local image in that note fails
/// to load with no message. Adding the note's own folder keeps the reach
/// narrow and still works wherever the user keeps the file.
pub fn allow_note_directory(app: &AppHandle, note: &Path) {
    if let Some(parent) = note.parent() {
        drop(app.asset_protocol_scope().allow_directory(parent, true));
    }
}

/* -------------------------------------------------------------------- note */

#[tauri::command]
pub fn note_load(app: AppHandle, state: State<AppState>) -> Result<NoteLoad> {
    let path = state.note_path()?;
    allow_note_directory(&app, &path);
    note::load(&path)
}

#[tauri::command]
pub fn note_save(state: State<AppState>, content: String, base_hash: String) -> Result<NoteSave> {
    note::save(&state.note_path()?, &content, &base_hash)
}

#[tauri::command]
pub fn note_check(state: State<AppState>, base_hash: String) -> Result<NoteCheck> {
    note::check(&state.note_path()?, base_hash)
}

#[tauri::command]
pub fn note_set_path(app: AppHandle, state: State<AppState>, path: String) -> Result<NoteLoad> {
    let target = expand(&path);
    let loaded = note::load(&target)?;
    allow_note_directory(&app, &target);
    state.set_note_path(target)?;
    Ok(loaded)
}

#[tauri::command]
pub fn pick_note_file(app: AppHandle, state: State<AppState>) -> Option<String> {
    // A directory QuickNote cannot resolve is not worth refusing the dialog
    // over. The picker simply opens wherever the platform puts it by default.
    let start = state
        .note_path()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_default();

    app.dialog()
        .file()
        .set_title("Choose the QuickNote note file")
        .set_directory(start)
        .set_file_name("notes.md")
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_save_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/* ---------------------------------------------------------------- settings */

#[tauri::command]
pub fn config_load(state: State<AppState>) -> Result<Config> {
    let config = settings::read_config();
    state.set_note_path(expand(&config.note_path))?;
    Ok(config)
}

#[tauri::command]
pub fn config_save(state: State<AppState>, config: Config) -> Result<()> {
    let config = config.sanitised();
    state.set_note_path(expand(&config.note_path))?;
    settings::write_config(&config)
}

#[tauri::command]
pub fn session_load() -> Session {
    settings::read_session()
}

#[tauri::command]
pub fn session_save(cursor_offset: usize, scroll_top: f64) -> Result<()> {
    let mut session = settings::read_session();
    session.cursor_offset = cursor_offset;
    session.scroll_top = scroll_top;
    settings::write_session(&session)
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, value: bool) {
    if let Some(window) = app.get_webview_window("main") {
        drop(window.set_always_on_top(value));
    }
}

/// Registers the new accelerator, then removes the old one.
///
/// Order matters. Clearing first and parsing afterwards leaves the user with no
/// global shortcut at all whenever the new combination is malformed or another
/// application already owns it — and QuickNote is only reachable through that
/// shortcut once its window is hidden.
#[tauri::command]
pub fn set_global_shortcut(app: AppHandle, state: State<AppState>, accelerator: String) -> bool {
    let Ok(shortcut) = Shortcut::from_str(&accelerator) else {
        return false;
    };
    let manager = app.global_shortcut();

    state
        .with_shortcut(|current| {
            if *current == Some(shortcut) {
                return true;
            }
            if manager.register(shortcut).is_err() {
                return false;
            }
            if let Some(previous) = current.take() {
                drop(manager.unregister(previous));
            }
            *current = Some(shortcut);
            true
        })
        .unwrap_or(false)
}

/* --------------------------------------------------------------- lifecycle */

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    window::hide(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    window::save_geometry(&app);
    app.exit(0);
}

/// The frontend calls this once it has flushed, so no write is cut short.
#[tauri::command]
pub fn ready_to_exit(app: AppHandle) {
    window::save_geometry(&app);
    app.exit(0);
}

/// The note path the application starts on.
pub fn initial_note_path(config: &Config) -> PathBuf {
    expand(&config.note_path)
}

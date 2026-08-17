//! QuickNote backend.
//!
//! Rust owns everything that can lose the user's text: the note path, the
//! atomic write, the recovery scan, and the conflict copy. The frontend never
//! builds a path and never touches the filesystem. See PRD Sections 12, 13,
//! and 23.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/* ------------------------------------------------------------------ types */

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub note_path: String,
    pub theme: String,
    pub font_size: u32,
    pub always_on_top: bool,
    pub global_shortcut: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            note_path: default_note_path().to_string_lossy().into_owned(),
            theme: "system".into(),
            font_size: 17,
            always_on_top: false,
            global_shortcut: default_shortcut().into(),
        }
    }
}

impl Config {
    /// Brings every field back into range. An edited file never blocks startup.
    fn sanitised(mut self) -> Self {
        if !matches!(self.theme.as_str(), "light" | "dark" | "system") {
            self.theme = "system".into();
        }
        self.font_size = self.font_size.clamp(12, 28);
        if self.note_path.trim().is_empty() {
            self.note_path = default_note_path().to_string_lossy().into_owned();
        }
        if self.global_shortcut.trim().is_empty() {
            self.global_shortcut = default_shortcut().into();
        }
        self
    }
}

/// Bumped when the meaning of a stored field changes. Version 1 wrote window
/// geometry in physical pixels, which halved the window on a 2x display.
/// Version 2 stores logical points, so version 1 geometry is discarded.
const SESSION_VERSION: u32 = 2;

const DEFAULT_WINDOW_WIDTH: u32 = 800;
const DEFAULT_WINDOW_HEIGHT: u32 = 800;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Session {
    pub version: u32,
    pub cursor_offset: usize,
    pub scroll_top: f64,
    /// Window geometry in logical points, never physical pixels.
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            version: SESSION_VERSION,
            cursor_offset: 0,
            scroll_top: 0.0,
            window_x: -1,
            window_y: -1,
            window_width: DEFAULT_WINDOW_WIDTH,
            window_height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLoad {
    pub content: String,
    pub hash: String,
    pub recovered: bool,
    pub path: String,
    pub read_only: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSave {
    pub hash: String,
    pub conflict_file: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteCheck {
    pub changed: bool,
    pub content: String,
    pub hash: String,
}

pub struct AppState {
    note_path: Mutex<PathBuf>,
    exiting: Mutex<bool>,
}

/* ------------------------------------------------------------------ paths */

fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var_os(key).map(PathBuf::from).unwrap_or_default()
}

/// Where `config.json` and `session.json` live. PRD Section 11.
fn state_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library/Application Support/QuickNote")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(home_dir)
            .join("QuickNote")
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".config"))
            .join("quicknote")
    }
}

/// The note the user sees by default: visible, easy to back up, easy to commit.
fn default_note_path() -> PathBuf {
    home_dir().join("QuickNote").join("notes.md")
}

fn default_shortcut() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Ctrl+Alt+Cmd+N"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Alt+N"
    }
}

/// Expands a leading `~` so a hand-edited config still works.
fn expand(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return home_dir().join(rest);
    }
    if trimmed == "~" {
        return home_dir();
    }
    PathBuf::from(trimmed)
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".tmp");
    PathBuf::from(name)
}

/* ----------------------------------------------------------------- helpers */

/// FNV-1a. QuickNote compares versions of one small file, so a fast
/// non-cryptographic hash is the right tool.
fn hash(content: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in content.as_bytes() {
        h ^= u64::from(*byte);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn io_error(action: &str, path: &Path, error: &std::io::Error) -> String {
    format!("{action} {} — {error}", path.display())
}

/// Writes through a temporary file so the note is never seen half-written.
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| io_error("cannot create", parent, &e))?;
    }
    let tmp = tmp_path(path);
    {
        let mut file = File::create(&tmp).map_err(|e| io_error("cannot write", &tmp, &e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| io_error("cannot write", &tmp, &e))?;
        file.sync_all()
            .map_err(|e| io_error("cannot flush", &tmp, &e))?;
    }
    fs::rename(&tmp, path).map_err(|e| io_error("cannot replace", path, &e))?;
    Ok(())
}

fn is_read_only(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(meta) => meta.permissions().readonly(),
        Err(_) => false,
    }
}

fn modified_at(path: &Path) -> Option<std::time::SystemTime> {
    fs::metadata(path).ok().and_then(|m| m.modified().ok())
}

/// `notes.conflict-20260815-153301.md`, beside the note itself.
fn conflict_path(note: &Path) -> PathBuf {
    let stem = note
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "notes".into());
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let parent = note.parent().map(Path::to_path_buf).unwrap_or_default();
    parent.join(format!("{stem}.conflict-{stamp}.md"))
}

/* -------------------------------------------------------------- note logic */

/// Creates the note directory, runs recovery, then reads the note.
/// PRD Section 12.
fn load_note(path: &Path) -> Result<NoteLoad, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| io_error("cannot create", parent, &e))?;
    }

    let tmp = tmp_path(path);
    let mut recovered = false;

    if tmp.exists() {
        let promote = !path.exists()
            || match (modified_at(&tmp), modified_at(path)) {
                (Some(t), Some(m)) => t > m,
                _ => false,
            };
        if promote {
            fs::rename(&tmp, path).map_err(|e| io_error("cannot recover", &tmp, &e))?;
            recovered = true;
        } else {
            let _ = fs::remove_file(&tmp);
        }
    }

    if !path.exists() {
        atomic_write(path, "")?;
    }

    let content = fs::read_to_string(path).map_err(|e| io_error("cannot read", path, &e))?;

    Ok(NoteLoad {
        hash: hash(&content),
        content,
        recovered,
        path: path.to_string_lossy().into_owned(),
        read_only: is_read_only(path),
    })
}

/* ----------------------------------------------------------------- commands */

#[tauri::command]
fn note_load(state: State<AppState>) -> Result<NoteLoad, String> {
    let path = state.note_path.lock().unwrap().clone();
    load_note(&path)
}

#[tauri::command]
fn note_save(
    state: State<AppState>,
    content: String,
    base_hash: String,
) -> Result<NoteSave, String> {
    let path = state.note_path.lock().unwrap().clone();

    // Compare against what is actually on disk right now. PRD Section 13.
    let mut conflict_file = None;
    if path.exists() {
        let current = fs::read_to_string(&path).map_err(|e| io_error("cannot read", &path, &e))?;
        if hash(&current) != base_hash {
            let copy = conflict_path(&path);
            fs::write(&copy, &current).map_err(|e| io_error("cannot write", &copy, &e))?;
            conflict_file = copy
                .file_name()
                .map(|n| n.to_string_lossy().into_owned());
        }
    }

    atomic_write(&path, &content)?;

    Ok(NoteSave {
        hash: hash(&content),
        conflict_file,
    })
}

#[tauri::command]
fn note_check(state: State<AppState>, base_hash: String) -> Result<NoteCheck, String> {
    let path = state.note_path.lock().unwrap().clone();
    if !path.exists() {
        return Ok(NoteCheck {
            changed: false,
            content: String::new(),
            hash: base_hash,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| io_error("cannot read", &path, &e))?;
    let current = hash(&content);
    Ok(NoteCheck {
        changed: current != base_hash,
        content,
        hash: current,
    })
}

#[tauri::command]
fn note_set_path(state: State<AppState>, path: String) -> Result<NoteLoad, String> {
    let target = expand(&path);
    let loaded = load_note(&target)?;
    *state.note_path.lock().unwrap() = target;
    Ok(loaded)
}

#[tauri::command]
fn pick_note_file(app: AppHandle, state: State<AppState>) -> Option<String> {
    let current = state.note_path.lock().unwrap().clone();
    let start = current.parent().map(Path::to_path_buf).unwrap_or_default();

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

#[tauri::command]
fn config_load(state: State<AppState>) -> Config {
    let config = read_config();
    *state.note_path.lock().unwrap() = expand(&config.note_path);
    config
}

#[tauri::command]
fn config_save(state: State<AppState>, config: Config) -> Result<(), String> {
    let config = config.sanitised();
    *state.note_path.lock().unwrap() = expand(&config.note_path);
    let path = state_dir().join("config.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

#[tauri::command]
fn session_load() -> Session {
    read_session()
}

#[tauri::command]
fn session_save(cursor_offset: usize, scroll_top: f64) -> Result<(), String> {
    let mut session = read_session();
    session.cursor_offset = cursor_offset;
    session.scroll_top = scroll_top;
    write_session(&session)
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, value: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(value);
    }
}

#[tauri::command]
fn set_global_shortcut(app: AppHandle, accelerator: String) -> bool {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    match Shortcut::from_str(&accelerator) {
        Ok(shortcut) => manager.register(shortcut).is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    save_window_geometry(&app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    save_window_geometry(&app);
    app.exit(0);
}

/// The frontend calls this once it has flushed, so no write is cut short.
#[tauri::command]
fn ready_to_exit(app: AppHandle) {
    save_window_geometry(&app);
    app.exit(0);
}

/* ------------------------------------------------------- config and session */

fn read_config() -> Config {
    let path = state_dir().join("config.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Config>(&text).ok())
        .map(Config::sanitised)
        .unwrap_or_default()
}

fn read_session() -> Session {
    let path = state_dir().join("session.json");
    let mut session = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Session>(&text).ok())
        .unwrap_or_default();

    // Geometry from an older version means something different. Drop it and
    // keep the cursor, which is still valid.
    if session.version != SESSION_VERSION {
        let defaults = Session::default();
        session.version = SESSION_VERSION;
        session.window_x = defaults.window_x;
        session.window_y = defaults.window_y;
        session.window_width = defaults.window_width;
        session.window_height = defaults.window_height;
    }

    session
}

fn write_session(session: &Session) -> Result<(), String> {
    let path = state_dir().join("session.json");
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

fn save_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // Store logical points. Physical pixels would halve the window on the next
    // launch on a 2x display, and would not survive moving to another screen.
    let scale = window.scale_factor().unwrap_or(1.0);
    let mut session = read_session();

    if let Ok(size) = window.outer_size() {
        let logical = size.to_logical::<f64>(scale);
        session.window_width = logical.width.round().max(1.0) as u32;
        session.window_height = logical.height.round().max(1.0) as u32;
    }
    if let Ok(position) = window.outer_position() {
        let logical = position.to_logical::<f64>(scale);
        session.window_x = logical.x.round() as i32;
        session.window_y = logical.y.round() as i32;
    }
    let _ = write_session(&session);
}

fn restore_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let session = read_session();
    let _ = window.set_size(tauri::LogicalSize::new(
        session.window_width.max(420),
        session.window_height.max(320),
    ));
    if session.window_x >= 0 && session.window_y >= 0 {
        let _ = window.set_position(tauri::LogicalPosition::new(
            session.window_x,
            session.window_y,
        ));
    } else {
        let _ = window.center();
    }
}

/* ------------------------------------------------------------ window toggle */

/// The global shortcut toggles. Pressing it on a focused window hides it.
fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = app.emit("quicknote://flush-and-hide", ());
        return;
    }

    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = app.emit("quicknote://shown", ());
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("quicknote://shown", ());
}

/* -------------------------------------------------------------------- entry */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = fs::create_dir_all(state_dir());
    let config = read_config();

    let mut builder = tauri::Builder::default();

    // The single-instance plugin must be registered before any other.
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .manage(AppState {
            note_path: Mutex::new(expand(&config.note_path)),
            exiting: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            note_load,
            note_save,
            note_check,
            note_set_path,
            pick_note_file,
            config_load,
            config_save,
            session_load,
            session_save,
            set_always_on_top,
            set_global_shortcut,
            hide_window,
            quit_app,
            ready_to_exit,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            restore_window_geometry(&handle);

            if config.always_on_top {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.set_always_on_top(true);
                }
            }

            if let Ok(shortcut) = Shortcut::from_str(&config.global_shortcut) {
                let _ = handle.global_shortcut().register(shortcut);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it. The application stays resident so
            // the global shortcut can reopen it fast. PRD Section 14.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.app_handle().emit("quicknote://flush-and-hide", ());
            }
        })
        .build(tauri::generate_context!())
        .expect("QuickNote failed to start")
        .run(|handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                let state: State<AppState> = handle.state();
                let mut exiting = state.exiting.lock().unwrap();
                if !*exiting {
                    *exiting = true;
                    api.prevent_exit();
                    let _ = handle.emit("quicknote://flush-and-exit", ());

                    // A frontend that never answers must not block the quit.
                    let fallback = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(2000));
                        fallback.exit(0);
                    });
                }
            }

            // Clicking the Dock icon after the window was hidden must bring it
            // back. Without this, hiding the window strands the application.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_window(handle),

            _ => {}
        });
}

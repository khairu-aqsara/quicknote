//! `config.json` and `session.json`. PRD Section 11.
//!
//! Neither file is ever allowed to stop QuickNote from starting. A missing
//! file, unreadable JSON, or a value out of range all fall back to a default
//! rather than reporting an error the user cannot act on.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::paths::{config_path, default_note_path, default_shortcut, session_path};
use crate::storage::atomic_write;

/// Bumped when the meaning of a stored field changes. Version 1 wrote window
/// geometry in physical pixels, which halved the window on a 2x display.
/// Version 2 stores logical points, so version 1 geometry is discarded.
const SESSION_VERSION: u32 = 2;

const DEFAULT_WINDOW_WIDTH: u32 = 800;
const DEFAULT_WINDOW_HEIGHT: u32 = 800;

pub const MIN_FONT_SIZE: u32 = 12;
pub const MAX_FONT_SIZE: u32 = 28;

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
    #[must_use]
    pub fn sanitised(mut self) -> Self {
        if !matches!(self.theme.as_str(), "light" | "dark" | "system") {
            self.theme = "system".into();
        }
        self.font_size = self.font_size.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE);
        if self.note_path.trim().is_empty() {
            self.note_path = default_note_path().to_string_lossy().into_owned();
        }
        if self.global_shortcut.trim().is_empty() {
            self.global_shortcut = default_shortcut().into();
        }
        self
    }
}

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

impl Session {
    /// Geometry from an older version means something different. Drop it and
    /// keep the cursor, which is still valid.
    fn migrated(mut self) -> Self {
        if self.version != SESSION_VERSION {
            let defaults = Self::default();
            self.version = SESSION_VERSION;
            self.window_x = defaults.window_x;
            self.window_y = defaults.window_y;
            self.window_width = defaults.window_width;
            self.window_height = defaults.window_height;
        }
        self
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

fn write_json<T: Serialize>(path: &Path, what: &'static str, value: &T) -> Result<()> {
    let json = serde_json::to_string_pretty(value).map_err(|e| Error::encode(what, e))?;
    atomic_write(path, &json)
}

pub fn read_config_from(path: &Path) -> Config {
    read_json::<Config>(path).map_or_else(Config::default, Config::sanitised)
}

pub fn read_session_from(path: &Path) -> Session {
    read_json::<Session>(path).unwrap_or_default().migrated()
}

pub fn read_config() -> Config {
    read_config_from(&config_path())
}

pub fn write_config(config: &Config) -> Result<()> {
    write_json(&config_path(), "the settings", config)
}

pub fn read_session() -> Session {
    read_session_from(&session_path())
}

pub fn write_session(session: &Session) -> Result<()> {
    write_json(&session_path(), "the session", session)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sanitised_clamps_the_font_size() {
        let small = Config {
            font_size: 2,
            ..Config::default()
        }
        .sanitised();
        let large = Config {
            font_size: 400,
            ..Config::default()
        }
        .sanitised();

        assert_eq!(small.font_size, MIN_FONT_SIZE);
        assert_eq!(large.font_size, MAX_FONT_SIZE);
    }

    #[test]
    fn sanitised_rejects_an_unknown_theme() {
        let config = Config {
            theme: "banana".into(),
            ..Config::default()
        }
        .sanitised();

        assert_eq!(config.theme, "system");
    }

    #[test]
    fn sanitised_keeps_a_known_theme() {
        let config = Config {
            theme: "dark".into(),
            ..Config::default()
        }
        .sanitised();

        assert_eq!(config.theme, "dark");
    }

    #[test]
    fn sanitised_restores_an_empty_note_path_and_shortcut() {
        let config = Config {
            note_path: "   ".into(),
            global_shortcut: String::new(),
            ..Config::default()
        }
        .sanitised();

        assert_eq!(config.note_path, Config::default().note_path);
        assert_eq!(config.global_shortcut, default_shortcut());
    }

    #[test]
    fn read_config_falls_back_to_defaults_when_the_file_is_missing() {
        let dir = tempdir().unwrap();

        let config = read_config_from(&dir.path().join("absent.json"));

        assert_eq!(config.theme, "system");
        assert_eq!(config.font_size, 17);
    }

    #[test]
    fn read_config_falls_back_to_defaults_when_the_file_is_not_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ this is not json").unwrap();

        assert_eq!(read_config_from(&path).theme, "system");
    }

    /// A hand-edited file gets read, not rejected — every field is repaired.
    #[test]
    fn read_config_sanitises_what_it_reads() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{"notePath":"/tmp/n.md","theme":"neon","fontSize":99,
               "alwaysOnTop":false,"globalShortcut":"Ctrl+N"}"#,
        )
        .unwrap();

        let config = read_config_from(&path);

        assert_eq!(config.theme, "system");
        assert_eq!(config.font_size, MAX_FONT_SIZE);
        assert_eq!(config.note_path, "/tmp/n.md");
    }

    #[test]
    fn read_session_discards_geometry_from_an_older_version() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("session.json");
        std::fs::write(
            &path,
            r#"{"version":1,"cursorOffset":42,"scrollTop":120.0,
               "windowX":1600,"windowY":900,"windowWidth":1600,"windowHeight":1200}"#,
        )
        .unwrap();

        let session = read_session_from(&path);

        assert_eq!(session.version, SESSION_VERSION);
        assert_eq!(session.window_width, DEFAULT_WINDOW_WIDTH);
        assert_eq!(session.window_x, -1);
        // The cursor still means what it meant, so it survives the migration.
        assert_eq!(session.cursor_offset, 42);
        assert!((session.scroll_top - 120.0).abs() < f64::EPSILON);
    }

    #[test]
    fn read_session_keeps_geometry_from_the_current_version() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("session.json");
        std::fs::write(
            &path,
            r#"{"version":2,"cursorOffset":7,"scrollTop":0.0,
               "windowX":100,"windowY":200,"windowWidth":900,"windowHeight":700}"#,
        )
        .unwrap();

        let session = read_session_from(&path);

        assert_eq!(session.window_width, 900);
        assert_eq!(session.window_x, 100);
        assert_eq!(session.cursor_offset, 7);
    }

    #[test]
    fn a_written_session_reads_back_unchanged() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("session.json");
        let session = Session {
            cursor_offset: 128,
            window_width: 640,
            ..Session::default()
        };

        write_json(&path, "the session", &session).unwrap();

        let read = read_session_from(&path);
        assert_eq!(read.cursor_offset, 128);
        assert_eq!(read.window_width, 640);
    }
}

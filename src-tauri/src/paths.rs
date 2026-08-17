//! Every path QuickNote uses. PRD Section 11.
//!
//! The frontend never builds a path. It names a file once, through
//! `note_set_path`, and everything after that is resolved here.

use std::path::{Path, PathBuf};

pub fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var_os(key).map(PathBuf::from).unwrap_or_default()
}

/// Where `config.json` and `session.json` live.
pub fn state_dir() -> PathBuf {
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

pub fn config_path() -> PathBuf {
    state_dir().join("config.json")
}

pub fn session_path() -> PathBuf {
    state_dir().join("session.json")
}

/// The note the user sees by default: visible, easy to back up, easy to commit.
pub fn default_note_path() -> PathBuf {
    home_dir().join("QuickNote").join("notes.md")
}

/// The key that opens the note from any application.
///
/// One modifier, one letter, the same on every platform. A global shortcut
/// takes the combination away from every other application, so Settings can
/// change it when `Ctrl+N` is needed elsewhere.
pub fn default_shortcut() -> &'static str {
    "Ctrl+N"
}

/// Expands a leading `~` so a hand-edited config still works.
pub fn expand(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return home_dir().join(rest);
    }
    if trimmed == "~" {
        return home_dir();
    }
    PathBuf::from(trimmed)
}

fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// The staged file recovery trusts. It only ever holds complete content.
pub fn tmp_path(path: &Path) -> PathBuf {
    suffixed(path, ".tmp")
}

/// The file a write fills in. Recovery never promotes this one.
pub fn writing_path(path: &Path) -> PathBuf {
    suffixed(path, ".writing")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_resolves_a_leading_tilde() {
        assert_eq!(expand("~/notes.md"), home_dir().join("notes.md"));
    }

    #[test]
    fn expand_resolves_a_bare_tilde() {
        assert_eq!(expand("~"), home_dir());
    }

    #[test]
    fn expand_leaves_an_absolute_path_alone() {
        assert_eq!(expand("/tmp/notes.md"), PathBuf::from("/tmp/notes.md"));
    }

    #[test]
    fn expand_trims_surrounding_space() {
        assert_eq!(expand("  /tmp/notes.md  "), PathBuf::from("/tmp/notes.md"));
    }

    /// A tilde that is not a home reference is an ordinary character.
    #[test]
    fn expand_leaves_an_embedded_tilde_alone() {
        assert_eq!(expand("/tmp/a~b.md"), PathBuf::from("/tmp/a~b.md"));
    }

    /// The suffix goes on the whole name, not on the stem. `notes.md.tmp`
    /// keeps the note and its staged copy adjacent and obviously related.
    #[test]
    fn staging_names_append_to_the_full_file_name() {
        let note = Path::new("/tmp/notes.md");
        assert_eq!(tmp_path(note), PathBuf::from("/tmp/notes.md.tmp"));
        assert_eq!(writing_path(note), PathBuf::from("/tmp/notes.md.writing"));
    }
}

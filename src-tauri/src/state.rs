//! What the backend remembers while it runs.
//!
//! Every accessor reports a poisoned lock as `Error::Lock` rather than
//! panicking. QuickNote holds text the user has not saved anywhere else, so a
//! panic here costs more than an error message does.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri_plugin_global_shortcut::Shortcut;

use crate::error::{Error, Result};

pub struct AppState {
    note_path: Mutex<PathBuf>,
    exiting: Mutex<bool>,
    /// The accelerator that is registered right now, so a failed change can
    /// leave the working one in place.
    shortcut: Mutex<Option<Shortcut>>,
}

impl AppState {
    pub fn new(note_path: PathBuf) -> Self {
        Self {
            note_path: Mutex::new(note_path),
            exiting: Mutex::new(false),
            shortcut: Mutex::new(None),
        }
    }

    pub fn note_path(&self) -> Result<PathBuf> {
        Ok(self.note_path.lock().map_err(|_| Error::Lock)?.clone())
    }

    pub fn set_note_path(&self, path: PathBuf) -> Result<()> {
        *self.note_path.lock().map_err(|_| Error::Lock)? = path;
        Ok(())
    }

    /// Claims the shutdown. Returns true only for the call that started it.
    ///
    /// The tray, the keyboard, and the runtime can all ask to quit, and a
    /// second request must not restart the sequence or add a second fallback
    /// timer. The check and the set share one lock, so two threads asking at
    /// once still produce exactly one winner.
    pub fn begin_exit(&self) -> Result<bool> {
        let mut exiting = self.exiting.lock().map_err(|_| Error::Lock)?;
        if *exiting {
            return Ok(false);
        }
        *exiting = true;
        Ok(true)
    }

    /// Runs `f` with the registered accelerator held.
    ///
    /// Swapping a shortcut means reading the old one, registering the new one,
    /// and unregistering the old one. Holding the lock across all three stops
    /// a second swap from unregistering an accelerator that is already gone.
    pub fn with_shortcut<T>(&self, f: impl FnOnce(&mut Option<Shortcut>) -> T) -> Result<T> {
        let mut current = self.shortcut.lock().map_err(|_| Error::Lock)?;
        Ok(f(&mut current))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_note_path_survives_a_round_trip() {
        let state = AppState::new(PathBuf::from("/tmp/first.md"));

        state
            .set_note_path(PathBuf::from("/tmp/second.md"))
            .unwrap();

        assert_eq!(state.note_path().unwrap(), PathBuf::from("/tmp/second.md"));
    }

    /// Only the first request starts the shutdown; later ones are ignored.
    #[test]
    fn only_one_caller_begins_the_exit() {
        let state = AppState::new(PathBuf::from("/tmp/notes.md"));

        assert!(state.begin_exit().unwrap());
        assert!(!state.begin_exit().unwrap());
        assert!(!state.begin_exit().unwrap());
    }

    #[test]
    fn the_shortcut_starts_unset_and_holds_what_it_is_given() {
        let state = AppState::new(PathBuf::from("/tmp/notes.md"));

        assert!(state.with_shortcut(|s| s.is_none()).unwrap());

        let parsed: Shortcut = "Ctrl+N".parse().unwrap();
        state.with_shortcut(|s| *s = Some(parsed)).unwrap();

        assert_eq!(state.with_shortcut(|s| *s).unwrap(), Some(parsed));
    }
}

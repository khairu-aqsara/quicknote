//! The note file itself: recovery, reading, writing, and the conflict copy.
//! PRD Sections 12 and 13.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Error, Result};
use crate::paths::{tmp_path, writing_path};
use crate::storage::{atomic_write, hash, is_read_only, modified_at};

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
    /// The note file is no longer at its path. `changed` says nothing then.
    pub missing: bool,
}

/// `notes.conflict-20260815-153301.md`, beside the note itself.
///
/// The stamp reaches one second, but autosave debounces at 400 ms, so two
/// conflicts can land inside the same second. A shared name would overwrite the
/// first copy — exactly the external text the copy exists to keep — so a
/// counter runs until the name is free.
fn conflict_path_at(note: &Path, stamp: &str) -> PathBuf {
    let stem = note
        .file_stem()
        .map_or_else(|| "notes".to_owned(), |s| s.to_string_lossy().into_owned());
    let parent = note.parent().map(Path::to_path_buf).unwrap_or_default();

    let first = parent.join(format!("{stem}.conflict-{stamp}.md"));
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let candidate = parent.join(format!("{stem}.conflict-{stamp}-{n}.md"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

fn conflict_path(note: &Path) -> PathBuf {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    conflict_path_at(note, &stamp)
}

/// Creates the note directory, runs recovery, then reads the note.
pub fn load(path: &Path) -> Result<NoteLoad> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| Error::io("cannot create", parent, e))?;
    }

    // A write that never finished. Its bytes are incomplete by definition, so
    // it is rubbish, not a recovery candidate.
    drop(fs::remove_file(writing_path(path)));

    let recovered = recover(path)?;

    if !path.exists() {
        atomic_write(path, "")?;
    }

    let content = fs::read_to_string(path).map_err(|e| Error::io("cannot read", path, e))?;

    Ok(NoteLoad {
        hash: hash(&content),
        content,
        recovered,
        path: path.to_string_lossy().into_owned(),
        read_only: is_read_only(path),
    })
}

/// Promotes a staged `.tmp` when it is newer than the note, and discards it
/// otherwise. Returns whether anything was recovered.
fn recover(path: &Path) -> Result<bool> {
    let tmp = tmp_path(path);
    if !tmp.exists() {
        return Ok(false);
    }

    let promote = !path.exists()
        || match (modified_at(&tmp), modified_at(path)) {
            (Some(staged), Some(note)) => staged > note,
            _ => false,
        };

    if promote {
        fs::rename(&tmp, path).map_err(|e| Error::io("cannot recover", &tmp, e))?;
        return Ok(true);
    }

    drop(fs::remove_file(&tmp));
    Ok(false)
}

/// Writes the note, copying aside any external text it would have replaced.
pub fn save(path: &Path, content: &str, base_hash: &str) -> Result<NoteSave> {
    // Compare against what is actually on disk right now. PRD Section 13.
    let mut conflict_file = None;
    if path.exists() {
        let current = fs::read_to_string(path).map_err(|e| Error::io("cannot read", path, e))?;
        if hash(&current) != base_hash {
            let copy = conflict_path(path);
            fs::write(&copy, &current).map_err(|e| Error::io("cannot write", &copy, e))?;
            conflict_file = copy.file_name().map(|n| n.to_string_lossy().into_owned());
        }
    }

    atomic_write(path, content)?;

    Ok(NoteSave {
        hash: hash(content),
        conflict_file,
    })
}

/// Compares the file on disk against the version the editor last wrote.
pub fn check(path: &Path, base_hash: String) -> Result<NoteCheck> {
    // Deletion is not "no change". Reporting it that way lets the next autosave
    // recreate the file with nothing said, so a note the user moved on purpose
    // reappears where they left it.
    if !path.exists() {
        return Ok(NoteCheck {
            changed: false,
            content: String::new(),
            hash: base_hash,
            missing: true,
        });
    }

    let content = fs::read_to_string(path).map_err(|e| Error::io("cannot read", path, e))?;
    let current = hash(&content);
    Ok(NoteCheck {
        changed: current != base_hash,
        content,
        hash: current,
        missing: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{File, FileTimes};
    use std::time::{Duration, SystemTime};
    use tempfile::{tempdir, TempDir};

    /// Sets a file's modification time outright, so recovery order is decided
    /// by the test rather than by how fast the filesystem clock ticks.
    fn set_modified(path: &Path, when: SystemTime) {
        let file = File::options().write(true).open(path).unwrap();
        file.set_times(FileTimes::new().set_modified(when)).unwrap();
    }

    fn note_in(dir: &TempDir) -> PathBuf {
        dir.path().join("notes.md")
    }

    #[test]
    fn load_creates_an_empty_note_when_none_exists() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "");
        assert!(!loaded.recovered);
        assert!(note.exists());
    }

    #[test]
    fn load_reads_an_existing_note() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "written earlier").unwrap();

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "written earlier");
        assert!(!loaded.recovered);
        assert_eq!(loaded.hash, hash("written earlier"));
    }

    #[test]
    fn load_promotes_a_staged_copy_that_is_newer() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "old").unwrap();
        fs::write(tmp_path(&note), "recovered text").unwrap();

        let now = SystemTime::now();
        set_modified(&note, now - Duration::from_secs(60));
        set_modified(&tmp_path(&note), now);

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "recovered text");
        assert!(loaded.recovered);
        assert!(!tmp_path(&note).exists());
    }

    #[test]
    fn load_discards_a_staged_copy_that_is_older() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "the current note").unwrap();
        fs::write(tmp_path(&note), "stale").unwrap();

        let now = SystemTime::now();
        set_modified(&tmp_path(&note), now - Duration::from_secs(60));
        set_modified(&note, now);

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "the current note");
        assert!(!loaded.recovered);
        assert!(!tmp_path(&note).exists(), "the stale copy was left behind");
    }

    /// The note is gone but a complete staged copy survives. That is exactly
    /// the crash this scheme exists for.
    #[test]
    fn load_promotes_a_staged_copy_when_the_note_is_missing() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(tmp_path(&note), "all that is left").unwrap();

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "all that is left");
        assert!(loaded.recovered);
    }

    /// A `.writing` file holds an unfinished write. It is never a candidate.
    #[test]
    fn load_removes_a_stray_partial_write() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "the real note").unwrap();
        fs::write(writing_path(&note), "half a wri").unwrap();

        let loaded = load(&note).unwrap();

        assert_eq!(loaded.content, "the real note");
        assert!(!loaded.recovered);
        assert!(!writing_path(&note).exists());
    }

    #[test]
    fn save_writes_without_a_conflict_when_the_file_is_unchanged() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "base").unwrap();

        let saved = save(&note, "edited", &hash("base")).unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "edited");
        assert!(saved.conflict_file.is_none());
        assert_eq!(saved.hash, hash("edited"));
    }

    #[test]
    fn save_copies_external_text_aside_before_replacing_it() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "someone else wrote this").unwrap();

        let saved = save(&note, "our text", &hash("what we last saw")).unwrap();

        let copy = saved.conflict_file.expect("no conflict copy was written");
        assert_eq!(fs::read_to_string(&note).unwrap(), "our text");
        assert_eq!(
            fs::read_to_string(dir.path().join(&copy)).unwrap(),
            "someone else wrote this"
        );
    }

    #[test]
    fn check_reports_an_external_edit() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);
        fs::write(&note, "changed outside").unwrap();

        let result = check(&note, hash("what we last saw")).unwrap();

        assert!(result.changed);
        assert!(!result.missing);
        assert_eq!(result.content, "changed outside");
    }

    #[test]
    fn check_reports_a_missing_file_rather_than_no_change() {
        let dir = tempdir().unwrap();

        let result = check(&note_in(&dir), hash("anything")).unwrap();

        assert!(result.missing);
        assert!(!result.changed);
    }

    /// Two conflicts inside the same second must not overwrite each other —
    /// the first copy is the external text the second one would destroy.
    #[test]
    fn conflict_path_steps_past_a_name_already_taken() {
        let dir = tempdir().unwrap();
        let note = note_in(&dir);

        let first = conflict_path_at(&note, "20260815-153301");
        fs::write(&first, "first").unwrap();
        let second = conflict_path_at(&note, "20260815-153301");
        fs::write(&second, "second").unwrap();
        let third = conflict_path_at(&note, "20260815-153301");

        assert_eq!(
            first.file_name().unwrap(),
            "notes.conflict-20260815-153301.md"
        );
        assert_eq!(
            second.file_name().unwrap(),
            "notes.conflict-20260815-153301-2.md"
        );
        assert_eq!(
            third.file_name().unwrap(),
            "notes.conflict-20260815-153301-3.md"
        );
        assert_eq!(fs::read_to_string(&first).unwrap(), "first");
    }
}

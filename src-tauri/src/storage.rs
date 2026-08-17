//! Writing a file without ever leaving it half written. PRD Section 12.
//!
//! This is the module that keeps the user's text. Everything else can be wrong
//! and recovered from; a torn write cannot.

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::SystemTime;

use crate::error::{Error, Result};
use crate::paths::{tmp_path, writing_path};

/// FNV-1a. QuickNote compares versions of one small file, so a fast
/// non-cryptographic hash is the right tool.
pub fn hash(content: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in content.as_bytes() {
        h ^= u64::from(*byte);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Writes through a temporary file so the note is never seen half-written.
///
/// Three names, not two. Recovery promotes `.tmp` over the note when `.tmp` is
/// newer, so `.tmp` has to mean "complete". A crash inside `write_all` would
/// otherwise leave a truncated `.tmp` that replaces a whole note on the next
/// launch. The partial bytes go to `.writing`, which recovery never promotes,
/// and the rename to `.tmp` is the marker that the content is whole and
/// flushed.
pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| Error::io("cannot create", parent, e))?;
    }

    let writing = writing_path(path);
    let tmp = tmp_path(path);

    let filled = (|| -> Result<()> {
        let mut file =
            File::create(&writing).map_err(|e| Error::io("cannot write", &writing, e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| Error::io("cannot write", &writing, e))?;
        file.sync_all()
            .map_err(|e| Error::io("cannot flush", &writing, e))
    })();

    if let Err(error) = filled {
        // Leaving half a file behind would confuse the next write.
        drop(fs::remove_file(&writing));
        return Err(error);
    }

    fs::rename(&writing, &tmp).map_err(|e| Error::io("cannot stage", &tmp, e))?;
    fs::rename(&tmp, path).map_err(|e| Error::io("cannot replace", path, e))?;
    Ok(())
}

pub fn is_read_only(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|meta| meta.permissions().readonly())
}

pub fn modified_at(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).ok().and_then(|m| m.modified().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn hash_is_stable_and_distinguishes_content() {
        assert_eq!(hash("hello"), hash("hello"));
        assert_ne!(hash("hello"), hash("hellp"));
        assert_eq!(hash("").len(), 16);
    }

    #[test]
    fn atomic_write_creates_missing_parents() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("deep").join("nested").join("notes.md");

        atomic_write(&note, "first").unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "first");
    }

    #[test]
    fn atomic_write_replaces_existing_content() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("notes.md");

        atomic_write(&note, "first").unwrap();
        atomic_write(&note, "second").unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "second");
    }

    /// Both staging files must be gone once the write lands. A leftover `.tmp`
    /// is what recovery promotes on the next launch, so leaving one behind
    /// would replace the note with a stale copy of itself.
    #[test]
    fn atomic_write_leaves_no_staging_files_behind() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("notes.md");

        atomic_write(&note, "content").unwrap();

        assert!(!tmp_path(&note).exists(), "a .tmp file was left behind");
        assert!(
            !writing_path(&note).exists(),
            "a .writing file was left behind"
        );
    }

    #[test]
    fn atomic_write_handles_an_empty_document() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("notes.md");

        atomic_write(&note, "").unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "");
    }

    #[test]
    fn is_read_only_reports_false_for_a_missing_file() {
        let dir = tempdir().unwrap();
        assert!(!is_read_only(&dir.path().join("absent.md")));
    }
}

//! One error type for everything the backend can fail at.
//!
//! Every command used to return `Result<_, String>`, which meant no caller
//! could tell one failure from another and every call site formatted its own
//! message. The variants here carry the parts, and `Display` assembles them in
//! one place.
//!
//! `Serialize` writes the same sentence `Display` does, so the frontend keeps
//! showing exactly what it showed before. See `Persistence.onError`.

use std::path::{Path, PathBuf};

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// `action` reads as an unfinished sentence: "cannot write", "cannot read".
    #[error("{action} {} — {source}", path.display())]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("cannot encode {what} — {source}")]
    Encode {
        what: &'static str,
        #[source]
        source: serde_json::Error,
    },

    /// A lock was left poisoned by a panic in another thread. The release
    /// profile sets `panic = "abort"`, so this cannot happen in a shipped
    /// build; it exists so debug and test builds report instead of panicking.
    #[error("QuickNote could not reach its own state")]
    Lock,
}

impl Error {
    pub fn io(action: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            action,
            path: path.to_path_buf(),
            source,
        }
    }

    pub fn encode(what: &'static str, source: serde_json::Error) -> Self {
        Self::Encode { what, source }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/**
 * The shapes Rust and the frontend agree on. PRD Section 23.
 *
 * Every field here is written by `serde` with `rename_all = "camelCase"`, so a
 * name change on either side has to happen on both.
 */

export interface Config {
  notePath: string;
  theme: "light" | "dark" | "system";
  fontSize: number;
  alwaysOnTop: boolean;
  globalShortcut: string;
}

export interface Session {
  version: number;
  cursorOffset: number;
  scrollTop: number;
  /** Window geometry in logical points. It belongs to Rust; this is read-only. */
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
}

export interface NoteLoad {
  content: string;
  hash: string;
  recovered: boolean;
  path: string;
  readOnly: boolean;
}

export interface NoteSave {
  hash: string;
  /** The conflict copy that was written, or null when there was no conflict. */
  conflictFile: string | null;
}

export interface NoteCheck {
  changed: boolean;
  content: string;
  hash: string;
  /** The note file is no longer at its path. `changed` says nothing then. */
  missing: boolean;
}

/** The events Rust sends when it needs the frontend to act before it does. */
export type BackendEvent =
  | "quicknote://flush-and-hide"
  | "quicknote://flush-and-exit"
  | "quicknote://shown";

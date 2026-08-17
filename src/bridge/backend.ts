/**
 * The one interface the rest of the frontend talks to.
 *
 * Rust owns the filesystem, the note path, and the conflict rule. Nothing above
 * this line builds a path or writes a file. Everything that needs the backend
 * takes a `Backend` rather than importing a function, so a test can hand it a
 * stub and boot order can never leave a caller holding an uninitialised module.
 */

import { resolveImageSrc } from "./images";
import type {
  BackendEvent,
  Config,
  NoteCheck,
  NoteLoad,
  NoteSave,
  Session,
} from "./types";

export interface Backend {
  /** False in the browser development fallback. */
  readonly isTauri: boolean;

  noteLoad(): Promise<NoteLoad>;
  noteSave(content: string, baseHash: string): Promise<NoteSave>;
  noteCheck(baseHash: string): Promise<NoteCheck>;
  noteSetPath(path: string): Promise<NoteLoad>;
  pickNoteFile(): Promise<string | null>;

  configLoad(): Promise<Config>;
  configSave(config: Config): Promise<void>;
  sessionLoad(): Promise<Session>;
  sessionSave(cursorOffset: number, scrollTop: number): Promise<void>;

  setAlwaysOnTop(value: boolean): Promise<void>;
  setGlobalShortcut(accelerator: string): Promise<boolean>;

  hideWindow(): Promise<void>;
  quitApp(): Promise<void>;
  readyToExit(): Promise<void>;

  onEvent(name: BackendEvent, handler: () => void): void;

  /** Resolves an image reference against the note's own directory. */
  imageSrc(url: string, noteDir: string): string | null;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export const isTauriHost = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Wires the interface onto the real Tauri commands. */
export async function createTauriBackend(): Promise<Backend> {
  const core = await import("@tauri-apps/api/core");
  const event = await import("@tauri-apps/api/event");

  const invoke = core.invoke as Invoke;
  const { convertFileSrc } = core;

  return {
    isTauri: true,

    noteLoad: () => invoke<NoteLoad>("note_load"),
    noteSave: (content, baseHash) =>
      invoke<NoteSave>("note_save", { content, baseHash }),
    noteCheck: (baseHash) => invoke<NoteCheck>("note_check", { baseHash }),
    noteSetPath: (path) => invoke<NoteLoad>("note_set_path", { path }),
    pickNoteFile: () => invoke<string | null>("pick_note_file"),

    configLoad: () => invoke<Config>("config_load"),
    configSave: (config) => invoke<void>("config_save", { config }),
    sessionLoad: () => invoke<Session>("session_load"),
    sessionSave: (cursorOffset, scrollTop) =>
      invoke<void>("session_save", { cursorOffset, scrollTop }),

    setAlwaysOnTop: (value) => invoke<void>("set_always_on_top", { value }),
    setGlobalShortcut: (accelerator) =>
      invoke<boolean>("set_global_shortcut", { accelerator }),

    hideWindow: () => invoke<void>("hide_window"),
    quitApp: () => invoke<void>("quit_app"),
    readyToExit: () => invoke<void>("ready_to_exit"),

    onEvent: (name, handler) => {
      void event.listen(name, () => handler());
    },

    imageSrc: (url, noteDir) => resolveImageSrc(url, noteDir, convertFileSrc),
  };
}

/**
 * The bridge to the Rust backend. PRD Section 23.
 *
 * Rust owns the filesystem, the note path, and the conflict rule. The frontend
 * never builds a path and never writes a file directly.
 *
 * A browser fallback backed by localStorage lets `npm run dev` open the editor
 * without compiling Rust. It is a development aid, not a shipping path.
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
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invoke: InvokeFn = async () => {
  throw new Error("backend not ready");
};

let listen: (event: string, handler: () => void) => void = () => {};

let convertFileSrc: (path: string) => string = (path) => path;

/* --------------------------------------------------------- initialisation */

export async function initBridge(): Promise<void> {
  if (isTauri()) {
    const core = await import("@tauri-apps/api/core");
    const event = await import("@tauri-apps/api/event");
    invoke = core.invoke as InvokeFn;
    convertFileSrc = core.convertFileSrc;
    listen = (name, handler) => {
      void event.listen(name, () => handler());
    };
    return;
  }
  installBrowserFallback();
}

/* ------------------------------------------------------------- commands */

export const noteLoad = () => invoke<NoteLoad>("note_load");

export const noteSave = (content: string, baseHash: string) =>
  invoke<NoteSave>("note_save", { content, baseHash });

export const noteCheck = (baseHash: string) =>
  invoke<NoteCheck>("note_check", { baseHash });

export const noteSetPath = (path: string) =>
  invoke<NoteLoad>("note_set_path", { path });

export const pickNoteFile = () => invoke<string | null>("pick_note_file");

export const configLoad = () => invoke<Config>("config_load");

export const configSave = (config: Config) =>
  invoke<void>("config_save", { config });

export const sessionLoad = () => invoke<Session>("session_load");

export const sessionSave = (cursorOffset: number, scrollTop: number) =>
  invoke<void>("session_save", { cursorOffset, scrollTop });

export const setAlwaysOnTop = (value: boolean) =>
  invoke<void>("set_always_on_top", { value });

export const setGlobalShortcut = (accelerator: string) =>
  invoke<boolean>("set_global_shortcut", { accelerator });

export const hideWindow = () => invoke<void>("hide_window");

export const quitApp = () => invoke<void>("quit_app");

export const readyToExit = () => invoke<void>("ready_to_exit");

export const onBackendEvent = (name: string, handler: () => void) =>
  listen(name, handler);

/** Turns an image reference into something the WebView may load. */
export function imageSrc(url: string, noteDir: string): string | null {
  if (/^(https?|ftp|ws):/i.test(url)) return null; // PRD Section 25 — no network
  if (/^data:/i.test(url)) return url;
  if (!isTauri()) return null;
  const absolute = url.startsWith("/") ? url : `${noteDir}/${url}`;
  try {
    return convertFileSrc(absolute);
  } catch {
    return null;
  }
}

/* -------------------------------------------------- browser dev fallback */

function installBrowserFallback(): void {
  const KEY = "quicknote.dev.note";
  const CONFIG = "quicknote.dev.config";
  const SESSION = "quicknote.dev.session";

  const hash = (text: string): string => {
    let h = 0xcbf29ce4 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };

  const defaults: Config = {
    notePath: "(browser development storage)",
    theme: "system",
    fontSize: 16,
    alwaysOnTop: false,
    globalShortcut: "Ctrl+Alt+N",
  };

  invoke = async <T,>(cmd: string, args: Record<string, unknown> = {}) => {
    const content = localStorage.getItem(KEY) ?? "";
    switch (cmd) {
      case "note_load":
        return {
          content,
          hash: hash(content),
          recovered: false,
          path: defaults.notePath,
          readOnly: false,
        } as T;
      case "note_save": {
        const next = args.content as string;
        localStorage.setItem(KEY, next);
        return { hash: hash(next), conflictFile: null } as T;
      }
      case "note_check":
        return { changed: false, content, hash: hash(content) } as T;
      case "config_load":
        return JSON.parse(
          localStorage.getItem(CONFIG) ?? JSON.stringify(defaults),
        ) as T;
      case "config_save":
        localStorage.setItem(CONFIG, JSON.stringify(args.config));
        return undefined as T;
      case "session_load":
        return JSON.parse(
          localStorage.getItem(SESSION) ??
            '{"version":2,"cursorOffset":0,"scrollTop":0,"windowX":-1,"windowY":-1,"windowWidth":800,"windowHeight":800}',
        ) as T;
      case "session_save": {
        const stored = JSON.parse(localStorage.getItem(SESSION) ?? "{}");
        localStorage.setItem(
          SESSION,
          JSON.stringify({
            ...stored,
            cursorOffset: args.cursorOffset,
            scrollTop: args.scrollTop,
          }),
        );
        return undefined as T;
      }
      default:
        return undefined as T;
    }
  };
}

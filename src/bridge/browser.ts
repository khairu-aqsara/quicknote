/**
 * A browser fallback backed by localStorage.
 *
 * It lets `npm run dev` open the editor without compiling Rust. It is a
 * development aid, not a shipping path: there is no real file, so there is no
 * recovery, no conflict copy, and no local image.
 */

import { resolveImageSrc } from "./images";
import type { Backend } from "./backend";
import type { Config, Session } from "./types";

const NOTE_KEY = "quicknote.dev.note";
const CONFIG_KEY = "quicknote.dev.config";
const SESSION_KEY = "quicknote.dev.session";

const DEFAULTS: Config = {
  notePath: "(browser development storage)",
  theme: "system",
  fontSize: 16,
  alwaysOnTop: false,
  globalShortcut: "Ctrl+N",
};

const DEFAULT_SESSION: Session = {
  version: 2,
  cursorOffset: 0,
  scrollTop: 0,
  windowX: -1,
  windowY: -1,
  windowWidth: 800,
  windowHeight: 800,
};

/** FNV-1a over 32 bits. It only has to notice that the text changed. */
function hash(text: string): string {
  let h = 0xcbf29ce4 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function read<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function createBrowserBackend(): Backend {
  const note = () => localStorage.getItem(NOTE_KEY) ?? "";

  return {
    isTauri: false,

    noteLoad: () =>
      Promise.resolve({
        content: note(),
        hash: hash(note()),
        recovered: false,
        path: DEFAULTS.notePath,
        readOnly: false,
      }),

    noteSave: (content) => {
      localStorage.setItem(NOTE_KEY, content);
      return Promise.resolve({ hash: hash(content), conflictFile: null });
    },

    // Nothing else writes this storage, so it never changes underneath.
    noteCheck: () =>
      Promise.resolve({
        changed: false,
        content: note(),
        hash: hash(note()),
        missing: false,
      }),

    noteSetPath: () =>
      Promise.resolve({
        content: note(),
        hash: hash(note()),
        recovered: false,
        path: DEFAULTS.notePath,
        readOnly: false,
      }),

    pickNoteFile: () => Promise.resolve(null),

    configLoad: () => Promise.resolve(read(CONFIG_KEY, DEFAULTS)),
    configSave: (config) => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      return Promise.resolve();
    },

    sessionLoad: () => Promise.resolve(read(SESSION_KEY, DEFAULT_SESSION)),
    sessionSave: (cursorOffset, scrollTop) => {
      const stored = read(SESSION_KEY, DEFAULT_SESSION);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...stored, cursorOffset, scrollTop }),
      );
      return Promise.resolve();
    },

    setAlwaysOnTop: () => Promise.resolve(),
    setGlobalShortcut: () => Promise.resolve(false),

    hideWindow: () => Promise.resolve(),
    quitApp: () => Promise.resolve(),
    readyToExit: () => Promise.resolve(),

    onEvent: () => {},

    // No WebView file protocol here, so only `data:` images can render.
    imageSrc: (url, noteDir) => resolveImageSrc(url, noteDir, null),
  };
}

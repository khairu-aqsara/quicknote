/**
 * QuickNote — application entry point.
 *
 *   Type it. Close it. It's still there.
 *
 * Startup order follows PRD Section 14: recover, read, render, restore the
 * cursor, focus. Nothing blocks the editor from accepting the first keystroke.
 */

import "./styles.css";

import {
  createEditor,
  focusEditor,
  replaceDocument,
  setCursor,
  setFontSize,
} from "./editor/editor";
import { setImageResolver } from "./editor/live-render";
import {
  configLoad,
  configSave,
  hideWindow,
  imageSrc,
  initBridge,
  isTauri,
  noteLoad,
  noteSetPath,
  onBackendEvent,
  pickNoteFile,
  quitApp,
  readyToExit,
  sessionLoad,
  sessionSave,
  setAlwaysOnTop,
  setGlobalShortcut,
  type Config,
} from "./bridge";
import { Persistence } from "./persistence";
import { SettingsSheet } from "./settings";
import {
  applyTheme,
  Notice,
  StatusIndicator,
  ThemeToggle,
  watchSystemTheme,
} from "./ui";

const DEFAULT_FONT_SIZE = 17;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 28;

async function boot(): Promise<void> {
  await initBridge();

  const statusEl = document.getElementById("status")!;
  const noticeEl = document.getElementById("notice")!;
  const settingsEl = document.getElementById("settings")!;
  const editorEl = document.getElementById("editor")!;
  const themeEl = document.getElementById("theme-toggle")!;

  const status = new StatusIndicator(statusEl);
  const notice = new Notice(noticeEl);

  /* ---------------------------------------------------------- settings */

  let config: Config = await configLoad();
  applyTheme(config.theme);
  watchSystemTheme(() => config.theme);

  /* -------------------------------------------------------------- note */

  const note = await noteLoad();
  const session = await sessionLoad();

  // Images resolve against the directory that holds the note.
  const noteDir = note.path.replace(/[/\\][^/\\]*$/, "");
  setImageResolver((url) => imageSrc(url, noteDir));

  /* ------------------------------------------------------------ editor */

  const persistence = new Persistence(note.content, note.hash, {
    onState: (state) => status.set(state),
    onReload: (content) => {
      replaceDocument(view, content);
      notice.show("Reloaded — the file changed outside QuickNote.");
    },
    onConflict: (file) => {
      notice.show(
        `Your version was kept. The external version is in ${file}`,
        0,
      );
    },
    onError: (message) => {
      notice.show(`Could not save — ${message}`, 0);
    },
  });

  const view = createEditor(editorEl, note.content, {
    onChange: (content) => persistence.schedule(content),
    onCursor: (offset) => {
      session.cursorOffset = offset;
    },
    onFlush: () => {
      void persistence.flush();
    },
    onSettings: () => settings.toggle(),
    onFontStep: (step) => stepFontSize(step),
    onEscape: () => {
      if (settings.isOpen) settings.close();
      else if (notice.visible) notice.hide();
    },
  });

  setFontSize(view, config.fontSize);
  setCursor(view, session.cursorOffset);
  focusEditor(view);

  /* ----------------------------------------------------- font size */

  // `Cmd/Ctrl` with `+` or `-` steps the size. `Cmd/Ctrl + 0` restores it.
  function stepFontSize(step: number): void {
    const next =
      step === 0
        ? DEFAULT_FONT_SIZE
        : Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, config.fontSize + step));
    if (next === config.fontSize) return;

    config = { ...config, fontSize: next };
    setFontSize(view, next);
    settings.setConfig(config);
    void configSave(config);
  }

  /* ------------------------------------------------- settings sheet */

  const settings = new SettingsSheet(settingsEl, config, {
    onChange: (next) => {
      const themeChanged = next.theme !== config.theme;
      const sizeChanged = next.fontSize !== config.fontSize;
      const topChanged = next.alwaysOnTop !== config.alwaysOnTop;
      const shortcutChanged = next.globalShortcut !== config.globalShortcut;
      config = next;

      if (themeChanged) {
        applyTheme(config.theme);
        themeToggle.set(config.theme);
      }
      if (sizeChanged) setFontSize(view, config.fontSize);
      if (topChanged) void setAlwaysOnTop(config.alwaysOnTop);
      if (shortcutChanged) {
        void setGlobalShortcut(config.globalShortcut).then((ok) => {
          if (!ok) {
            notice.show(
              "That shortcut could not be registered. Try another combination.",
            );
          }
        });
      }
      void configSave(config);
    },
    onPickNoteFile: async () => {
      const chosen = await pickNoteFile();
      if (!chosen) return null;
      await persistence.flush();
      const loaded = await noteSetPath(chosen);
      replaceDocument(view, loaded.content);
      config = { ...config, notePath: loaded.path };
      void configSave(config);
      notice.show(`Now writing to ${loaded.path}`);
      return loaded.path;
    },
    onClose: () => focusEditor(view),
  });

  /* -------------------------------------------------- theme toggle */

  const themeToggle: ThemeToggle = new ThemeToggle(
    themeEl,
    config.theme,
    (choice) => {
      config = { ...config, theme: choice };
      applyTheme(choice);
      themeToggle.set(choice);
      settings.setConfig(config);
      void configSave(config);
      focusEditor(view);
    },
  );

  /* ------------------------------------------------- startup notices */

  if (note.recovered) {
    notice.show("Recovered your unsaved text from the last session.");
  }
  if (note.readOnly) {
    persistence.disable();
    notice.show(
      "The note file is read-only. QuickNote is not saving. " +
        "Choose another file in Settings.",
      0,
    );
  }

  /* -------------------------------------------------- window lifecycle */

  // Leaving the window is a natural place to write. PRD Section 12.
  window.addEventListener("blur", () => {
    void persistence.flush();
  });

  window.addEventListener("focus", () => {
    void persistence.checkExternal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistence.flush();
  });

  // The last line of defence in the browser fallback and on a hard reload.
  window.addEventListener("beforeunload", () => {
    void persistence.flush();
  });

  const saveSession = () => {
    session.scrollTop = view.scrollDOM.scrollTop;
    void sessionSave(session.cursorOffset, session.scrollTop);
  };

  view.scrollDOM.addEventListener("scroll", debounce(saveSession, 500));

  if (session.scrollTop > 0) {
    view.scrollDOM.scrollTop = session.scrollTop;
  }

  /* ------------------------------------------------- backend requests */

  // Rust asks before it hides or exits, so no write is ever cut short.
  onBackendEvent("quicknote://flush-and-hide", () => {
    void (async () => {
      await persistence.flush();
      saveSession();
      await hideWindow();
    })();
  });

  onBackendEvent("quicknote://flush-and-exit", () => {
    void (async () => {
      await persistence.flush();
      saveSession();
      await readyToExit();
    })();
  });

  onBackendEvent("quicknote://shown", () => {
    focusEditor(view);
    void persistence.checkExternal();
  });

  /* --------------------------------------------------------- shortcuts */

  document.addEventListener("keydown", (event) => {
    // The editor's own keymap runs first. Do not act on the same press twice.
    if (event.defaultPrevented) return;

    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;

    // These also work while the settings sheet or the find panel holds focus.
    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      stepFontSize(1);
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      stepFontSize(-1);
    }
    if (event.key === "0") {
      event.preventDefault();
      stepFontSize(0);
    }

    if (event.key === ",") {
      event.preventDefault();
      settings.toggle();
    }
    if (event.key.toLowerCase() === "w" && isTauri()) {
      event.preventDefault();
      void persistence.flush().then(() => hideWindow());
    }
    if (event.key.toLowerCase() === "q" && isTauri()) {
      event.preventDefault();
      void persistence.flush().then(() => quitApp());
    }
  });

  if (config.alwaysOnTop) void setAlwaysOnTop(true);
  if (isTauri()) void setGlobalShortcut(config.globalShortcut);
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: number | null = null;
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

boot().catch((error: unknown) => {
  // A failure this early means the editor never appeared. Say so plainly
  // rather than leaving a blank window.
  const el = document.getElementById("notice");
  if (el) {
    el.hidden = false;
    el.textContent = `QuickNote could not start — ${String(error)}`;
  }
});

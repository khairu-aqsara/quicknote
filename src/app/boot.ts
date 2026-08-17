/**
 * Startup. PRD Section 14.
 *
 * The order below is the order the PRD describes: recover, read, render,
 * restore the cursor, focus. Nothing blocks the editor from accepting the
 * first keystroke.
 */

import "../styles/index.css";

import {
  createEditor,
  focusEditor,
  restoreScroll,
  setCursor,
  setFontSize,
} from "../editor/editor";
import { initBridge } from "../bridge";
import { Persistence } from "../persistence";
import { SettingsSheet } from "../settings";
import {
  applyTheme,
  Notice,
  StatusIndicator,
  ThemeToggle,
  watchSystemTheme,
} from "../ui";

import { directoryOf, findElements, type AppContext } from "./context";
import { installLifecycle } from "./lifecycle";
import { installShortcuts } from "./shortcuts";
import {
  chooseTheme,
  editorHooks,
  persistenceHooks,
  settingsHooks,
  READ_ONLY_MESSAGE,
} from "./wiring";

export async function boot(): Promise<void> {
  const backend = await initBridge();
  const elements = findElements();

  const status = new StatusIndicator(elements.status);
  const notice = new Notice(elements.notice);

  const config = await backend.configLoad();
  applyTheme(config.theme);
  watchSystemTheme(() => ctx.config.theme);

  const note = await backend.noteLoad();
  const session = await backend.sessionLoad();
  const noteDir = directoryOf(note.path);

  /*
   * The four parts below each need the ones above, and the hooks of each need
   * the ones below. Handing the hooks a getter rather than the context itself
   * breaks that circle: every hook is a callback the user triggers, so by the
   * time one runs, `ctx` is complete.
   */
  let ctx: AppContext;
  const get = (): AppContext => ctx;

  const persistence = new Persistence(
    backend,
    note.content,
    note.hash,
    persistenceHooks(get),
  );

  const view = createEditor(
    elements.editor,
    note.content,
    (url) => backend.imageSrc(url, get().noteDir),
    editorHooks(get),
  );

  const settings = new SettingsSheet(
    elements.settings,
    config,
    settingsHooks(get),
  );

  const themeToggle = new ThemeToggle(elements.theme, config.theme, (choice) =>
    chooseTheme(get(), choice),
  );

  ctx = {
    backend,
    elements,
    status,
    notice,
    config,
    session,
    noteDir,
    persistence,
    view,
    settings,
    themeToggle,
  };

  /* --------------------------------------------------------- first paint */

  setFontSize(view, config.fontSize);
  setCursor(view, session.cursorOffset);
  focusEditor(view);
  restoreScroll(view, session.scrollTop);

  /* ----------------------------------------------------- startup notices */

  if (note.recovered) {
    notice.show("Recovered your unsaved text from the last session.");
  }
  if (note.readOnly) {
    persistence.disable();
    notice.show(READ_ONLY_MESSAGE, 0);
  }

  /* ------------------------------------------------------------ wiring up */

  installLifecycle(ctx);
  installShortcuts(ctx);

  if (config.alwaysOnTop) void backend.setAlwaysOnTop(true);
  if (backend.isTauri) void backend.setGlobalShortcut(config.globalShortcut);
}

/**
 * The hooks that join the three parts of the application together: what
 * autosave tells the user, what the editor asks the application to do, and
 * what a settings change sets off.
 */

import {
  focusEditor,
  replaceDocument,
  setFontSize,
  setImageResolver,
} from "../editor/editor";
import type { Config } from "../bridge";
import type { EditorHooks } from "../editor/editor";
import type { PersistenceHooks } from "../persistence";
import type { SettingsHooks } from "../settings";
import { applyTheme } from "../ui";

import { commitConfig, stepFontSize } from "./font-size";
import { directoryOf, type AppContext } from "./context";

const READ_ONLY_MESSAGE =
  "The note file is read-only. QuickNote is not saving. " +
  "Choose another file in Settings.";

export { READ_ONLY_MESSAGE };

export function persistenceHooks(ctx: () => AppContext): PersistenceHooks {
  return {
    onState: (state) => {
      ctx().status.set(state);
    },
    onReload: (content) => {
      replaceDocument(ctx().view, content);
      ctx().notice.show("Reloaded — the file changed outside QuickNote.");
    },
    onConflict: (file) => {
      ctx().notice.show(
        `Your version was kept. The external version is in ${file}`,
        0,
      );
    },
    onMissing: () => {
      ctx().notice.show("The note file was removed. QuickNote wrote it again.");
    },
    onError: (message) => {
      ctx().notice.show(`Could not save — ${message}`, 0);
    },
  };
}

export function editorHooks(ctx: () => AppContext): EditorHooks {
  return {
    onChange: (content) => {
      ctx().persistence.schedule(content);
    },
    onCursor: (offset) => {
      ctx().session.cursorOffset = offset;
    },
    onFlush: () => {
      void ctx().persistence.flush();
    },
    onSettings: () => {
      ctx().settings.toggle();
    },
    onFontStep: (step) => {
      stepFontSize(ctx(), step);
    },
    onEscape: () => {
      const app = ctx();
      if (app.settings.isOpen) app.settings.close();
      else if (app.notice.visible) app.notice.hide();
    },
  };
}

/**
 * Applies whatever the settings sheet changed.
 *
 * Only the fields that actually moved are acted on, because applying a theme
 * or a shortcut that did not change is visible work for no reason.
 */
function applySettings(ctx: AppContext, next: Config): void {
  const previous = ctx.config;
  ctx.config = next;

  if (next.theme !== previous.theme) {
    applyTheme(next.theme);
    ctx.themeToggle.set(next.theme);
  }
  if (next.fontSize !== previous.fontSize) setFontSize(ctx.view, next.fontSize);
  if (next.alwaysOnTop !== previous.alwaysOnTop) {
    void ctx.backend.setAlwaysOnTop(next.alwaysOnTop);
  }
  if (next.globalShortcut !== previous.globalShortcut) {
    void applyShortcut(ctx, previous.globalShortcut);
  }

  void ctx.backend.configSave(next);
}

/**
 * Rust keeps the working shortcut registered when the new one fails, so
 * storing the rejected one anyway would lose the working one on the next
 * launch.
 */
async function applyShortcut(
  ctx: AppContext,
  previousShortcut: string,
): Promise<void> {
  const ok = await ctx.backend.setGlobalShortcut(ctx.config.globalShortcut);
  if (ok) return;

  commitConfig(ctx, { ...ctx.config, globalShortcut: previousShortcut });
  ctx.notice.show(
    `That shortcut could not be registered. QuickNote kept ${previousShortcut}.`,
  );
}

/** Points every part of the application at another note file. */
async function switchNoteFile(ctx: AppContext): Promise<string | null> {
  const chosen = await ctx.backend.pickNoteFile();
  if (!chosen) return null;

  await ctx.persistence.flush();
  const loaded = await ctx.backend.noteSetPath(chosen);

  // Point autosave at the new file *before* the editor holds its text. The
  // previous file's hash would read as an external edit and write a conflict
  // copy of a file nobody touched.
  ctx.persistence.reset(loaded.content, loaded.hash);
  replaceDocument(ctx.view, loaded.content);

  // Images resolve against the folder that holds the note, so the resolver
  // has to follow it.
  ctx.noteDir = directoryOf(loaded.path);
  setImageResolver(ctx.view, (url) => ctx.backend.imageSrc(url, ctx.noteDir));

  ctx.config = { ...ctx.config, notePath: loaded.path };
  void ctx.backend.configSave(ctx.config);

  if (loaded.readOnly) {
    ctx.persistence.disable();
    ctx.notice.show(READ_ONLY_MESSAGE, 0);
  } else {
    ctx.notice.show(`Now writing to ${loaded.path}`);
  }
  return loaded.path;
}

export function settingsHooks(ctx: () => AppContext): SettingsHooks {
  return {
    onChange: (next) => {
      applySettings(ctx(), next);
    },
    onPickNoteFile: () => switchNoteFile(ctx()),
    onClose: () => {
      focusEditor(ctx().view);
    },
  };
}

/** The theme toggle in the corner. It switches light and dark, nothing else. */
export function chooseTheme(ctx: AppContext, choice: Config["theme"]): void {
  applyTheme(choice);
  ctx.themeToggle.set(choice);
  commitConfig(ctx, { ...ctx.config, theme: choice });
  focusEditor(ctx.view);
}

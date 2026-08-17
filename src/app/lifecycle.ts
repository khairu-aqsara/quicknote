/**
 * Every moment QuickNote writes without being asked. PRD Sections 12 and 14.
 *
 * The order inside each sequence is always the same, and it matters: flush the
 * note, then write the session, then let the window go. Rust rewrites
 * `session.json` on the way out — it stores the window geometry there — and it
 * reads the file first. Hiding before the session write lands puts the stale
 * cursor offset back.
 */

import { focusEditor } from "../editor/editor";
import type { AppContext } from "./context";

/** How long the scroll position settles before it is written. */
const SCROLL_DEBOUNCE_MS = 500;

export function saveSession(ctx: AppContext): Promise<void> {
  ctx.session.scrollTop = ctx.view.scrollDOM.scrollTop;
  return ctx.backend.sessionSave(
    ctx.session.cursorOffset,
    ctx.session.scrollTop,
  );
}

async function settle(ctx: AppContext): Promise<void> {
  await ctx.persistence.flush();
  await saveSession(ctx);
}

export async function flushAndHide(ctx: AppContext): Promise<void> {
  await settle(ctx);
  await ctx.backend.hideWindow();
}

export async function flushAndQuit(ctx: AppContext): Promise<void> {
  await settle(ctx);
  await ctx.backend.quitApp();
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: number | null = null;
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

export function installLifecycle(ctx: AppContext): void {
  // Leaving the window is a natural place to write.
  window.addEventListener("blur", () => {
    void ctx.persistence.flush();
  });

  window.addEventListener("focus", () => {
    void ctx.persistence.checkExternal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void ctx.persistence.flush();
  });

  // The last line of defence in the browser fallback and on a hard reload.
  window.addEventListener("beforeunload", () => {
    void ctx.persistence.flush();
  });

  ctx.view.scrollDOM.addEventListener(
    "scroll",
    debounce(() => void saveSession(ctx), SCROLL_DEBOUNCE_MS),
  );

  // Rust asks before it hides or exits, so no write is ever cut short.
  ctx.backend.onEvent("quicknote://flush-and-hide", () => {
    void flushAndHide(ctx);
  });

  ctx.backend.onEvent("quicknote://flush-and-exit", () => {
    void (async () => {
      await settle(ctx);
      await ctx.backend.readyToExit();
    })();
  });

  ctx.backend.onEvent("quicknote://shown", () => {
    focusEditor(ctx.view);
    void ctx.persistence.checkExternal();
  });
}

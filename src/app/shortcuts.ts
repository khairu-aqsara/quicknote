/**
 * The shortcuts that work even when the editor does not hold focus.
 *
 * The editor has its own keymap for everything that acts on the text. These
 * few also have to work while the settings sheet or the find panel has focus,
 * so they are bound on the document instead.
 */

import type { AppContext } from "./context";
import { flushAndHide, flushAndQuit } from "./lifecycle";
import { stepFontSize } from "./font-size";

/** Every layout writes `+` and `-` differently, so each spelling is listed. */
const FONT_STEP: Record<string, number> = {
  "=": 1,
  "+": 1,
  "-": -1,
  _: -1,
  "0": 0,
};

export function installShortcuts(ctx: AppContext): void {
  document.addEventListener("keydown", (event) => {
    // The editor's own keymap runs first. Do not act on the same press twice.
    if (event.defaultPrevented) return;
    if (!event.metaKey && !event.ctrlKey) return;

    const step = FONT_STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      stepFontSize(ctx, step);
      return;
    }

    if (event.key === ",") {
      event.preventDefault();
      ctx.settings.toggle();
      return;
    }

    // Hiding and quitting exist only in the desktop application. In the
    // browser fallback the same keys keep their normal meaning.
    if (!ctx.backend.isTauri) return;

    const key = event.key.toLowerCase();
    if (key === "w") {
      event.preventDefault();
      void flushAndHide(ctx);
    }
    if (key === "q") {
      event.preventDefault();
      void flushAndQuit(ctx);
    }
  });
}

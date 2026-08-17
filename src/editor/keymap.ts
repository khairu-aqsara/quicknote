/**
 * The key bindings QuickNote adds on top of CodeMirror's own. PRD Section 17.
 *
 * These run at a higher precedence than everything else, so they beat the
 * Markdown extension's Enter handler and the default keymap.
 */

import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { closeSearchPanel, openSearchPanel } from "@codemirror/search";

import {
  arrowDownEscapesBlock,
  closeCalloutOnEnter,
  closeFenceOnEnter,
  exitBlock,
} from "./commands";
import {
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleLink,
  toggleStrikethrough,
} from "./format";
import type { EditorHooks } from "./editor";

/**
 * Every layout writes `+` and `-` differently, so each spelling is bound.
 * A step of 0 means "back to the default size".
 */
const FONT_KEYS: ReadonlyArray<readonly [readonly string[], number]> = [
  [["Mod-=", "Mod-+", "Mod-Shift-=", "Mod-Shift-+"], 1],
  [["Mod--", "Mod-_", "Mod-Shift--"], -1],
  [["Mod-0"], 0],
];

/** Wraps a hook as a command that always claims the key press. */
function runs(hook: () => void) {
  return () => {
    hook();
    return true;
  };
}

export function editorKeymap(hooks: EditorHooks): Extension {
  const fontBindings = FONT_KEYS.flatMap(([keys, step]) =>
    keys.map((key) => ({
      key,
      preventDefault: true,
      run: runs(() => {
        hooks.onFontStep(step);
      }),
    })),
  );

  return Prec.high(
    keymap.of([
      // Keeping the cursor free of block constructs.
      { key: "Enter", run: closeFenceOnEnter },
      { key: "Enter", run: closeCalloutOnEnter },
      { key: "Mod-Enter", run: exitBlock, preventDefault: true },
      { key: "ArrowDown", run: arrowDownEscapesBlock },

      // Inline formatting. The same commands the formatting bar runs.
      { key: "Mod-b", preventDefault: true, run: toggleBold },
      { key: "Mod-i", preventDefault: true, run: toggleItalic },
      { key: "Mod-Shift-x", preventDefault: true, run: toggleStrikethrough },
      { key: "Mod-e", preventDefault: true, run: toggleCode },
      { key: "Mod-k", preventDefault: true, run: toggleLink },

      { key: "Mod-s", preventDefault: true, run: runs(hooks.onFlush) },
      { key: "Mod-,", preventDefault: true, run: runs(hooks.onSettings) },
      ...fontBindings,

      { key: "Mod-f", preventDefault: true, run: openSearchPanel },
      {
        key: "Escape",
        run: (view) => {
          if (closeSearchPanel(view)) return true;
          hooks.onEscape();
          return true;
        },
      },
    ]),
  );
}

/**
 * Editor assembly. PRD Sections 10 and 17.
 *
 * The buffer holds the Markdown source and nothing else. Every other layer in
 * the application reads the source from here and writes it back unchanged.
 */

import { EditorState, Compartment, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
} from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { liveRender } from "./live-render";
import { editorTheme, codeHighlight } from "./theme";
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
import { formatBar } from "./format-bar";

export interface EditorHooks {
  /** Fires on every document change the user made. */
  onChange: (content: string) => void;
  /** Fires when the cursor or the scroll position settles. */
  onCursor: (offset: number) => void;
  /** `Cmd/Ctrl + S` — flush pending changes now. */
  onFlush: () => void;
  /** `Cmd/Ctrl + ,` — open the settings sheet. */
  onSettings: () => void;
  /** `Cmd/Ctrl` with `+`, `-`, or `0`. A step of 0 means "back to default". */
  onFontStep: (step: number) => void;
  /** `Esc` with no panel open. */
  onEscape: () => void;
}

/** Swapped at runtime when the user changes the font size. */
const fontSize = new Compartment();

export function createEditor(
  parent: HTMLElement,
  initialContent: string,
  hooks: EditorHooks,
): EditorView {
  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      rectangularSelection(),
      crosshairCursor(),
      EditorView.lineWrapping,
      search({ top: false }),

      // The grammar. `markdownLanguage` is CommonMark plus the GitHub
      // task list, strikethrough, and table extensions. Its keymap gives
      // us list continuation on Enter and mark-aware Backspace.
      //
      // `codeLanguages` highlights the body of a fenced block according to
      // its info string. Each grammar is a dynamic import, so none of them
      // is loaded until a note actually contains that language — startup
      // pays nothing for a language you never write.
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        addKeymap: true,
      }),

      liveRender,
      formatBar,
      editorTheme,
      codeHighlight,
      fontSize.of([]),

      // These must beat the Markdown extension's own Enter handler, so they
      // are registered at a higher precedence than everything below.
      Prec.high(
        keymap.of([
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

          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              hooks.onFlush();
              return true;
            },
          },
          {
            key: "Mod-,",
            preventDefault: true,
            run: () => {
              hooks.onSettings();
              return true;
            },
          },
          // Every layout writes `+` differently, so bind each spelling.
          ...(["Mod-=", "Mod-+", "Mod-Shift-=", "Mod-Shift-+"] as const).map(
            (key) => ({
              key,
              preventDefault: true,
              run: () => {
                hooks.onFontStep(1);
                return true;
              },
            }),
          ),
          ...(["Mod--", "Mod-_", "Mod-Shift--"] as const).map((key) => ({
            key,
            preventDefault: true,
            run: () => {
              hooks.onFontStep(-1);
              return true;
            },
          })),
          {
            key: "Mod-0",
            preventDefault: true,
            run: () => {
              hooks.onFontStep(0);
              return true;
            },
          },

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
      ),

      keymap.of([
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),

      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          hooks.onChange(update.state.doc.toString());
        }
        if (update.selectionSet) {
          hooks.onCursor(update.state.selection.main.head);
        }
      }),
    ],
  });

  return new EditorView({ state, parent });
}

/** Replaces the whole document without destroying the undo history. */
export function replaceDocument(view: EditorView, content: string): void {
  const cursor = Math.min(view.state.selection.main.head, content.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
    selection: { anchor: cursor },
  });
}

export function setFontSize(view: EditorView, px: number): void {
  view.dispatch({
    effects: fontSize.reconfigure(
      EditorView.theme({ "&": { fontSize: `${px}px` } }),
    ),
  });
}

export function focusEditor(view: EditorView): void {
  view.focus();
}

export function setCursor(view: EditorView, offset: number): void {
  const max = view.state.doc.length;
  const pos = Math.max(0, Math.min(offset, max));
  view.dispatch({
    selection: { anchor: pos },
    scrollIntoView: true,
  });
}

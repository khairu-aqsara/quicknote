/**
 * Editor assembly. PRD Sections 10 and 17.
 *
 * The buffer holds the Markdown source and nothing else. Every other layer in
 * the application reads the source from here and writes it back unchanged.
 */

import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

import { formatBar } from "./format-bar";
import { editorKeymap } from "./keymap";
import { imageResolver, liveRender, type ImageResolver } from "./render";
import { codeHighlight, editorTheme } from "./theme";

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

/** Swapped when the user picks another note file, so images follow it. */
const images = new Compartment();

/**
 * Marks a change the application made, not the user: a reload after an external
 * edit, or a switch to another note file. Autosave must ignore these. Without
 * the mark, reading a file immediately writes it back and reports it as unsaved
 * work, and switching files saves the new text against the old file's hash.
 */
const programmatic = Annotation.define<boolean>();

export function createEditor(
  parent: HTMLElement,
  initialContent: string,
  resolveImage: ImageResolver,
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
      images.of(imageResolver.of(resolveImage)),

      // Must beat the Markdown extension's own Enter handler and the
      // defaults below, so it is registered at a higher precedence.
      editorKeymap(hooks),

      keymap.of([
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),

      EditorView.updateListener.of((update) => {
        const applicationEdit = update.transactions.some(
          (tr) => tr.annotation(programmatic) === true,
        );
        if (update.docChanged && !applicationEdit) {
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

/**
 * Replaces the whole document without destroying the undo history.
 *
 * The change carries the `programmatic` mark, so autosave does not treat text
 * that just came off disk as text the user typed.
 */
export function replaceDocument(view: EditorView, content: string): void {
  const cursor = Math.min(view.state.selection.main.head, content.length);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
    selection: { anchor: cursor },
    annotations: programmatic.of(true),
  });
}

/**
 * Puts the scroll position back where the last session left it, then makes sure
 * the restored cursor is still on screen.
 *
 * The two values are stored separately and can disagree — the file may have
 * shrunk outside QuickNote since they were written. The cursor wins, because
 * the first keystroke would jump the view there anyway.
 */
export function restoreScroll(view: EditorView, top: number): void {
  if (top > 0) view.scrollDOM.scrollTop = top;

  const head = view.state.selection.main.head;
  const coords = view.coordsAtPos(head);
  const box = view.scrollDOM.getBoundingClientRect();
  if (!coords || coords.top < box.top || coords.bottom > box.bottom) {
    view.dispatch({ effects: EditorView.scrollIntoView(head) });
  }
}

export function setFontSize(view: EditorView, px: number): void {
  view.dispatch({
    effects: fontSize.reconfigure(
      EditorView.theme({ "&": { fontSize: `${px}px` } }),
    ),
  });
}

/**
 * Points the renderer at another note's directory.
 *
 * Images resolve against the folder that holds the note, so the resolver has to
 * follow the note whenever the user chooses another file.
 */
export function setImageResolver(
  view: EditorView,
  resolve: ImageResolver,
): void {
  view.dispatch({ effects: images.reconfigure(imageResolver.of(resolve)) });
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

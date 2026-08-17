/**
 * Inline formatting. PRD Sections 10 and 17.
 *
 * Every command here writes Markdown source and nothing else. Bold inserts the
 * two asterisks the user would have typed, so the file on disk stays plain
 * Markdown and the live-rendering layer paints the result with no further help.
 *
 * A command that finds its construct already around the selection removes it.
 * One key press therefore both applies the style and clears it.
 */

import {
  ChangeSet,
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export interface InlineStyle {
  /** The name the Markdown grammar gives the whole construct. */
  readonly node: string;
  /** The name it gives the construct's opening and closing marks. */
  readonly mark: string;
  /** The characters that open and close the construct around `text`. */
  readonly delimiter: (text: string) => string;
}

export const BOLD: InlineStyle = {
  node: "StrongEmphasis",
  mark: "EmphasisMark",
  delimiter: () => "**",
};

export const ITALIC: InlineStyle = {
  node: "Emphasis",
  mark: "EmphasisMark",
  delimiter: () => "*",
};

export const STRIKETHROUGH: InlineStyle = {
  node: "Strikethrough",
  mark: "StrikethroughMark",
  delimiter: () => "~~",
};

export const CODE: InlineStyle = {
  node: "InlineCode",
  mark: "CodeMark",
  // A code span ends at the first run of backticks that matches the run which
  // opened it. Text that already holds backticks therefore needs a longer run,
  // or the span closes in the middle of the selection.
  delimiter: (text) => "`".repeat(longestBacktickRun(text) + 1),
};

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return longest;
}

/* --------------------------------------------------------------- the plan */

export interface FormatPlan {
  readonly changes: readonly ChangeSpec[];
  /** Where the selection lands afterwards. */
  readonly anchor: number;
  readonly head: number;
}

/**
 * The construct of this name that already encloses the range, or null.
 *
 * The grammar answers this, not the characters, so a selection of the word
 * inside `**bold**` finds the same node as a selection of the whole thing.
 */
function enclosing(
  state: EditorState,
  name: string,
  from: number,
  to: number,
): SyntaxNode | null {
  const tree = syntaxTree(state);
  const empty = from === to;

  // Both sides have to be tried. At the end of a construct there is no node
  // starting at the position, so asking with side 1 alone reports nothing.
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(from, side);
      node;
      node = node.parent
    ) {
      if (node.name !== name) continue;
      // A cursor on the very edge of a construct is not inside it. Without
      // this, pressing the key just before `**bold**` would clear the bold.
      const covers = empty
        ? node.from < from && node.to > from
        : node.from <= from && node.to >= to;
      if (covers) return node;
    }
  }
  return null;
}

/** The changes that delete a construct's opening and closing marks. */
function removeMarks(node: SyntaxNode, mark: string): ChangeSpec[] | null {
  const marks: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === mark) marks.push(child);
  }
  if (marks.length < 2) return null;

  const open = marks[0];
  const close = marks[marks.length - 1];
  return [
    { from: open.from, to: open.to },
    { from: close.from, to: close.to },
  ];
}

/**
 * Carries the selection across the changes.
 *
 * The anchor leans right and the head leans left, so the selection ends up
 * around the text and never around the marks that were just written.
 */
function keepSelection(
  state: EditorState,
  changes: ChangeSpec[],
  from: number,
  to: number,
): FormatPlan {
  const set = ChangeSet.of(changes, state.doc.length);
  return { changes, anchor: set.mapPos(from, 1), head: set.mapPos(to, -1) };
}

/**
 * The range without the whitespace at its edges.
 *
 * Markdown will not open a construct on a space. GFM asks the opening
 * delimiter to be followed by something other than whitespace, and the closing
 * one to be preceded by it, so `~~ struck~~` and `~~struck ~~` both stay
 * literal tildes on screen — the grammar never builds a `Strikethrough` node
 * for them, and nothing paints them.
 *
 * A drag that takes in the space before a word is completely ordinary, so the
 * marks go around the text the selection covers rather than around the
 * selection itself. Bold and italic share the rule; inline code does not, but
 * it reads better trimmed too.
 *
 * An all-whitespace range comes back empty, which `planFormat` treats as
 * nothing to style.
 */
function textIn(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  const text = state.sliceDoc(from, to);
  const lead = text.length - text.trimStart().length;

  // Nothing but whitespace. Collapse rather than return an inverted range.
  if (lead === text.length) return { from: to, to };

  const trail = text.length - text.trimEnd().length;
  return { from: from + lead, to: to - trail };
}

/**
 * Works out how to apply or clear one style, without touching the view.
 *
 * Kept pure so it can be tested against a real syntax tree with no DOM.
 */
export function planFormat(
  state: EditorState,
  range: SelectionRange,
  style: InlineStyle,
): FormatPlan {
  const { from, to } = textIn(state, range.from, range.to);

  // The user selected whitespace and nothing else. Writing marks around it
  // would produce a construct the grammar refuses to pair, so decline: the
  // command reports that it did nothing and the key press falls through.
  if (from === to && range.from !== range.to) {
    return { changes: [], anchor: range.anchor, head: range.head };
  }

  const node = enclosing(state, style.node, from, to);
  if (node) {
    const changes = removeMarks(node, style.mark);
    if (changes) return keepSelection(state, changes, from, to);
  }

  const delimiter = style.delimiter(state.sliceDoc(from, to));

  // An empty selection opens the construct and waits inside it.
  if (from === to) {
    const anchor = from + delimiter.length;
    return {
      changes: [{ from, insert: delimiter + delimiter }],
      anchor,
      head: anchor,
    };
  }

  return keepSelection(
    state,
    [
      { from, insert: delimiter },
      { from: to, insert: delimiter },
    ],
    from,
    to,
  );
}

/**
 * True when the range already sits inside this construct.
 *
 * It asks about the same trimmed range `planFormat` acts on, so the formatting
 * bar never shows a button as off and then clears the style when it is pressed.
 */
export function isStyled(
  state: EditorState,
  range: SelectionRange,
  style: InlineStyle,
): boolean {
  const { from, to } = textIn(state, range.from, range.to);
  return enclosing(state, style.node, from, to) !== null;
}

/* ----------------------------------------------------------- the commands */

function applyStyle(view: EditorView, style: InlineStyle): boolean {
  const { state } = view;

  const spec = state.changeByRange((range) => {
    const plan = planFormat(state, range, style);
    return {
      changes: plan.changes as ChangeSpec[],
      range: EditorSelection.range(plan.anchor, plan.head),
    };
  });

  if (spec.changes.empty) return false;

  view.dispatch({
    ...spec,
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

export const toggleBold: Command = (view) => applyStyle(view, BOLD);
export const toggleItalic: Command = (view) => applyStyle(view, ITALIC);
export const toggleStrikethrough: Command = (view) =>
  applyStyle(view, STRIKETHROUGH);
export const toggleCode: Command = (view) => applyStyle(view, CODE);

/* ----------------------------------------------------------------- links */

/** Text that is already an address goes in the target, not in the label. */
const ADDRESS = /^(?:[a-z][a-z\d+.-]*:|www\.)\S*$/i;

/** True when the range sits inside a `[text](url)` link. */
export function isLinked(state: EditorState, range: SelectionRange): boolean {
  return enclosing(state, "Link", range.from, range.to) !== null;
}

/** The changes that leave a link's text and delete its brackets and target. */
function removeLink(node: SyntaxNode): ChangeSpec[] | null {
  const marks: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LinkMark") marks.push(child);
  }
  if (marks.length < 2) return null;

  return [
    { from: node.from, to: marks[0].to },
    { from: marks[1].from, to: node.to },
  ];
}

/**
 * `[text](url)` around the selection, or the link taken off again.
 *
 * The cursor lands in the half the user still has to fill: the target when the
 * selection was the label, and the label when the selection was already an
 * address.
 *
 * Kept pure for the same reason as `planFormat`.
 */
export function planLink(
  state: EditorState,
  range: SelectionRange,
): FormatPlan {
  const { from, to } = range;

  const node = enclosing(state, "Link", from, to);
  if (node) {
    const changes = removeLink(node);
    if (changes) return keepSelection(state, changes, from, to);
  }

  const text = state.sliceDoc(from, to);

  if (ADDRESS.test(text)) {
    const anchor = from + 1;
    return {
      changes: [{ from, to, insert: `[](${text})` }],
      anchor,
      head: anchor,
    };
  }

  const anchor = from + text.length + 3;
  return {
    changes: [{ from, to, insert: `[${text}]()` }],
    anchor,
    head: anchor,
  };
}

export const toggleLink: Command = (view) => {
  const { state } = view;

  const spec = state.changeByRange((range) => {
    const plan = planLink(state, range);
    return {
      changes: plan.changes as ChangeSpec[],
      range: EditorSelection.range(plan.anchor, plan.head),
    };
  });

  view.dispatch({
    ...spec,
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
};

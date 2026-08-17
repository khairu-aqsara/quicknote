/**
 * Commands that keep the cursor free. PRD Section 10.
 *
 * A fenced code block with no closing fence swallows the rest of the document,
 * so the cursor can never get past it. These commands close the fence when the
 * block is opened, and give the cursor a way out of any block construct.
 */

import type { Command } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { CALLOUT_OPEN_RE, calloutAtLine, findCallouts } from "./callouts";

/** Blocks a cursor can get trapped inside. */
const TRAPPING = new Set(["FencedCode", "CodeBlock", "Table", "Blockquote"]);

/**
 * Finds the block construct the cursor sits in, if any.
 *
 * Both sides have to be tried. At the end of a line or of the document there
 * is no node *starting* at the position, so asking with side 1 alone reports
 * no block — which is precisely where the cursor sits inside an open fence.
 */
function enclosingBlock(state: EditorState, pos: number) {
  for (const side of [-1, 1] as const) {
    let node = syntaxTree(state).resolveInner(pos, side);
    let found: { from: number; to: number; name: string } | null = null;
    while (node.parent) {
      if (TRAPPING.has(node.name)) {
        found = { from: node.from, to: node.to, name: node.name };
      }
      node = node.parent;
    }
    if (found) return found;
  }
  return null;
}

/**
 * Returns the closing fence a code block still needs, or null when it is
 * already closed or is not a fenced block.
 *
 * This is the whole reason a code block can trap the cursor: an unterminated
 * fence runs to the end of the document, so adding a line after it only adds
 * another line *inside* the block.
 */
function missingFence(
  state: EditorState,
  block: { from: number; to: number },
): string | null {
  const first = state.doc.lineAt(block.from);
  const opening = /^(\s*)(`{3,}|~{3,})/.exec(first.text);
  if (!opening) return null;

  const last = state.doc.lineAt(Math.min(block.to, state.doc.length));
  // A block that is only its opening line has no closing fence yet.
  if (last.number === first.number) return opening[1] + opening[2];
  if (/^\s*(`{3,}|~{3,})\s*$/.test(last.text)) return null;
  return opening[1] + opening[2];
}

/** True when the document holds an odd number of fence lines, so this one is open. */
function fenceIsUnpaired(state: EditorState): boolean {
  let count = 0;
  for (let n = 1; n <= state.doc.lines; n++) {
    if (/^\s*(`{3,}|~{3,})/.test(state.doc.line(n).text)) count++;
  }
  return count % 2 === 1;
}

/**
 * `Enter` on a line that opens a fence writes the closing fence too, and
 * leaves the cursor inside. This is what stops the block from swallowing the
 * rest of the note.
 */
export const closeFenceOnEnter: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  const match = /^(\s*)(`{3,}|~{3,})([A-Za-z0-9_+-]*)\s*$/.exec(line.text);
  if (!match) return false;
  if (range.head !== line.to) return false;
  if (!fenceIsUnpaired(state)) return false;

  const [, indent, fence] = match;
  const insert = `\n${indent}\n${indent}${fence}`;

  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + 1 + indent.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/**
 * Leaves a callout. An unclosed one traps the cursor the same way an unclosed
 * fence does, because everything after `:::success` belongs to the block until
 * a closing `:::` appears.
 */
function planCalloutExit(state: EditorState, pos: number): ExitPlan | null {
  const callout = calloutAtLine(state, state.doc.lineAt(pos).number);
  if (!callout) return null;

  if (callout.closeFrom === null) {
    const lastLine = state.doc.line(callout.lastLine);
    const lead = lastLine.text.trim() === "" ? "" : "\n";
    const text = `${lead}${callout.indent}:::\n`;
    return {
      insert: { from: lastLine.to, text },
      anchor: lastLine.to + text.length,
    };
  }

  const closeLine = state.doc.line(callout.lastLine);

  // Reuse an empty line that already follows the closing marker.
  if (closeLine.number < state.doc.lines) {
    const next = state.doc.line(closeLine.number + 1);
    if (next.text.trim() === "") return { anchor: next.from };
  }

  return { insert: { from: closeLine.to, text: "\n" }, anchor: closeLine.to + 1 };
}

export interface ExitPlan {
  /** Absent when the cursor only has to move. */
  insert?: { from: number; text: string };
  /** Where the cursor lands afterwards. */
  anchor: number;
}

/**
 * Works out how to leave the block at `pos`, without touching the view.
 * Returns null when the cursor is not inside a block construct.
 *
 * Kept pure so it can be tested against a real syntax tree with no DOM.
 */
export function planBlockExit(
  state: EditorState,
  pos: number,
): ExitPlan | null {
  const block = enclosingBlock(state, pos);

  // A code block inside a callout is left first, then the callout itself.
  if (!block) return planCalloutExit(state, pos);

  const lastLine = state.doc.lineAt(Math.min(block.to, state.doc.length));

  // An open fence has to be closed, or the new line lands back inside it.
  const fence = missingFence(state, block);
  if (fence) {
    const lead = lastLine.text.trim() === "" ? "" : "\n";
    const text = `${lead}${fence}\n`;
    return {
      insert: { from: lastLine.to, text },
      anchor: lastLine.to + text.length,
    };
  }

  const end = block.to;

  // Reuse an empty line that already follows the block.
  if (end < state.doc.length) {
    const next = state.doc.lineAt(Math.min(end + 1, state.doc.length));
    if (next.from >= end && next.text.trim() === "") {
      return { anchor: next.from };
    }
  }

  return { insert: { from: end, text: "\n" }, anchor: end + 1 };
}

/**
 * `Enter` on a line that opens a callout writes the closing `:::` too, so the
 * block never swallows the rest of the note. Same remedy as an open fence.
 */
export const closeCalloutOnEnter: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;

  const match = CALLOUT_OPEN_RE.exec(line.text);
  if (!match) return false;

  // Only when this callout is still open. Otherwise Enter behaves normally.
  const callout = findCallouts(state).find((c) => c.firstLine === line.number);
  if (!callout || callout.closeFrom !== null) return false;

  const indent = match[1];
  const insert = `\n${indent}\n${indent}:::`;

  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + 1 + indent.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/**
 * Leaves the enclosing block and lands on a fresh paragraph after it.
 * Bound to `Mod-Enter`, and reached by pressing Down on the last line.
 */
export const exitBlock: Command = (view) => {
  const plan = planBlockExit(view.state, view.state.selection.main.head);
  if (!plan) return false;

  view.dispatch({
    changes: plan.insert
      ? { from: plan.insert.from, insert: plan.insert.text }
      : undefined,
    selection: { anchor: plan.anchor },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/**
 * Down on the last line of the note escapes a block instead of doing nothing.
 * Without this, a code block at the end of the note is a dead end.
 */
export const arrowDownEscapesBlock: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  if (line.number !== state.doc.lines) return false;

  // `exitBlock` declines when the cursor is not in a block, so Down keeps its
  // normal behaviour everywhere else.
  return exitBlock(view);
};

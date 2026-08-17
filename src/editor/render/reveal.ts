/**
 * Which lines currently show their syntax marks. PRD Section 9.
 *
 *   - inline constructs reveal by line
 *   - block constructs (fenced code, table, blockquote) reveal by block
 *   - only a plain cursor reveals; a selection leaves the text as it is
 */

import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/** Block constructs that reveal as a whole unit, not line by line. */
export const BLOCK_REVEAL = new Set([
  "FencedCode",
  "CodeBlock",
  "Table",
  "Blockquote",
]);

/**
 * The set of line numbers that currently show their marks.
 *
 * Only a plain cursor reveals. A selection that spans text reveals nothing,
 * because revealing marks makes the text longer, and text that grows under a
 * dragging mouse makes a selection impossible to aim.
 */
export function revealedLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  const tree = syntaxTree(state);

  for (const range of state.selection.ranges) {
    if (!range.empty) continue;

    lines.add(state.doc.lineAt(range.head).number);

    // A cursor inside a block construct reveals the whole block.
    let node = tree.resolveInner(range.head, -1);
    while (node.parent) {
      if (BLOCK_REVEAL.has(node.name)) {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(node.to).number;
        for (let n = first; n <= last; n++) lines.add(n);
      }
      node = node.parent;
    }
  }

  return lines;
}

/**
 * How deeply a list item nests, counting from zero.
 *
 * The Markdown source carries the nesting as leading spaces, and a space in a
 * proportional serif is far too narrow to read as a level. The tree knows the
 * real structure, so the indent comes from here instead of from the text.
 */
export function listDepth(node: SyntaxNode): number {
  let lists = 0;
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "BulletList" || n.name === "OrderedList") lists++;
  }
  return Math.max(0, lists - 1);
}

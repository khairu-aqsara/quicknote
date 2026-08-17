/**
 * Live rendering — the core of QuickNote.
 *
 * The document in the editor is always the raw Markdown source. This plugin
 * never edits it. It only paints over it:
 *
 *   - it styles each construct in place, and
 *   - it hides the construct's syntax marks when the cursor is elsewhere.
 *
 * Because the marks are hidden and not deleted, the buffer and the file on
 * disk always hold the full source. See PRD Section 10.
 *
 * The work is split into passes. Each one is asked about a node in turn, and
 * the first that claims it decides how it looks:
 *
 *   blocks  → the whole line (headings, code, quotes, tables, rules)
 *   inline  → a run of characters (bold, links, images)
 *   marks   → the syntax characters themselves, hidden or dimmed
 *
 * Callouts run afterwards, because the Markdown grammar does not know them.
 */

import {
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";

import { DecorationBuilder } from "./builder";
import { decorateBlock } from "./blocks";
import { decorateCallouts } from "./callouts";
import { decorateInline } from "./inline";
import { decorateMark } from "./marks";
import { revealedLines } from "./reveal";

export { imageResolver, type ImageResolver } from "./images";

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const builder = new DecorationBuilder(state, revealedLines(state));
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    builder.beginRange();

    tree.iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef): boolean | undefined => {
        // Inside a range already replaced as a whole. Do not descend.
        if (builder.shouldSkip(node.from)) return false;

        if (!decorateBlock(builder, node) && !decorateInline(builder, node)) {
          decorateMark(builder, node, builder.isRevealed(node.from));
        }
        return undefined;
      },
    });
  }

  decorateCallouts(builder, [...view.visibleRanges]);
  return builder.finish();
}

export const liveRender = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

/*
 * A note on cursor safety.
 *
 * The plugin never needs `EditorView.atomicRanges`. A mark is hidden only when
 * its line is outside the reveal window, and the cursor's own line is always
 * inside that window. The cursor therefore can never sit inside hidden text,
 * so one arrow key press always moves one visible position.
 */

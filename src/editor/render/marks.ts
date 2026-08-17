/**
 * The syntax marks themselves — the characters that are hidden when the cursor
 * is elsewhere. This is what makes the editor read as rendered text while the
 * buffer still holds plain Markdown. PRD Section 10.
 */

import type { SyntaxNodeRef } from "@lezer/common";

import type { DecorationBuilder } from "./builder";
import { BulletWidget, CheckboxWidget } from "./widgets";

/** Marks that stay on screen while their line is revealed, only dimmed. */
const DIMMED = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "QuoteMark",
  "LinkMark",
  "ListMark",
  "CodeInfo",
  "URL",
  "LinkTitle",
]);

/** Marks that take the spaces after them, so the text closes up cleanly. */
const HIDDEN_WITH_SPACE = new Set(["HeaderMark", "QuoteMark"]);

/** Marks that are simply removed from view. */
const HIDDEN = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "LinkMark",
  "URL",
  "LinkTitle",
]);

export function decorateMark(
  builder: DecorationBuilder,
  node: SyntaxNodeRef,
  revealed: boolean,
): void {
  if (revealed) {
    // Keep the marks visible, but dim them so the text still leads.
    if (DIMMED.has(node.name)) builder.mark(node.from, node.to, "cm-mark");
    return;
  }

  if (HIDDEN_WITH_SPACE.has(node.name)) {
    builder.hideWithTrailingSpace(node.from, node.to);
    return;
  }

  if (HIDDEN.has(node.name)) {
    builder.hide(node.from, node.to);
    return;
  }

  switch (node.name) {
    // The info string stays visible as a small label on the block's top edge.
    // It is what selects the highlighting, so hiding it would hide the only
    // clue about why a block is or is not coloured.
    case "CodeInfo":
      builder.mark(node.from, node.to, "cm-code-info");
      break;

    case "TaskMarker":
      decorateTaskMarker(builder, node);
      break;

    case "ListMark":
      decorateListMark(builder, node);
      break;

    case "TableDelimiter":
      builder.mark(node.from, node.to, "cm-mark");
      break;

    default:
  }
}

function decorateTaskMarker(
  builder: DecorationBuilder,
  node: SyntaxNodeRef,
): void {
  const checked = /[xX]/.test(builder.doc.sliceString(node.from, node.to));

  // The box takes the spaces after it, so a task item's marker column is
  // exactly as wide as a bullet item's.
  const end = builder.afterSpaces(node.to);
  builder.replaceWith(node.from, end, {
    widget: new CheckboxWidget(checked, node.from, node.to),
  });
}

function decorateListMark(
  builder: DecorationBuilder,
  node: SyntaxNodeRef,
): void {
  const marker = builder.doc.sliceString(node.from, node.to);
  const rest = builder.doc.sliceString(
    node.to,
    Math.min(node.to + 6, builder.doc.lineAt(node.to).to),
  );
  const end = builder.afterSpaces(node.to);

  if (/^\s*\[[ xX]\]/.test(rest)) {
    // The checkbox stands in for the whole marker.
    builder.hideWithTrailingSpace(node.from, node.to);
    return;
  }

  if (/^[-*+]$/.test(marker)) {
    // The widget takes the spaces as well, so it can own the column.
    builder.replaceWith(node.from, end, { widget: new BulletWidget() });
    return;
  }

  // `1.` keeps its digits — they carry meaning. The class holds it to the
  // column width so the text still starts where it should.
  builder.mark(node.from, end, "cm-list-number");
}

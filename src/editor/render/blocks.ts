/**
 * Block constructs: what the whole line looks like.
 *
 * These passes style lines rather than characters, because a heading, a code
 * block, a quote, and a table each need the line itself to carry the colour,
 * the padding, and the rounded corners.
 */

import type { SyntaxNodeRef } from "@lezer/common";

import type { DecorationBuilder } from "./builder";
import { RuleWidget } from "./widgets";

const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-h1",
  ATXHeading2: "cm-h2",
  ATXHeading3: "cm-h3",
  ATXHeading4: "cm-h4",
  ATXHeading5: "cm-h5",
  ATXHeading6: "cm-h6",
  SetextHeading1: "cm-h1",
  SetextHeading2: "cm-h2",
};

/** Returns true when this node was a block construct and is now handled. */
export function decorateBlock(
  builder: DecorationBuilder,
  node: SyntaxNodeRef,
): boolean {
  const heading = HEADING_LINE_CLASS[node.name];
  if (heading) {
    builder.lineClass(node.from, node.to, heading);
    return true;
  }

  switch (node.name) {
    case "FencedCode":
    case "CodeBlock": {
      builder.lineClass(node.from, node.to, "cm-code-line");

      // The first and last lines carry the rounded corners, so a block reads
      // as one shape rather than as a stack of coloured lines.
      const first = builder.doc.lineAt(node.from).number;
      const last = builder.doc.lineAt(node.to).number;
      builder.lineAt(first, "cm-code-open");
      if (last !== first) builder.lineAt(last, "cm-code-close");
      return true;
    }

    case "ListItem":
      builder.claimListLines(node.node);
      return true;

    case "Blockquote":
      builder.lineClass(node.from, node.to, "cm-quote-line");
      return true;

    case "Table":
      builder.lineClass(node.from, node.to, "cm-table-line");
      return true;

    case "HorizontalRule":
      if (builder.isRevealed(node.from)) {
        builder.mark(node.from, node.to, "cm-rule-source");
      } else {
        builder.replaceWith(node.from, node.to, { widget: new RuleWidget() });
      }
      return true;

    default:
      return false;
  }
}

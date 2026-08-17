/**
 * Inline constructs: what a run of characters looks like.
 *
 * These are styled in place and stay styled whether or not their line is
 * revealed. Only the marks around them come and go — see `marks.ts`.
 */

import type { SyntaxNodeRef } from "@lezer/common";

import type { DecorationBuilder } from "./builder";
import { ImageWidget } from "./widgets";

const INLINE_CLASS: Record<string, string> = {
  StrongEmphasis: "cm-strong",
  Emphasis: "cm-em",
  Strikethrough: "cm-strike",
  InlineCode: "cm-inline-code",
  Link: "cm-link",
};

/** `![alt](src)` — the alt text and the target, up to the first space. */
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)/;

/** Returns true when this node was an inline construct and is now handled. */
export function decorateInline(
  builder: DecorationBuilder,
  node: SyntaxNodeRef,
): boolean {
  const cls = INLINE_CLASS[node.name];
  if (cls) {
    builder.mark(node.from, node.to, cls);
    return true;
  }

  if (node.name !== "Image") return false;

  // A revealed line shows the source, so the picture would cover the text the
  // cursor is in the middle of editing.
  if (builder.isRevealed(node.from)) {
    builder.mark(node.from, node.to, "cm-link");
    return true;
  }

  const match = IMAGE.exec(builder.doc.sliceString(node.from, node.to));
  const src = match ? builder.resolveImage(match[2]) : null;

  if (match && src) {
    builder.replaceWith(node.from, node.to, {
      widget: new ImageWidget(src, match[1]),
    });
  } else {
    // Nothing to draw — a remote address, or a file that cannot be reached.
    // The source stays readable so the user can see why.
    builder.mark(node.from, node.to, "cm-link");
  }
  return true;
}

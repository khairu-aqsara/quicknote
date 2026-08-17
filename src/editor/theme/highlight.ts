/**
 * Highlighting for the body of a fenced code block.
 *
 * It deliberately names only tags that appear inside code. Markdown's own tags
 * — heading, strong, emphasis, link, and the mark tags — are left alone, so the
 * live-rendering layer stays the single authority on how prose looks.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeHighlight = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [
        tags.keyword,
        tags.controlKeyword,
        tags.moduleKeyword,
        tags.definitionKeyword,
        tags.operatorKeyword,
        tags.self,
      ],
      color: "var(--code-keyword)",
    },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
      color: "var(--code-comment)",
      fontStyle: "italic",
    },
    {
      tag: [tags.string, tags.special(tags.string), tags.regexp],
      color: "var(--code-string)",
    },
    {
      tag: [
        tags.number,
        tags.integer,
        tags.float,
        tags.bool,
        tags.atom,
        tags.null,
      ],
      color: "var(--code-number)",
    },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: "var(--code-function)",
    },
    {
      tag: [tags.typeName, tags.className, tags.namespace, tags.tagName],
      color: "var(--code-type)",
    },
    {
      tag: [tags.attributeName, tags.propertyName, tags.labelName],
      color: "var(--code-attribute)",
    },
    {
      tag: [tags.variableName, tags.definition(tags.variableName)],
      color: "var(--code-text)",
    },
    { tag: [tags.operator, tags.derefOperator], color: "var(--code-operator)" },
    {
      tag: [tags.punctuation, tags.separator, tags.bracket],
      color: "var(--code-punctuation)",
    },
    { tag: tags.meta, color: "var(--code-meta)" },
    { tag: tags.escape, color: "var(--code-number)" },
    {
      tag: tags.link,
      color: "var(--code-string)",
      textDecoration: "underline",
    },
    { tag: tags.invalid, color: "var(--status-error)" },
  ]),
);

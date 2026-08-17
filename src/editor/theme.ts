/**
 * The editor's look. PRD Section 20.
 *
 * Every colour is a CSS custom property defined in `styles.css`, so switching
 * theme means changing one attribute on <html>. The editor is never rebuilt.
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--font-size)",
    color: "var(--text)",
    backgroundColor: "var(--bg)",
  },

  "&.cm-focused": { outline: "none" },

  ".cm-scroller": {
    fontFamily: "var(--font-prose)",
    lineHeight: "var(--line-height)",
    overflowY: "auto",
    // No padding here. Every pixel of padding must belong to the content
    // element instead — see the note below.
    padding: "0",
  },

  /*
   * The text column is centred with padding, not with `max-width` and `auto`
   * margins.
   *
   * CodeMirror listens for mouse events on this element only. A narrow,
   * centred element leaves the margins and the space under the last line
   * belonging to the scroller, where a click places no cursor and a drag
   * starts no selection. Padding keeps the element full width, so every click
   * in the window lands on it, while the text still reads at one measure.
   */
  ".cm-content": {
    maxWidth: "none",
    margin: "0",
    padding:
      "64px max(24px, calc((100% - var(--measure)) / 2)) 45vh",
    caretColor: "var(--caret)",
    minHeight: "100%",
  },

  /*
   * Vertical space inside the editor is ALWAYS padding, never margin.
   *
   * CodeMirror builds its height map from each line element's measured height.
   * Margins are excluded from that measurement and collapse against their
   * neighbours, so the real layout drifts from the model and a click resolves
   * to the wrong line. Anything that adds vertical space below must use
   * padding.
   */
  ".cm-line": {
    padding: "0.12em 0",
    margin: "0",
  },

  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret)",
    borderLeftWidth: "2px",
  },

  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection)",
  },

  ".cm-gutters": { display: "none" },

  /* ---------------------------------------------------------- headings */

  ".cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6": {
    fontWeight: "700",
    lineHeight: "1.28",
    letterSpacing: "-0.011em",
    color: "var(--heading)",
  },
  ".cm-h1": { fontSize: "1.6em", paddingTop: "0.7em", paddingBottom: "0.2em" },
  ".cm-h2": { fontSize: "1.4em", paddingTop: "0.65em", paddingBottom: "0.18em" },
  ".cm-h3": { fontSize: "1.2em", paddingTop: "0.6em", paddingBottom: "0.16em" },
  ".cm-h4": { fontSize: "1.1em", paddingTop: "0.55em", paddingBottom: "0.15em" },
  ".cm-h5": { fontSize: "1em", paddingTop: "0.5em", paddingBottom: "0.15em" },
  ".cm-h6": {
    fontSize: "1em",
    paddingTop: "0.5em",
    paddingBottom: "0.15em",
    color: "var(--muted)",
  },

  /* ------------------------------------------------------------ inline */

  ".cm-strong": { fontWeight: "700", color: "var(--heading)" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strike": { textDecoration: "line-through", color: "var(--muted)" },

  ".cm-link": {
    color: "var(--accent)",
    textDecoration: "none",
    borderBottom: "1px solid var(--accent-faint)",
  },

  ".cm-inline-code": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    backgroundColor: "var(--code-bg)",
    borderRadius: "3px",
    padding: "0.12em 0.32em",
    color: "var(--code-text)",
  },

  /* Syntax marks, shown only while the cursor is on the line. */
  ".cm-mark": { color: "var(--mark)", fontWeight: "400" },
  ".cm-rule-source": { color: "var(--mark)" },

  /* --------------------------------------------------------------- lists */

  /*
   * A list line carries its indent as an inline style, because the depth is
   * known only from the syntax tree. See `live-render.ts`. The rules here
   * give the three markers one shared column width, so the text of every
   * item — bulleted, numbered, or a task — begins on the same vertical line.
   */
  ".cm-list-line": {
    paddingTop: "0.06em",
    paddingBottom: "0.06em",
  },

  /*
   * A list line hangs its first line with a negative `text-indent`, and
   * `text-indent` INHERITS. An inline-block is a block container, so each of
   * these widgets would apply that same negative indent a second time to its
   * own content and drag the marker a full column to the left of its box —
   * leaving a wide gap between the marker and the text. Every inline-block
   * inside a line resets it.
   */
  ".cm-bullet, .cm-list-number, .cm-task, .cm-rule, .cm-image": {
    textIndent: "0",
  },

  /*
   * The marker sits in the middle of its column rather than at the far edge,
   * so the space on the left of the dot and the space between the dot and the
   * text stay in proportion. The column width is NOT scaled down with a
   * smaller `font-size` here: `em` inside this element would then resolve
   * against that smaller size, and the column would no longer match the
   * indent step the line was given.
   */
  ".cm-bullet": {
    color: "var(--muted)",
    display: "inline-block",
    width: "var(--list-indent)",
    textAlign: "center",
  },

  ".cm-list-number": {
    color: "var(--muted-strong)",
    display: "inline-block",
    minWidth: "var(--list-indent)",
  },

  /* Centred in the same column, so a task item lines up with a bullet item. */
  ".cm-task": {
    display: "inline-block",
    width: "0.95em",
    height: "0.95em",
    marginLeft: "calc((var(--list-indent) - 0.95em) / 2)",
    marginRight: "calc((var(--list-indent) - 0.95em) / 2)",
    border: "1.5px solid var(--muted)",
    borderRadius: "3px",
    verticalAlign: "-0.12em",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  ".cm-task-done": {
    backgroundColor: "var(--accent)",
    borderColor: "var(--accent)",
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-6'/></svg>\")",
    backgroundSize: "100% 100%",
  },

  ".cm-rule": {
    display: "inline-block",
    width: "100%",
    borderTop: "1px solid var(--border)",
    verticalAlign: "middle",
  },

  ".cm-image": { display: "inline-block", maxWidth: "100%" },
  ".cm-image img": {
    maxWidth: "100%",
    borderRadius: "4px",
    display: "block",
  },
  ".cm-image-broken": {
    color: "var(--muted)",
    fontStyle: "italic",
    fontSize: "0.9em",
  },

  /* ------------------------------------------------------------- blocks */

  ".cm-code-line": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    backgroundColor: "var(--code-bg)",
    color: "var(--code-text)",
    margin: "0",
    padding: "0 12px",
  },
  /* The language name, sitting on the block's top edge. */
  ".cm-code-info": {
    fontFamily: "var(--font-ui)",
    fontSize: "0.72em",
    letterSpacing: "0.06em",
    color: "var(--muted)",
  },

  ".cm-code-open": {
    paddingTop: "10px",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },
  ".cm-code-close": {
    paddingBottom: "10px",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },

  ".cm-quote-line": {
    borderLeft: "3px solid var(--border-strong)",
    paddingLeft: "1em",
    color: "var(--muted-strong)",
    fontStyle: "italic",
    margin: "0",
  },

  /* ----------------------------------------------------------- callouts */

  ".cm-callout": {
    margin: "0",
    paddingLeft: "16px",
    paddingRight: "14px",
    borderLeft: "3px solid",
  },
  ".cm-callout-open": {
    paddingTop: "10px",
    borderTopRightRadius: "6px",
  },
  ".cm-callout-close": {
    paddingBottom: "10px",
    borderBottomRightRadius: "6px",
  },

  ".cm-callout-label": {
    fontFamily: "var(--font-ui)",
    fontSize: "0.66em",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  ".cm-callout-success": {
    borderLeftColor: "var(--callout-success)",
    backgroundColor: "var(--callout-success-bg)",
  },
  ".cm-callout-success .cm-callout-label": { color: "var(--callout-success)" },

  ".cm-callout-info": {
    borderLeftColor: "var(--callout-info)",
    backgroundColor: "var(--callout-info-bg)",
  },
  ".cm-callout-info .cm-callout-label": { color: "var(--callout-info)" },

  ".cm-callout-warning": {
    borderLeftColor: "var(--callout-warning)",
    backgroundColor: "var(--callout-warning-bg)",
  },
  ".cm-callout-warning .cm-callout-label": { color: "var(--callout-warning)" },

  ".cm-callout-danger": {
    borderLeftColor: "var(--callout-danger)",
    backgroundColor: "var(--callout-danger-bg)",
  },
  ".cm-callout-danger .cm-callout-label": { color: "var(--callout-danger)" },

  ".cm-callout-neutral": {
    borderLeftColor: "var(--callout-neutral)",
    backgroundColor: "var(--callout-neutral-bg)",
  },
  ".cm-callout-neutral .cm-callout-label": { color: "var(--callout-neutral)" },

  /* V1 paints tables as an aligned monospaced grid. PRD Section 9. */
  ".cm-table-line": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    backgroundColor: "var(--code-bg)",
    margin: "0",
    padding: "0 12px",
  },

  /* -------------------------------------------------------- find panel */

  ".cm-panels": {
    backgroundColor: "var(--panel-bg)",
    color: "var(--text)",
    border: "none",
    borderTop: "1px solid var(--border)",
    fontFamily: "var(--font-ui)",
  },
  ".cm-panel.cm-search": { padding: "8px 12px", fontSize: "13px" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": {
    fontFamily: "inherit",
    fontSize: "13px",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "3px 7px",
  },
  ".cm-panel.cm-search label": { color: "var(--muted)" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--search-active)" },

  /* ----------------------------------------------------- formatting bar */

  /*
   * The bar floats over the text, so it has to read as chrome rather than as
   * part of the note: the interface face, the panel colour, and a shadow deep
   * enough to lift it clear of the line underneath.
   */
  ".cm-tooltip.cm-format-bar": {
    display: "flex",
    alignItems: "center",
    gap: "1px",
    padding: "3px",
    fontFamily: "var(--font-ui)",
    backgroundColor: "var(--panel-bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "0 6px 20px rgb(0 0 0 / 18%)",
  },

  ".cm-format-bar button": {
    width: "28px",
    height: "26px",
    display: "grid",
    placeItems: "center",
    padding: "0",
    border: "none",
    borderRadius: "5px",
    background: "transparent",
    color: "var(--muted-strong)",
    fontFamily: "var(--font-ui)",
    fontSize: "13px",
    lineHeight: "1",
    cursor: "pointer",
  },

  ".cm-format-bar button:hover": {
    backgroundColor: "var(--bg)",
    color: "var(--text)",
  },

  /* The style is already on the selection. Pressing again takes it off. */
  ".cm-format-bar button.cm-format-on": {
    backgroundColor: "var(--bg)",
    color: "var(--accent)",
  },

  ".cm-format-bar button svg": { width: "15px", height: "15px" },

  /* Each glyph is set in the style it applies. */
  ".cm-format-bar .cm-format-bold": { fontWeight: "700" },
  ".cm-format-bar .cm-format-italic": {
    fontFamily: "var(--font-prose)",
    fontStyle: "italic",
    fontSize: "14px",
  },
  ".cm-format-bar .cm-format-strikethrough": { textDecoration: "line-through" },
  ".cm-format-bar .cm-format-code": {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
  },
});

/**
 * Highlighting for the body of a fenced code block.
 *
 * It deliberately names only tags that appear inside code. Markdown's own tags
 * — heading, strong, emphasis, link, and the mark tags — are left alone, so the
 * live-rendering layer stays the single authority on how prose looks.
 */
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
      tag: [tags.number, tags.integer, tags.float, tags.bool, tags.atom, tags.null],
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
    { tag: [tags.variableName, tags.definition(tags.variableName)], color: "var(--code-text)" },
    { tag: [tags.operator, tags.derefOperator], color: "var(--code-operator)" },
    { tag: [tags.punctuation, tags.separator, tags.bracket], color: "var(--code-punctuation)" },
    { tag: tags.meta, color: "var(--code-meta)" },
    { tag: tags.escape, color: "var(--code-number)" },
    { tag: tags.link, color: "var(--code-string)", textDecoration: "underline" },
    { tag: tags.invalid, color: "var(--status-error)" },
  ]),
);

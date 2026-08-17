/**
 * The prose itself: headings, inline styles, the syntax marks, and the three
 * list markers.
 *
 * The list rules give the three markers one shared column width, so the text of
 * every item — bulleted, numbered, or a task — begins on the same vertical line.
 */

export const prose = {
  /* ---------------------------------------------------------- headings */

  ".cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6": {
    fontWeight: "700",
    lineHeight: "1.28",
    letterSpacing: "-0.011em",
    color: "var(--heading)",
  },
  ".cm-h1": { fontSize: "1.6em", paddingTop: "0.7em", paddingBottom: "0.2em" },
  ".cm-h2": {
    fontSize: "1.4em",
    paddingTop: "0.65em",
    paddingBottom: "0.18em",
  },
  ".cm-h3": { fontSize: "1.2em", paddingTop: "0.6em", paddingBottom: "0.16em" },
  ".cm-h4": {
    fontSize: "1.1em",
    paddingTop: "0.55em",
    paddingBottom: "0.15em",
  },
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
   * known only from the syntax tree. See `render/builder.ts`.
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

  /* --------------------------------------------------- inline widgets */

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
};

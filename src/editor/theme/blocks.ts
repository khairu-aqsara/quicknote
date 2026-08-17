/**
 * Block constructs: fenced code, blockquotes, callouts, and tables.
 *
 * Each one is painted line by line, so the first and last lines carry the
 * rounded corners and the block reads as one shape.
 */

export const blocks = {
  /* -------------------------------------------------------------- code */

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

  /* ------------------------------------------------------------- quotes */

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

  /* -------------------------------------------------------------- tables */

  /* V1 paints tables as an aligned monospaced grid. PRD Section 9. */
  ".cm-table-line": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    backgroundColor: "var(--code-bg)",
    margin: "0",
    padding: "0 12px",
  },
};

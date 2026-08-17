/**
 * The two pieces of interface that float over the text: the find panel and the
 * formatting bar.
 *
 * Both have to read as chrome rather than as part of the note, so both use the
 * interface face and the panel colour rather than the prose face.
 */

export const chrome = {
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
   * The bar floats over the text, so it needs a shadow deep enough to lift it
   * clear of the line underneath.
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
};

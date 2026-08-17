/**
 * The editor surface itself: the scroller, the text column, the line box, the
 * caret, and the selection.
 *
 * Two rules here are load-bearing for where a click lands. Both are explained
 * where they apply.
 */

export const base = {
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
    padding: "64px max(24px, calc((100% - var(--measure)) / 2)) 45vh",
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

  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor: "var(--selection)",
    },

  ".cm-gutters": { display: "none" },
};

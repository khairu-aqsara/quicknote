/**
 * Callout blocks:
 *
 *     :::success
 *     this is content
 *     :::
 *
 * The `:::` directive syntax is not part of CommonMark, so the Markdown
 * grammar reports it as ordinary paragraph text. That is exactly what makes it
 * safe: another editor shows the lines literally and never rewrites them, and
 * the inline pass still renders bold, links, and code inside the block.
 *
 * Because the grammar does not know about callouts, every part of the editor
 * that has to reason about them — the renderer and the cursor commands alike —
 * reads them from here. One definition, one behaviour.
 */

import type { Text } from "@codemirror/state";

/** Five palettes. Every kind maps onto one of them. */
const CALLOUT_ALIAS: Record<string, string> = {
  success: "success",
  tip: "success",
  done: "success",
  info: "info",
  note: "info",
  important: "info",
  warning: "warning",
  caution: "warning",
  danger: "danger",
  error: "danger",
  bug: "danger",
  quote: "neutral",
  abstract: "neutral",
  example: "neutral",
};

export interface Callout {
  /** The palette: success, info, warning, danger, or neutral. */
  kind: string;
  /** What the user actually typed after `:::`. */
  label: string;
  /** Leading whitespace on the opening line. */
  indent: string;
  firstLine: number;
  lastLine: number;
  openFrom: number;
  openTo: number;
  /** Null when the user has not written the closing `:::` yet. */
  closeFrom: number | null;
  closeTo: number | null;
}

export const CALLOUT_OPEN_RE = /^(\s*):::[ \t]*([A-Za-z][A-Za-z0-9_-]*)[ \t]*$/;
const CALLOUT_CLOSE_RE = /^\s*:::[ \t]*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

export function findCallouts(state: { doc: Text }): Callout[] {
  const doc = state.doc;
  const found: Callout[] = [];
  let inFence = false;
  let open: {
    label: string;
    indent: string;
    from: number;
    to: number;
    line: number;
  } | null = null;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);

    // A `:::` inside a code block is code, not a callout.
    if (FENCE_RE.test(line.text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (open === null) {
      const match = CALLOUT_OPEN_RE.exec(line.text);
      if (match) {
        open = {
          indent: match[1],
          label: match[2],
          from: line.from,
          to: line.to,
          line: n,
        };
      }
      continue;
    }

    if (CALLOUT_CLOSE_RE.test(line.text)) {
      found.push(build(open, n, line.from, line.to));
      open = null;
    }
  }

  // A callout the user has not closed yet still styles what follows, so the
  // block is visible while it is being written.
  if (open !== null) {
    found.push(build(open, doc.lines, null, null));
  }

  return found;
}

/** The callout containing a line number, or null. */
export function calloutAtLine(
  state: { doc: Text },
  line: number,
): Callout | null {
  for (const callout of findCallouts(state)) {
    if (line >= callout.firstLine && line <= callout.lastLine) return callout;
  }
  return null;
}

function build(
  open: { label: string; indent: string; from: number; to: number; line: number },
  lastLine: number,
  closeFrom: number | null,
  closeTo: number | null,
): Callout {
  return {
    kind: CALLOUT_ALIAS[open.label.toLowerCase()] ?? "neutral",
    label: open.label,
    indent: open.indent,
    firstLine: open.line,
    lastLine,
    openFrom: open.from,
    openTo: open.to,
    closeFrom,
    closeTo,
  };
}

/**
 * Live rendering — the core of QuickNote.
 *
 * The document in the editor is always the raw Markdown source. This plugin
 * never edits it. It only paints over it:
 *
 *   - it styles each construct in place, and
 *   - it hides the construct's syntax marks when the cursor is elsewhere.
 *
 * Because the marks are hidden and not deleted, the buffer and the file on
 * disk always hold the full source. See PRD Section 10.
 *
 * Reveal rule (PRD Section 9):
 *   - inline constructs reveal by line
 *   - block constructs (fenced code, table, blockquote) reveal by block
 *   - only a plain cursor reveals; a selection leaves the text as it is
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { findCallouts } from "./callouts";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

/** Block constructs that reveal as a whole unit, not line by line. */
const BLOCK_REVEAL = new Set(["FencedCode", "CodeBlock", "Table", "Blockquote"]);

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

/**
 * How deeply a list item nests, counting from zero.
 *
 * The Markdown source carries the nesting as leading spaces, and a space in a
 * proportional serif is far too narrow to read as a level. The tree knows the
 * real structure, so the indent comes from here instead of from the text.
 */
function listDepth(node: SyntaxNode): number {
  let lists = 0;
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "BulletList" || n.name === "OrderedList") lists++;
  }
  return Math.max(0, lists - 1);
}

/* ------------------------------------------------------------------ widgets */

/**
 * The round bullet Typora paints in place of `-`, `*`, or `+`.
 *
 * It replaces the marker and the spaces after it, and fills the whole marker
 * column, so the item's text starts exactly where a wrapped line hangs back to.
 */
class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** A clickable checkbox for `- [ ]` and `- [x]`. */
class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = this.checked ? "cm-task cm-task-done" : "cm-task";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** A horizontal rule drawn in place of `---`. */
class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-rule";
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The kind label drawn in place of a callout's opening `:::success` line. */
class CalloutLabel extends WidgetType {
  constructor(private readonly kind: string) {
    super();
  }
  override eq(other: CalloutLabel): boolean {
    return other.kind === this.kind;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-callout-label";
    span.textContent = this.kind;
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** An inline image. Only local files load — see PRD Section 25. */
class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      wrap.classList.add("cm-image-broken");
      wrap.textContent = this.alt || "image not found";
    });
    wrap.appendChild(img);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/* -------------------------------------------------------------- image paths */

/**
 * Resolves an image reference to something the WebView can load.
 * Remote URLs return null, because QuickNote makes no network request.
 */
type ImageResolver = (url: string) => string | null;

let resolveImage: ImageResolver = () => null;

export function setImageResolver(resolver: ImageResolver): void {
  resolveImage = resolver;
}

/* ------------------------------------------------------------ reveal window */

/**
 * The set of line numbers that currently show their marks.
 *
 * Only a plain cursor reveals. A selection that spans text reveals nothing,
 * because revealing marks makes the text longer, and text that grows under a
 * dragging mouse makes a selection impossible to aim.
 */
function revealedLines(view: EditorView): Set<number> {
  const { state } = view;
  const lines = new Set<number>();
  const tree = syntaxTree(state);

  for (const range of state.selection.ranges) {
    if (!range.empty) continue;

    lines.add(state.doc.lineAt(range.head).number);

    // A cursor inside a block construct reveals the whole block.
    let node = tree.resolveInner(range.head, -1);
    while (node.parent) {
      if (BLOCK_REVEAL.has(node.name)) {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(node.to).number;
        for (let n = first; n <= last; n++) lines.add(n);
      }
      node = node.parent;
    }
  }

  return lines;
}

/* ---------------------------------------------------------------- the build */

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const revealed = revealedLines(view);
  const deco: Range<Decoration>[] = [];

  const isRevealed = (pos: number) => revealed.has(doc.lineAt(pos).number);

  /** Adds a CSS class to every line the range touches. */
  const lineClass = (from: number, to: number, cls: string) => {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      deco.push(Decoration.line({ class: cls }).range(line.from));
    }
  };

  /** Where the run of spaces after `to` ends, on the same line. */
  const afterSpaces = (to: number) => {
    const line = doc.lineAt(to);
    let end = to;
    while (end < line.to && doc.sliceString(end, end + 1) === " ") end++;
    return end;
  };

  /** Hides a range, plus any spaces that follow it on the same line. */
  const hideWithTrailingSpace = (from: number, to: number) => {
    const end = afterSpaces(to);
    if (end > from) deco.push(Decoration.replace({}).range(from, end));
  };

  const hide = (from: number, to: number) => {
    if (to > from) deco.push(Decoration.replace({}).range(from, to));
  };

  const mark = (from: number, to: number, cls: string) => {
    if (to > from) deco.push(Decoration.mark({ class: cls }).range(from, to));
  };

  /*
   * The nesting level of every line that belongs to a list item.
   *
   * A nested item sits inside its parent item, so one line can be claimed
   * twice. The deepest claim is the true one, and collecting the levels here
   * rather than painting them during the walk keeps that decision in one place.
   */
  const listLevels = new Map<number, number>();

  const claimListLines = (node: SyntaxNode) => {
    const depth = listDepth(node);
    const first = doc.lineAt(node.from).number;
    const last = doc.lineAt(node.to).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      // A block can end on the newline itself. That line is not part of it.
      if (n > first && line.from >= node.to) break;
      const known = listLevels.get(n);
      if (known === undefined || depth > known) listLevels.set(n, depth);
    }
  };

  for (const { from, to } of view.visibleRanges) {
    let skipTo = -1;

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef): boolean | void => {
        // Inside a range already replaced as a whole. Do not descend.
        if (node.from < skipTo) return false;

        const name = node.name;
        const open = isRevealed(node.from);

        /* ---- block containers: line styling ---- */

        const headingClass = HEADING_LINE_CLASS[name];
        if (headingClass) {
          lineClass(node.from, node.to, headingClass);
          return;
        }

        switch (name) {
          case "FencedCode":
          case "CodeBlock": {
            lineClass(node.from, node.to, "cm-code-line");
            const first = doc.lineAt(node.from);
            const last = doc.lineAt(node.to);
            deco.push(
              Decoration.line({ class: "cm-code-open" }).range(first.from),
            );
            if (last.number !== first.number) {
              deco.push(
                Decoration.line({ class: "cm-code-close" }).range(last.from),
              );
            }
            return;
          }

          case "ListItem":
            claimListLines(node.node);
            return;

          case "Blockquote":
            lineClass(node.from, node.to, "cm-quote-line");
            return;

          case "Table":
            lineClass(node.from, node.to, "cm-table-line");
            return;

          case "HorizontalRule":
            if (!open) {
              deco.push(
                Decoration.replace({ widget: new RuleWidget() }).range(
                  node.from,
                  node.to,
                ),
              );
              skipTo = node.to;
            } else {
              mark(node.from, node.to, "cm-rule-source");
            }
            return;
        }

        /* ---- inline constructs ---- */

        switch (name) {
          case "StrongEmphasis":
            mark(node.from, node.to, "cm-strong");
            return;

          case "Emphasis":
            mark(node.from, node.to, "cm-em");
            return;

          case "Strikethrough":
            mark(node.from, node.to, "cm-strike");
            return;

          case "InlineCode":
            mark(node.from, node.to, "cm-inline-code");
            return;

          case "Link":
            mark(node.from, node.to, "cm-link");
            return;

          case "Image": {
            if (open) {
              mark(node.from, node.to, "cm-link");
              return;
            }
            const text = doc.sliceString(node.from, node.to);
            const match = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(text);
            const src = match ? resolveImage(match[2]) : null;
            if (src) {
              deco.push(
                Decoration.replace({
                  widget: new ImageWidget(src, match![1]),
                }).range(node.from, node.to),
              );
              skipTo = node.to;
            } else {
              mark(node.from, node.to, "cm-link");
            }
            return;
          }
        }

        /* ---- marks: hidden unless their line is revealed ---- */

        if (open) {
          // Keep the marks visible, but dim them so the text still leads.
          switch (name) {
            case "HeaderMark":
            case "EmphasisMark":
            case "StrikethroughMark":
            case "CodeMark":
            case "QuoteMark":
            case "LinkMark":
            case "ListMark":
            case "CodeInfo":
            case "URL":
            case "LinkTitle":
              mark(node.from, node.to, "cm-mark");
              return;
          }
          return;
        }

        switch (name) {
          case "HeaderMark":
          case "QuoteMark":
            hideWithTrailingSpace(node.from, node.to);
            return;

          case "EmphasisMark":
          case "StrikethroughMark":
          case "CodeMark":
          case "LinkMark":
          case "URL":
          case "LinkTitle":
            hide(node.from, node.to);
            return;

          // The info string stays visible as a small label on the block's top
          // edge. It is what selects the highlighting, so hiding it would hide
          // the only clue about why a block is or is not coloured.
          case "CodeInfo":
            mark(node.from, node.to, "cm-code-info");
            return;

          case "TaskMarker": {
            const checked = /[xX]/.test(doc.sliceString(node.from, node.to));
            // The box takes the spaces after it, so a task item's marker
            // column is exactly as wide as a bullet item's.
            const end = afterSpaces(node.to);
            deco.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked, node.from, node.to),
              }).range(node.from, end),
            );
            skipTo = end;
            return;
          }

          case "ListMark": {
            const bullet = /^[-*+]$/.test(doc.sliceString(node.from, node.to));
            const rest = doc.sliceString(
              node.to,
              Math.min(node.to + 6, doc.lineAt(node.to).to),
            );
            const isTask = /^\s*\[[ xX]\]/.test(rest);
            const end = afterSpaces(node.to);

            if (isTask) {
              // The checkbox stands in for the whole marker.
              hideWithTrailingSpace(node.from, node.to);
            } else if (bullet) {
              // The widget takes the spaces as well, so it can own the column.
              deco.push(
                Decoration.replace({ widget: new BulletWidget() }).range(
                  node.from,
                  end,
                ),
              );
              skipTo = end;
            } else {
              // `1.` keeps its digits — they carry meaning. The class holds it
              // to the column width so the text still starts where it should.
              mark(node.from, end, "cm-list-number");
            }
            return;
          }

          case "TableDelimiter":
            mark(node.from, node.to, "cm-mark");
            return;
        }
      },
    });
  }

  /* --------------------------------------------------------------- lists */

  /*
   * Indent each list line, and hang it.
   *
   * `padding-left` sets where the item's text sits. `text-indent` pulls the
   * FIRST line of the item back by one column, which is where the marker goes.
   * A line that wraps therefore starts under the text of its own item, not
   * under the bullet — the way a list reads on paper.
   *
   * The leading spaces of the source still render, so every level gains the
   * same small extra offset. The step stays even, which is what the eye reads.
   */
  for (const [line, depth] of listLevels) {
    deco.push(
      Decoration.line({
        class: "cm-list-line",
        attributes: {
          style:
            `padding-left:calc(var(--list-indent) * ${depth + 1});` +
            `text-indent:calc(var(--list-indent) * -1)`,
        },
      }).range(doc.line(line).from),
    );
  }

  /* ------------------------------------------------------------ callouts */

  // Only decorate the lines the viewport actually shows.
  const firstVisible = doc.lineAt(view.visibleRanges[0]?.from ?? 0).number;
  const lastVisible = doc.lineAt(
    view.visibleRanges[view.visibleRanges.length - 1]?.to ?? doc.length,
  ).number;

  for (const callout of findCallouts(state)) {
    if (callout.lastLine < firstVisible || callout.firstLine > lastVisible) {
      continue;
    }

    const from = Math.max(callout.firstLine, firstVisible);
    const to = Math.min(callout.lastLine, lastVisible);

    for (let n = from; n <= to; n++) {
      deco.push(
        Decoration.line({
          class: `cm-callout cm-callout-${callout.kind}`,
        }).range(doc.line(n).from),
      );
    }

    if (callout.firstLine >= firstVisible) {
      deco.push(
        Decoration.line({ class: "cm-callout-open" }).range(
          doc.line(callout.firstLine).from,
        ),
      );
      if (!revealed.has(callout.firstLine) && callout.openTo > callout.openFrom) {
        deco.push(
          Decoration.replace({
            widget: new CalloutLabel(callout.label),
          }).range(callout.openFrom, callout.openTo),
        );
      }
    }

    if (callout.closeFrom !== null && callout.lastLine <= lastVisible) {
      deco.push(
        Decoration.line({ class: "cm-callout-close" }).range(
          doc.line(callout.lastLine).from,
        ),
      );
      if (!revealed.has(callout.lastLine) && callout.closeTo! > callout.closeFrom) {
        deco.push(
          Decoration.replace({}).range(callout.closeFrom, callout.closeTo!),
        );
      }
    }
  }

  return Decoration.set(deco, true);
}

/* --------------------------------------------------------------- the plugin */

export const liveRender = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

/*
 * A note on cursor safety.
 *
 * The plugin never needs `EditorView.atomicRanges`. A mark is hidden only when
 * its line is outside the reveal window, and the cursor's own line is always
 * inside that window. The cursor therefore can never sit inside hidden text,
 * so one arrow key press always moves one visible position.
 */

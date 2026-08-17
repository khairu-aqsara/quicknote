/**
 * The decoration set under construction.
 *
 * Every rendering pass writes through this object rather than through closures
 * over a shared array. That is what lets the passes live in separate files: the
 * two pieces of state they all depend on — the growing decoration list and the
 * `skipTo` cursor that suppresses nodes inside an already-replaced range — have
 * one owner instead of being captured variables.
 */

import { Decoration, type DecorationSet } from "@codemirror/view";
import type { EditorState, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

import { imageResolver } from "./images";
import { listDepth } from "./reveal";

export class DecorationBuilder {
  readonly doc: Text;

  private readonly deco: Range<Decoration>[] = [];

  /**
   * The nesting level of every line that belongs to a list item.
   *
   * A nested item sits inside its parent item, so one line can be claimed
   * twice. The deepest claim is the true one, and collecting the levels here
   * rather than painting them during the walk keeps that decision in one place.
   */
  private readonly listLevels = new Map<number, number>();

  /** The end of a range already replaced whole. Nothing inside it is drawn. */
  private skipTo = -1;

  constructor(
    readonly state: EditorState,
    private readonly revealed: Set<number>,
  ) {
    this.doc = state.doc;
  }

  /* ------------------------------------------------------------- reveal */

  isRevealed(pos: number): boolean {
    return this.revealed.has(this.doc.lineAt(pos).number);
  }

  isRevealedLine(line: number): boolean {
    return this.revealed.has(line);
  }

  /* --------------------------------------------------------- the skip cursor */

  /** Each visible range is walked on its own, so the cursor starts over. */
  beginRange(): void {
    this.skipTo = -1;
  }

  /** True when this node sits inside a range that was already replaced. */
  shouldSkip(from: number): boolean {
    return from < this.skipTo;
  }

  /* -------------------------------------------------------------- writing */

  hide(from: number, to: number): void {
    if (to > from) this.deco.push(Decoration.replace({}).range(from, to));
  }

  mark(from: number, to: number, cls: string): void {
    if (to > from) {
      this.deco.push(Decoration.mark({ class: cls }).range(from, to));
    }
  }

  /** Adds a CSS class to every line the range touches. */
  lineClass(from: number, to: number, cls: string): void {
    const first = this.doc.lineAt(from).number;
    const last = this.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      this.lineAt(n, cls);
    }
  }

  /** Adds a CSS class to one line, by number. */
  lineAt(line: number, cls: string): void {
    this.deco.push(
      Decoration.line({ class: cls }).range(this.doc.line(line).from),
    );
  }

  /** Where the run of spaces after `to` ends, on the same line. */
  afterSpaces(to: number): number {
    const line = this.doc.lineAt(to);
    let end = to;
    while (end < line.to && this.doc.sliceString(end, end + 1) === " ") end++;
    return end;
  }

  /** Hides a range, plus any spaces that follow it on the same line. */
  hideWithTrailingSpace(from: number, to: number): void {
    this.hide(from, this.afterSpaces(to));
  }

  /** Draws something in place of a range. */
  replaceOnly(
    from: number,
    to: number,
    spec: Parameters<typeof Decoration.replace>[0],
  ): void {
    this.deco.push(Decoration.replace(spec).range(from, to));
  }

  /**
   * Draws something in place of a range, and stops every node inside it from
   * being drawn as well. Use this during the tree walk; `replaceOnly` after it.
   */
  replaceWith(
    from: number,
    to: number,
    spec: Parameters<typeof Decoration.replace>[0],
  ): void {
    this.replaceOnly(from, to, spec);
    this.skipTo = to;
  }

  /* ---------------------------------------------------------------- lists */

  claimListLines(node: SyntaxNode): void {
    const depth = listDepth(node);
    const first = this.doc.lineAt(node.from).number;
    const last = this.doc.lineAt(node.to).number;

    for (let n = first; n <= last; n++) {
      // A block can end on the newline itself. That line is not part of it.
      if (n > first && this.doc.line(n).from >= node.to) break;
      const known = this.listLevels.get(n);
      if (known === undefined || depth > known) this.listLevels.set(n, depth);
    }
  }

  /* --------------------------------------------------------------- images */

  resolveImage(url: string): string | null {
    return this.state.facet(imageResolver)(url);
  }

  /* ------------------------------------------------------------- finishing */

  /**
   * Indents each list line, and hangs it.
   *
   * `padding-left` sets where the item's text sits. `text-indent` pulls the
   * FIRST line of the item back by one column, which is where the marker goes.
   * A line that wraps therefore starts under the text of its own item, not
   * under the bullet — the way a list reads on paper.
   *
   * The leading spaces of the source still render, so every level gains the
   * same small extra offset. The step stays even, which is what the eye reads.
   */
  private finishLists(): void {
    for (const [line, depth] of this.listLevels) {
      this.deco.push(
        Decoration.line({
          class: "cm-list-line",
          attributes: {
            style:
              `padding-left:calc(var(--list-indent) * ${depth + 1});` +
              `text-indent:calc(var(--list-indent) * -1)`,
          },
        }).range(this.doc.line(line).from),
      );
    }
  }

  finish(): DecorationSet {
    this.finishLists();
    return Decoration.set(this.deco, true);
  }
}

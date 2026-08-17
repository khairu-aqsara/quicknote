/**
 * The reveal window. PRD Section 9.
 *
 * This decides what the user sees change as the cursor moves, so the rules are
 * worth pinning down: a plain cursor reveals, a selection does not, and a
 * cursor inside a block construct reveals the whole block rather than one line.
 */

import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { listDepth, revealedLines } from "./reveal";

/** The cursor or selection is marked by « and an optional ». */
function make(marked: string): EditorState {
  const anchor = marked.indexOf("«");
  const rest = marked.replace("«", "");
  const closing = rest.indexOf("»");

  return EditorState.create({
    doc: rest.replace("»", ""),
    selection: { anchor, head: closing < 0 ? anchor : closing },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

function revealed(marked: string): number[] {
  return [...revealedLines(make(marked))].sort((a, b) => a - b);
}

describe("revealedLines", () => {
  it("reveals the line the cursor sits on", () => {
    expect(revealed("# One\n\nsome **bold**« text\n\nlast")).toEqual([3]);
  });

  /**
   * Revealing marks makes the text longer, and text that grows under a
   * dragging mouse makes a selection impossible to aim.
   */
  it("reveals nothing while a selection spans text", () => {
    expect(revealed("# One\n\nsome «bold» text")).toEqual([]);
  });

  it("reveals a whole fenced code block from anywhere inside it", () => {
    expect(
      revealed("intro\n\n```js\nconst a = 1;«\nmore\n```\n\nafter"),
    ).toEqual([3, 4, 5, 6]);
  });

  it("reveals a whole blockquote", () => {
    expect(revealed("intro\n\n> one\n> two«\n> three\n\nafter")).toEqual([
      3, 4, 5,
    ]);
  });

  it("reveals a whole table", () => {
    expect(revealed("| a | b |\n|---|---|\n| 1« | 2 |\n\nafter")).toEqual([
      1, 2, 3,
    ]);
  });

  it("reveals every cursor's line when there are several", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree\nfour",
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(9),
      ]),
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorState.allowMultipleSelections.of(true),
      ],
    });

    expect([...revealedLines(state)].sort((a, b) => a - b)).toEqual([1, 3]);
  });
});

describe("listDepth", () => {
  /** The indent comes from the tree, not from the leading spaces. */
  function depthAt(doc: string, pos: number): number {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
    });

    let node = syntaxTree(state).resolveInner(pos, 1);
    while (node.parent && node.name !== "ListItem") node = node.parent;
    return listDepth(node);
  }

  it("counts a top-level item as depth zero", () => {
    expect(depthAt("- one\n- two\n", 2)).toBe(0);
  });

  it("counts each nesting level", () => {
    const doc = "- one\n  - two\n    - three\n";
    expect(depthAt(doc, doc.indexOf("two"))).toBe(1);
    expect(depthAt(doc, doc.indexOf("three"))).toBe(2);
  });
});

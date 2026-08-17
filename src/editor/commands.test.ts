/**
 * `planBlockExit`.
 *
 * Each case builds a real editor state with the real Markdown grammar, applies
 * the plan, and then asks the grammar again whether the cursor ended up outside
 * the block. That last question is the one that matters — an earlier version of
 * this command inserted a line that landed back inside an open fence.
 */

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { planBlockExit } from "./commands";
import { calloutAtLine } from "./callouts";

const BLOCKS = new Set(["FencedCode", "CodeBlock", "Table", "Blockquote"]);

/**
 * The cursor marker. Markdown tables are built from `|`, so a pipe cannot mark
 * a position inside one — `indexOf` finds the table's own first pipe and the
 * case silently tests a different document.
 */
const CURSOR = "‸";

/** Nested constructs may need more than one press, but the count is bounded. */
const LIMIT = 4;

function make(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
}

/**
 * The oracle. It has to cover both worlds: constructs the grammar knows, and
 * callouts, which the grammar deliberately does not know.
 */
function insideBlock(state: EditorState, pos: number): boolean {
  if (calloutAtLine(state, state.doc.lineAt(pos).number)) return true;

  for (const side of [-1, 1] as const) {
    let node = syntaxTree(state).resolveInner(pos, side);
    while (node.parent) {
      if (BLOCKS.has(node.name)) return true;
      node = node.parent;
    }
  }
  return false;
}

/** Presses the command until the cursor reaches open ground. */
function escape(marked: string): number {
  const pos = marked.indexOf(CURSOR);
  expect(pos, `the case has no ${CURSOR} cursor marker`).toBeGreaterThanOrEqual(
    0,
  );

  let state = make(marked.replace(CURSOR, ""));

  // A case that starts outside a block tests nothing. Counting that as a
  // failure is the point: a case that quietly tests nothing is worse than one
  // that fails.
  expect(
    insideBlock(state, pos),
    "the cursor was not in a block to begin with",
  ).toBe(true);

  let cursor = pos;
  let presses = 0;

  while (insideBlock(state, cursor)) {
    expect(presses, "the cursor never reached open ground").toBeLessThan(LIMIT);

    const plan = planBlockExit(state, cursor);
    expect(
      plan,
      "the command declined while the cursor was still trapped",
    ).not.toBeNull();

    if (plan!.insert) {
      state = state.update({
        changes: { from: plan!.insert.from, insert: plan!.insert.text },
      }).state;
    }
    cursor = plan!.anchor;
    presses++;
  }

  return presses;
}

describe("planBlockExit — fenced code", () => {
  it("leaves an open fence from the opening line", () => {
    escape("# Note\n\n```‸");
  });

  it("leaves an open fence that holds code", () => {
    escape("# Note\n\n```js\nconst a = 1;‸");
  });

  it("leaves an open fence with a trailing blank line", () => {
    escape("# Note\n\n```js\nconst a = 1;\n‸");
  });

  it("leaves a closed fence from inside", () => {
    escape("# Note\n\n```js\nconst a = 1;‸\n```\n");
  });

  it("leaves a closed fence at the end of the document", () => {
    escape("```js\nconst a = 1;‸\n```");
  });
});

describe("planBlockExit — quotes and tables", () => {
  it("leaves a blockquote", () => {
    escape("> quoted line‸");
  });

  it("leaves a blockquote mid document", () => {
    escape("> quoted line‸\n\nafter\n");
  });

  it("leaves a table", () => {
    escape("| a | b |\n|---|---|\n| 1 | 2 |‸");
  });

  it("leaves a table from the last cell", () => {
    escape("| a | b |\n|---|---|\n| 1 | 2‸ |\n");
  });
});

describe("planBlockExit — callouts", () => {
  it("leaves an open callout from the opening line", () => {
    escape(":::success‸");
  });

  it("leaves an open callout that holds content", () => {
    escape("# Note\n\n:::success\nthis is content‸");
  });

  it("leaves an open callout with a trailing blank line", () => {
    escape(":::warning\nstill writing\n‸");
  });

  it("leaves a closed callout from inside", () => {
    escape(":::info\nthis is content‸\n:::\n");
  });

  it("leaves a closed callout at the end of the document", () => {
    escape("intro\n\n:::danger\ncareful‸\n:::");
  });

  it("leaves an indented callout", () => {
    escape("  :::success\n  content‸\n  :::");
  });
});

describe("planBlockExit — nesting", () => {
  it("leaves a code block inside a callout before the callout itself", () => {
    // The inner block goes first, so one press never jumps past both.
    expect(escape(":::info\n```js\nconst a = 1;‸\n```\n:::")).toBeGreaterThan(
      1,
    );
  });

  it("leaves a code block inside a blockquote first", () => {
    escape("> intro\n>\n> ```js\n> const a = 1;‸\n> ```\n");
  });
});

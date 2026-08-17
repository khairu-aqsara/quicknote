/**
 * A headless check for `planBlockExit`. Run it with `npm run check:exit`.
 *
 * It builds a real editor state with the real Markdown grammar, applies the
 * plan, and then asks the grammar again whether the cursor ended up outside
 * the block. That last question is the one that matters — an earlier version
 * of this command inserted a line that landed back inside an open fence.
 */

import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { planBlockExit } from "./commands";
import { calloutAtLine } from "./callouts";

const BLOCKS = new Set(["FencedCode", "CodeBlock", "Table", "Blockquote"]);

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

interface Case {
  name: string;
  doc: string;
  /** Cursor position, marked by `|` in the document. */
}

const CASES: Case[] = [
  { name: "open fence, cursor on the opening line", doc: "# Note\n\n```|" },
  { name: "open fence with code", doc: "# Note\n\n```js\nconst a = 1;|" },
  {
    name: "open fence, trailing blank line",
    doc: "# Note\n\n```js\nconst a = 1;\n|",
  },
  {
    name: "closed fence, cursor inside",
    doc: "# Note\n\n```js\nconst a = 1;|\n```\n",
  },
  {
    name: "closed fence at end of document",
    doc: "```js\nconst a = 1;|\n```",
  },
  { name: "blockquote", doc: "> quoted line|" },
  { name: "blockquote mid document", doc: "> quoted line|\n\nafter\n" },
  {
    name: "table",
    doc: "| a | b |\n|---|---|\n| 1 | 2 ||",
  },
  { name: "open callout, cursor on the opening line", doc: ":::success|" },
  {
    name: "open callout with content",
    doc: "# Note\n\n:::success\nthis is content|",
  },
  {
    name: "open callout, trailing blank line",
    doc: ":::warning\nstill writing\n|",
  },
  {
    name: "closed callout, cursor inside",
    doc: ":::info\nthis is content|\n:::\n",
  },
  {
    name: "closed callout at end of document",
    doc: "intro\n\n:::danger\ncareful|\n:::",
  },
  {
    name: "indented callout",
    doc: "  :::success\n  content|\n  :::",
  },
  {
    name: "code block inside a callout leaves the code block first",
    doc: ":::info\n```js\nconst a = 1;|\n```\n:::",
  },
];

let failures = 0;

for (const testCase of CASES) {
  const pos = testCase.doc.indexOf("|");
  const doc = testCase.doc.replace("|", "");
  const state = make(doc);

  if (!insideBlock(state, pos)) {
    console.log(`SKIP  ${testCase.name} — cursor was not in a block to begin with`);
    continue;
  }

  // The property that matters: repeated presses always reach open ground.
  // Nested constructs may need more than one, but the count must be bounded.
  const LIMIT = 4;
  let current = state;
  let cursor = pos;
  let presses = 0;
  let stuck = false;

  while (insideBlock(current, cursor)) {
    if (presses >= LIMIT) {
      stuck = true;
      break;
    }
    const plan = planBlockExit(current, cursor);
    if (!plan) {
      stuck = true;
      break;
    }
    if (plan.insert) {
      current = current.update({
        changes: { from: plan.insert.from, insert: plan.insert.text },
      }).state;
    }
    cursor = plan.anchor;
    presses++;
  }

  if (stuck) failures++;

  const text = current.doc.toString();
  const rendered = `${text.slice(0, cursor)}‸${text.slice(cursor)}`.replace(
    /\n/g,
    "\\n",
  );

  console.log(
    `${stuck ? "FAIL" : "ok  "}  ${testCase.name} (${presses} press${
      presses === 1 ? "" : "es"
    })\n        ${rendered}`,
  );
}

console.log(
  failures === 0
    ? "\nEvery cursor reached open ground within 4 presses."
    : `\n${failures} case(s) left the cursor trapped.`,
);

if (failures > 0) process.exit(1);

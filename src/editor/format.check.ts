/**
 * A headless check for `planFormat`. Run it with `npm run check:format`.
 *
 * It builds a real editor state with the real Markdown grammar, applies the
 * plan, and then asks three questions of the result:
 *
 *   - is the source what the user asked for,
 *   - does the selection still hold the same text, and
 *   - does applying the same plan again give the document back.
 *
 * The last one is the property that matters. A toggle that cannot find the
 * construct it just wrote would stack marks on every press.
 */

import { EditorState, type SelectionRange } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  BOLD,
  CODE,
  ITALIC,
  STRIKETHROUGH,
  planFormat,
  planLink,
  type FormatPlan,
} from "./format";

/** One command's plan, ready to run against any state. */
type Plan = (state: EditorState, range: SelectionRange) => FormatPlan;

const bold: Plan = (state, range) => planFormat(state, range, BOLD);
const italic: Plan = (state, range) => planFormat(state, range, ITALIC);
const strikethrough: Plan = (state, range) =>
  planFormat(state, range, STRIKETHROUGH);
const code: Plan = (state, range) => planFormat(state, range, CODE);
const link: Plan = planLink;

function make(doc: string, anchor: number, head: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

/** Applies one plan and returns the state that follows it. */
function apply(state: EditorState, plan: Plan): EditorState {
  const { changes, anchor, head } = plan(state, state.selection.main);
  return state.update({ changes, selection: { anchor, head } }).state;
}

interface Case {
  name: string;
  plan: Plan;
  /** The selection is marked by « and ». No marks means an empty cursor at «. */
  doc: string;
  want: string;
  /**
   * The text the selection holds afterwards. It defaults to the text it held
   * before, because a style must never move the selection off its own words.
   * A selection that took in the marks themselves loses them, and says so.
   */
  keeps?: string;
  /** Off where the construct is empty, and so is not a construct at all. */
  roundTrip?: boolean;
}

const CASES: Case[] = [
  {
    name: "bold wraps a word",
    plan: bold,
    doc: "one «two» three",
    want: "one **two** three",
  },
  {
    name: "bold clears the text inside its own marks",
    plan: bold,
    doc: "one **«two»** three",
    want: "one two three",
  },
  {
    name: "bold clears a selection that holds the marks too",
    plan: bold,
    doc: "one «**two**» three",
    want: "one two three",
    keeps: "two",
  },
  {
    name: "italic wraps a word",
    plan: italic,
    doc: "one «two» three",
    want: "one *two* three",
  },
  {
    name: "italic nests inside bold",
    plan: italic,
    doc: "one **«two»** three",
    want: "one ***two*** three",
  },
  {
    name: "strikethrough wraps a word",
    plan: strikethrough,
    doc: "one «two» three",
    want: "one ~~two~~ three",
  },
  {
    name: "inline code wraps a word",
    plan: code,
    doc: "run «npm test» now",
    want: "run `npm test` now",
  },
  {
    name: "inline code grows its fence past the backticks inside",
    plan: code,
    doc: "write «a ` tick» here",
    want: "write ``a ` tick`` here",
  },
  {
    name: "bold wraps a selection that spans a whole line",
    plan: bold,
    doc: "«a whole line»",
    want: "**a whole line**",
  },
  {
    name: "bold at an empty cursor opens the marks and waits inside",
    plan: bold,
    doc: "one «two",
    want: "one ****two",
    roundTrip: false,
  },
  {
    name: "a link takes the selection as its text",
    plan: link,
    doc: "see «the docs» now",
    want: "see [the docs]() now",
    keeps: "",
    roundTrip: false,
  },
  {
    name: "a link takes an address as its target",
    plan: link,
    doc: "see «https://example.com» now",
    want: "see [](https://example.com) now",
    keeps: "",
    roundTrip: false,
  },
  {
    name: "the same command takes a link off again",
    plan: link,
    doc: "see [«the docs»](https://example.com) now",
    want: "see the docs now",
    // The target is gone with the link, so the second press cannot write the
    // same line again. Only the text comes back.
    roundTrip: false,
  },
];

function parse(marked: string): { doc: string; from: number; to: number } {
  const from = marked.indexOf("«");
  const rest = marked.replace("«", "");
  const closing = rest.indexOf("»");
  return {
    doc: rest.replace("»", ""),
    from,
    to: closing < 0 ? from : closing,
  };
}

let failures = 0;

for (const testCase of CASES) {
  const { doc, from, to } = parse(testCase.doc);
  const before = make(doc, from, to);
  const keeps = testCase.keeps ?? doc.slice(from, to);

  const after = apply(before, testCase.plan);
  const text = after.doc.toString();
  const range = after.selection.main;
  const problems: string[] = [];

  if (text !== testCase.want) {
    problems.push(`wrote  ${text}\n        wanted ${testCase.want}`);
  }

  if (after.sliceDoc(range.from, range.to) !== keeps) {
    problems.push(
      `the selection moved: it now holds "${after.sliceDoc(
        range.from,
        range.to,
      )}" instead of "${keeps}"`,
    );
  }

  if (testCase.roundTrip !== false) {
    const back = apply(after, testCase.plan).doc.toString();
    if (back !== doc) {
      problems.push(`pressing again gave ${back}, not ${doc}`);
    }
  }

  if (problems.length > 0) failures++;

  const marked = `${text.slice(0, range.from)}«${text.slice(
    range.from,
    range.to,
  )}»${text.slice(range.to)}`;

  console.log(
    `${problems.length > 0 ? "FAIL" : "ok  "}  ${testCase.name}\n        ${marked}`,
  );
  for (const problem of problems) console.log(`        ${problem}`);
}

console.log(
  failures === 0
    ? "\nEvery style applied, cleared, and kept its selection."
    : `\n${failures} case(s) failed.`,
);

if (failures > 0) process.exit(1);

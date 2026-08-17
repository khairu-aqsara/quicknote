/**
 * `planFormat` and `planLink`.
 *
 * Each case builds a real editor state with the real Markdown grammar, applies
 * the plan, and then asks three questions of the result:
 *
 *   - is the source what the user asked for,
 *   - does the selection still hold the same text, and
 *   - does applying the same plan again give the document back.
 *
 * The last one is the property that matters. A toggle that cannot find the
 * construct it just wrote would stack marks on every press.
 */

import { describe, expect, it } from "vitest";
import { EditorState, type SelectionRange } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  BOLD,
  CODE,
  isStyled,
  ITALIC,
  STRIKETHROUGH,
  planFormat,
  planLink,
  type FormatPlan,
  type InlineStyle,
} from "./format";

/** One command's plan, ready to run against any state. */
type Plan = (state: EditorState, range: SelectionRange) => FormatPlan;

const bold: Plan = (state, range) => planFormat(state, range, BOLD);
const italic: Plan = (state, range) => planFormat(state, range, ITALIC);
const strikethrough: Plan = (state, range) =>
  planFormat(state, range, STRIKETHROUGH);
const code: Plan = (state, range) => planFormat(state, range, CODE);
const link: Plan = planLink;

/** The selection is marked by « and ». No closing mark means an empty cursor. */
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

interface Options {
  /**
   * The text the selection holds afterwards. It defaults to the text it held
   * before, because a style must never move the selection off its own words.
   * A selection that took in the marks themselves loses them, and says so.
   */
  keeps?: string;
  /** Off where the construct is empty, and so is not a construct at all. */
  roundTrip?: boolean;
}

function check(
  plan: Plan,
  marked: string,
  want: string,
  options: Options = {},
) {
  const { doc, from, to } = parse(marked);
  const before = make(doc, from, to);
  const keeps = options.keeps ?? doc.slice(from, to);

  const after = apply(before, plan);
  const range = after.selection.main;

  expect(after.doc.toString()).toBe(want);
  expect(after.sliceDoc(range.from, range.to)).toBe(keeps);

  if (options.roundTrip !== false) {
    expect(apply(after, plan).doc.toString()).toBe(doc);
  }
}

describe("planFormat", () => {
  it("wraps a word in bold", () => {
    check(bold, "one «two» three", "one **two** three");
  });

  it("clears bold from the text inside its own marks", () => {
    check(bold, "one **«two»** three", "one two three");
  });

  it("clears bold from a selection that holds the marks too", () => {
    check(bold, "one «**two**» three", "one two three", { keeps: "two" });
  });

  it("wraps a word in italic", () => {
    check(italic, "one «two» three", "one *two* three");
  });

  it("nests italic inside bold", () => {
    check(italic, "one **«two»** three", "one ***two*** three");
  });

  it("wraps a word in strikethrough", () => {
    check(strikethrough, "one «two» three", "one ~~two~~ three");
  });

  it("wraps a word in inline code", () => {
    check(code, "run «npm test» now", "run `npm test` now");
  });

  it("grows the code fence past the backticks inside", () => {
    check(code, "write «a ` tick» here", "write ``a ` tick`` here");
  });

  it("wraps a selection that spans a whole line", () => {
    check(bold, "«a whole line»", "**a whole line**");
  });

  it("opens the marks and waits inside at an empty cursor", () => {
    check(bold, "one «two", "one ****two", { roundTrip: false });
  });
});

/**
 * Whitespace inside the selection. PRD Sections 10 and 17.
 *
 * A drag that takes in the space before a word is completely ordinary, and
 * wrapping the selection as it stands writes `~~ struck~~`. GFM will not open
 * a construct on a space, so the grammar builds no node and nothing paints —
 * the marks appear in the text and the style silently never arrives.
 *
 * Every case here asks the grammar the question that matters: did the
 * construct actually parse?
 */
describe("planFormat — whitespace at the edges", () => {
  /** True when the document really holds this construct. */
  function parses(doc: string, node: string): boolean {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
    });
    let found = false;
    syntaxTree(state).iterate({
      enter: (n) => {
        if (n.name === node) found = true;
      },
    });
    return found;
  }

  /** The style, the node it must produce, and the marks it writes. */
  const STYLES: ReadonlyArray<readonly [string, InlineStyle, string, string]> =
    [
      ["bold", BOLD, "StrongEmphasis", "**"],
      ["italic", ITALIC, "Emphasis", "*"],
      ["strikethrough", STRIKETHROUGH, "Strikethrough", "~~"],
      ["inline code", CODE, "InlineCode", "`"],
    ];

  /** Applies one style to the marked selection and returns the state after. */
  function run(marked: string, style: InlineStyle): EditorState {
    const { doc, from, to } = parse(marked);
    return apply(make(doc, from, to), (state, range) =>
      planFormat(state, range, style),
    );
  }

  for (const [name, style, node, d] of STYLES) {
    it(`leaves a leading space outside the ${name} marks`, () => {
      const after = run("rather« than a step» here", style);

      expect(after.doc.toString()).toBe(`rather ${d}than a step${d} here`);
      expect(parses(after.doc.toString(), node)).toBe(true);
    });

    it(`leaves a trailing space outside the ${name} marks`, () => {
      const after = run("say «a word »here", style);

      expect(after.doc.toString()).toBe(`say ${d}a word${d} here`);
      expect(parses(after.doc.toString(), node)).toBe(true);
    });

    it(`leaves spaces on both sides outside the ${name} marks`, () => {
      const after = run("say« a word »here", style);

      expect(after.doc.toString()).toBe(`say ${d}a word${d} here`);
      expect(parses(after.doc.toString(), node)).toBe(true);
    });

    /** The selection follows the text, not the spaces it used to include. */
    it(`puts the ${name} selection around the text it styled`, () => {
      const after = run("rather« than a step» here", style);
      const { from, to } = after.selection.main;

      expect(after.sliceDoc(from, to)).toBe("than a step");
    });

    it(`does nothing to a ${name} selection of only whitespace`, () => {
      const after = run("one «  »two", style);

      expect(after.doc.toString()).toBe("one   two");
    });

    /**
     * The second press has to find the construct the first one wrote. Trimming
     * is what makes that possible — an unparsed `~~ x~~` could never be found.
     */
    it(`still round-trips the ${name} after trimming`, () => {
      const once = run("rather« than a step» here", style);
      const twice = apply(once, (state, range) =>
        planFormat(state, range, style),
      );

      expect(twice.doc.toString()).toBe("rather than a step here");
    });
  }

  /** The bar must not show a style as off and then clear it when pressed. */
  it("reports the style of the trimmed range, not the raw selection", () => {
    const { doc, from, to } = parse("one« **two** »three");
    const state = make(doc, from, to);

    expect(isStyled(state, state.selection.main, BOLD)).toBe(true);
  });
});

describe("planLink", () => {
  it("takes the selection as the link text", () => {
    check(link, "see «the docs» now", "see [the docs]() now", {
      keeps: "",
      roundTrip: false,
    });
  });

  it("takes an address as the link target", () => {
    check(
      link,
      "see «https://example.com» now",
      "see [](https://example.com) now",
      { keeps: "", roundTrip: false },
    );
  });

  it("takes a link off again", () => {
    // The target is gone with the link, so the second press cannot write the
    // same line again. Only the text comes back.
    check(
      link,
      "see [«the docs»](https://example.com) now",
      "see the docs now",
      { roundTrip: false },
    );
  });
});

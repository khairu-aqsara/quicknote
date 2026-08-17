/**
 * A headless check for the callout scanner. Run it with `npm run check:callouts`.
 *
 * The cases that matter are the ones where `:::` should NOT open a callout:
 * inside a fenced code block, and when it carries no kind.
 */

import { Text } from "@codemirror/state";
import { findCallouts } from "./callouts";

interface Case {
  name: string;
  doc: string;
  expect: Array<{ kind: string; label: string; first: number; last: number }>;
}

const CASES: Case[] = [
  {
    name: "the plain case",
    doc: "# Note\n\n:::success\nthis is content\n:::\n\nafter",
    expect: [{ kind: "success", label: "success", first: 3, last: 5 }],
  },
  {
    name: "every alias maps onto a palette",
    doc: ":::tip\na\n:::\n:::caution\nb\n:::\n:::error\nc\n:::\n:::note\nd\n:::",
    expect: [
      { kind: "success", label: "tip", first: 1, last: 3 },
      { kind: "warning", label: "caution", first: 4, last: 6 },
      { kind: "danger", label: "error", first: 7, last: 9 },
      { kind: "info", label: "note", first: 10, last: 12 },
    ],
  },
  {
    name: "an unknown kind falls back to neutral",
    doc: ":::banana\ncontent\n:::",
    expect: [{ kind: "neutral", label: "banana", first: 1, last: 3 }],
  },
  {
    name: "a colon fence inside code is code",
    doc: "```\n:::success\nnot a callout\n:::\n```",
    expect: [],
  },
  {
    name: "an unclosed callout runs to the end",
    doc: "intro\n\n:::warning\nstill writing",
    expect: [{ kind: "warning", label: "warning", first: 3, last: 4 }],
  },
  {
    name: "a bare ::: opens nothing",
    doc: ":::\ncontent\n:::",
    expect: [],
  },
  {
    name: "two callouts in a row",
    doc: ":::info\na\n:::\n\n:::danger\nb\n:::",
    expect: [
      { kind: "info", label: "info", first: 1, last: 3 },
      { kind: "danger", label: "danger", first: 5, last: 7 },
    ],
  },
  {
    name: "indented callout",
    doc: "  :::success\n  content\n  :::",
    expect: [{ kind: "success", label: "success", first: 1, last: 3 }],
  },
];

let failures = 0;

for (const testCase of CASES) {
  const found = findCallouts({ doc: Text.of(testCase.doc.split("\n")) });

  const actual = found.map((c) => ({
    kind: c.kind,
    label: c.label,
    first: c.firstLine,
    last: c.lastLine,
  }));

  const ok = JSON.stringify(actual) === JSON.stringify(testCase.expect);
  if (!ok) failures++;

  console.log(`${ok ? "ok  " : "FAIL"}  ${testCase.name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(testCase.expect)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

console.log(
  failures === 0
    ? "\nEvery callout was found where it should be, and nowhere else."
    : `\n${failures} case(s) failed.`,
);

if (failures > 0) process.exit(1);

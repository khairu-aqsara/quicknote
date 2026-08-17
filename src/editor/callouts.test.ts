/**
 * The callout scanner.
 *
 * The cases that matter are the ones where `:::` should NOT open a callout:
 * inside a fenced code block, and when it carries no kind.
 */

import { describe, expect, it } from "vitest";
import { Text } from "@codemirror/state";
import { findCallouts } from "./callouts";

interface Found {
  kind: string;
  label: string;
  first: number;
  last: number;
}

function scan(doc: string): Found[] {
  return findCallouts({ doc: Text.of(doc.split("\n")) }).map((callout) => ({
    kind: callout.kind,
    label: callout.label,
    first: callout.firstLine,
    last: callout.lastLine,
  }));
}

describe("findCallouts", () => {
  it("finds the plain case", () => {
    expect(scan("# Note\n\n:::success\nthis is content\n:::\n\nafter")).toEqual(
      [{ kind: "success", label: "success", first: 3, last: 5 }],
    );
  });

  it("maps every alias onto a palette", () => {
    const doc =
      ":::tip\na\n:::\n:::caution\nb\n:::\n:::error\nc\n:::\n:::note\nd\n:::";
    expect(scan(doc)).toEqual([
      { kind: "success", label: "tip", first: 1, last: 3 },
      { kind: "warning", label: "caution", first: 4, last: 6 },
      { kind: "danger", label: "error", first: 7, last: 9 },
      { kind: "info", label: "note", first: 10, last: 12 },
    ]);
  });

  it("falls back to neutral for an unknown kind", () => {
    expect(scan(":::banana\ncontent\n:::")).toEqual([
      { kind: "neutral", label: "banana", first: 1, last: 3 },
    ]);
  });

  it("treats a colon fence inside code as code", () => {
    expect(scan("```\n:::success\nnot a callout\n:::\n```")).toEqual([]);
  });

  it("runs an unclosed callout to the end of the document", () => {
    expect(scan("intro\n\n:::warning\nstill writing")).toEqual([
      { kind: "warning", label: "warning", first: 3, last: 4 },
    ]);
  });

  it("opens nothing for a bare :::", () => {
    expect(scan(":::\ncontent\n:::")).toEqual([]);
  });

  it("finds two callouts in a row", () => {
    expect(scan(":::info\na\n:::\n\n:::danger\nb\n:::")).toEqual([
      { kind: "info", label: "info", first: 1, last: 3 },
      { kind: "danger", label: "danger", first: 5, last: 7 },
    ]);
  });

  it("finds an indented callout", () => {
    expect(scan("  :::success\n  content\n  :::")).toEqual([
      { kind: "success", label: "success", first: 1, last: 3 },
    ]);
  });
});

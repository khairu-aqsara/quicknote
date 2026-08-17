/**
 * The image resolver reaches the renderer through a facet.
 *
 * It used to be a module-level variable that something else had to set first.
 * These cases pin down the replacement: the renderer reads whatever the editor
 * state carries, and resolves nothing at all when the state carries nothing.
 */

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { DecorationBuilder } from "./builder";
import { imageResolver, type ImageResolver } from "./images";

function builderFor(resolve?: ImageResolver): DecorationBuilder {
  const state = EditorState.create({
    doc: "![alt](a.png)",
    extensions: [
      markdown({ base: markdownLanguage }),
      ...(resolve ? [imageResolver.of(resolve)] : []),
    ],
  });
  return new DecorationBuilder(state, new Set());
}

describe("DecorationBuilder.resolveImage", () => {
  it("reads the resolver the editor state carries", () => {
    const builder = builderFor((url) => `asset:///notes/${url}`);

    expect(builder.resolveImage("a.png")).toBe("asset:///notes/a.png");
  });

  /**
   * A state with no resolver must render no image rather than throw. This is
   * what the old module-level variable got wrong: before something called
   * `setImageResolver`, every read was a call on an uninitialised module.
   */
  it("resolves nothing when the state carries no resolver", () => {
    expect(builderFor().resolveImage("a.png")).toBe(null);
  });

  it("passes the reference through unchanged", () => {
    const seen: string[] = [];
    const builder = builderFor((url) => {
      seen.push(url);
      return null;
    });

    builder.resolveImage("photos/holiday.png");

    expect(seen).toEqual(["photos/holiday.png"]);
  });
});

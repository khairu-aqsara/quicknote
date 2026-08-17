/**
 * The editor's look. PRD Section 20.
 *
 * Every colour is a CSS custom property defined in `../../styles/`, so
 * switching theme means changing one attribute on <html>. The editor is never
 * rebuilt.
 *
 * The rules are grouped by what they dress, and merged here in the order they
 * cascade: the surface first, then the prose on it, then the blocks, then the
 * chrome that floats above everything.
 */

import { EditorView } from "@codemirror/view";

import { base } from "./base";
import { blocks } from "./blocks";
import { chrome } from "./chrome";
import { prose } from "./prose";

export { codeHighlight } from "./highlight";

export const editorTheme = EditorView.theme({
  ...base,
  ...prose,
  ...blocks,
  ...chrome,
});

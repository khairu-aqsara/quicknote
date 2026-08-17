/**
 * How the renderer reaches an image file.
 *
 * The resolver used to be a module-level variable set by `setImageResolver`,
 * which meant the renderer only worked after something else had run, and no
 * test could give it a different one. A facet is CodeMirror's own way to hand
 * an extension its configuration: the resolver now travels with the editor
 * state, and the note-file switch swaps it through a compartment.
 */

import { Facet } from "@codemirror/state";

/**
 * Resolves an image reference to something the WebView can load.
 * Remote URLs resolve to null, because QuickNote makes no network request.
 */
export type ImageResolver = (url: string) => string | null;

const NONE: ImageResolver = () => null;

export const imageResolver = Facet.define<ImageResolver, ImageResolver>({
  combine: (values) => values.at(0) ?? NONE,
});

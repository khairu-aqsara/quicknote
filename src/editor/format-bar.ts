/**
 * The formatting bar. PRD Sections 6.5 and 8.
 *
 * QuickNote shows no permanent toolbar. This bar exists only while a selection
 * does. It appears above the selected text and leaves the moment the selection
 * collapses, so the default screen is still the editor and nothing else.
 *
 * Every button runs the same command as its keyboard shortcut. The bar adds no
 * behaviour of its own — it only shows the mouse what the keyboard can do.
 */

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  showTooltip,
  type Command,
  type Tooltip,
  type TooltipView,
} from "@codemirror/view";
import {
  BOLD,
  CODE,
  ITALIC,
  STRIKETHROUGH,
  isLinked,
  isStyled,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleLink,
  toggleStrikethrough,
} from "./format";

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round"><path d="M10.2 13.8a4.6 4.6 0 0 0 6.5 0l2.8-2.8a4.6 4.6 0 0
    0-6.5-6.5l-1.6 1.6"/><path d="M13.8 10.2a4.6 4.6 0 0 0-6.5 0l-2.8 2.8a4.6 4.6 0 0 0
    6.5 6.5l1.6-1.6"/></svg>`;

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = MAC ? "⌘" : "Ctrl+";
const SHIFT = MAC ? "⇧" : "Shift+";

interface FormatButton {
  /** Goes into the button's class, so the glyph can be styled. */
  readonly name: string;
  readonly label: string;
  readonly hint: string;
  /** The character drawn on the button, or `icon` when a glyph will not do. */
  readonly glyph?: string;
  readonly icon?: string;
  readonly run: Command;
  /** True when the selection already carries this style. */
  readonly on: (state: EditorState) => boolean;
}

const BUTTONS: readonly FormatButton[] = [
  {
    name: "bold",
    label: "Bold",
    hint: `${MOD}B`,
    glyph: "B",
    run: toggleBold,
    on: (state) => isStyled(state, state.selection.main, BOLD),
  },
  {
    name: "italic",
    label: "Italic",
    hint: `${MOD}I`,
    glyph: "I",
    run: toggleItalic,
    on: (state) => isStyled(state, state.selection.main, ITALIC),
  },
  {
    name: "strikethrough",
    label: "Strikethrough",
    hint: `${MOD}${SHIFT}X`,
    glyph: "S",
    run: toggleStrikethrough,
    on: (state) => isStyled(state, state.selection.main, STRIKETHROUGH),
  },
  {
    name: "code",
    label: "Inline code",
    hint: `${MOD}E`,
    glyph: "<>",
    run: toggleCode,
    on: (state) => isStyled(state, state.selection.main, CODE),
  },
  {
    name: "link",
    label: "Link",
    hint: `${MOD}K`,
    icon: LINK_ICON,
    run: toggleLink,
    on: (state) => isLinked(state, state.selection.main),
  },
];

/* ------------------------------------------------------------- the widget */

/**
 * Builds the bar once. CodeMirror keeps this view alive for as long as the
 * tooltip stays up, and calls `update` on every change, so the pressed states
 * follow the selection without the DOM being rebuilt.
 */
function createBar(view: EditorView): TooltipView {
  const dom = document.createElement("div");
  dom.className = "cm-format-bar";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Text formatting");

  const painted = BUTTONS.map((button) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `cm-format-button cm-format-${button.name}`;
    if (button.icon) el.innerHTML = button.icon;
    else el.textContent = button.glyph ?? "";

    const label = `${button.label}  ${button.hint}`;
    el.title = label;
    el.setAttribute("aria-label", label);

    // The press must not take focus, or the selection it acts on disappears
    // before the command runs.
    el.addEventListener("mousedown", (event) => event.preventDefault());
    el.addEventListener("click", () => {
      button.run(view);
      view.focus();
    });

    dom.appendChild(el);
    return { el, button };
  });

  const paint = (state: EditorState) => {
    for (const { el, button } of painted) {
      const on = button.on(state);
      el.classList.toggle("cm-format-on", on);
      el.setAttribute("aria-pressed", String(on));
    }
  };

  paint(view.state);

  return {
    dom,
    // A small gap, so the bar never sits on the line it describes.
    offset: { x: 0, y: 6 },
    update: (update) => {
      if (update.docChanged || update.selectionSet) paint(update.state);
    },
  };
}

/* ----------------------------------------------------------- when to show */

/**
 * The bar stays down while the pointer is held and while the editor is
 * blurred. Text that grows a floating bar under a dragging mouse is text the
 * user cannot aim at, and a bar over the settings sheet belongs to nothing.
 */
const setSuppressed = StateEffect.define<boolean>();

const suppressed = StateField.define<boolean>({
  create: () => false,
  update(down, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSuppressed)) return effect.value;
    }
    return down;
  },
});

function barTooltip(state: EditorState): readonly Tooltip[] {
  if (state.field(suppressed)) return [];

  const range = state.selection.main;
  if (range.empty) return [];

  // Anchored to the moving end of the selection, which is where the user is
  // looking and the one end that is always on screen.
  return [{ pos: range.head, above: true, arrow: false, create: createBar }];
}

function suppress(view: EditorView, down: boolean): void {
  if (view.state.field(suppressed) !== down) {
    view.dispatch({ effects: setSuppressed.of(down) });
  }
}

/**
 * The release has to be caught on the document. A drag that ends outside the
 * window never delivers `mouseup` to the editor, and the bar would stay down.
 */
const watchPointer = ViewPlugin.fromClass(
  class {
    private readonly onUp: () => void;

    constructor(private readonly view: EditorView) {
      this.onUp = () => suppress(this.view, false);
      view.dom.ownerDocument.addEventListener("mouseup", this.onUp);
    }

    destroy(): void {
      this.view.dom.ownerDocument.removeEventListener("mouseup", this.onUp);
    }
  },
);

export const formatBar = [
  suppressed,
  watchPointer,
  showTooltip.computeN([suppressed, "selection"], barTooltip),
  EditorView.domEventHandlers({
    mousedown: (_event, view) => {
      suppress(view, true);
      return false;
    },
    blur: (_event, view) => {
      suppress(view, true);
      return false;
    },
    focus: (_event, view) => {
      suppress(view, false);
      return false;
    },
  }),
];

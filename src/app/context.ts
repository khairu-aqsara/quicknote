/**
 * What the running application is made of.
 *
 * `boot` used to be one function holding all of this in closures. Splitting it
 * means the pieces have to cross module boundaries, and this is what carries
 * them.
 *
 * `config`, `session`, and `noteDir` are replaced wholesale rather than mutated
 * field by field, so a reader always sees one consistent version.
 */

import type { EditorView } from "@codemirror/view";

import type { Backend, Config, Session } from "../bridge";
import type { Persistence } from "../persistence";
import type { SettingsSheet } from "../settings";
import type { Notice, StatusIndicator, ThemeToggle } from "../ui";

export interface Elements {
  status: HTMLElement;
  notice: HTMLElement;
  settings: HTMLElement;
  editor: HTMLElement;
  theme: HTMLElement;
}

export interface AppContext {
  readonly backend: Backend;
  readonly elements: Elements;
  readonly status: StatusIndicator;
  readonly notice: Notice;

  config: Config;
  session: Session;
  /** The folder that holds the note. Images resolve against it. */
  noteDir: string;

  /*
   * The four below are built during boot, in dependency order, because each
   * one needs the ones above it. Every reader is a callback the user triggers
   * — a key press, a click, a window event — so all four exist long before
   * anything reads them.
   */
  persistence: Persistence;
  view: EditorView;
  settings: SettingsSheet;
  themeToggle: ThemeToggle;
}

/** The folder that holds a file. Handles both path separators. */
export function directoryOf(path: string): string {
  return path.replace(/[/\\][^/\\]*$/, "");
}

function need(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`the window is missing its "${id}" element`);
  return el;
}

export function findElements(): Elements {
  return {
    status: need("status"),
    notice: need("notice"),
    settings: need("settings"),
    editor: need("editor"),
    theme: need("theme-toggle"),
  };
}

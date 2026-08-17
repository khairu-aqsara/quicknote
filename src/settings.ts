/**
 * The settings sheet. PRD Sections 15 and 21.
 *
 * It opens with `Cmd/Ctrl + ,` and closes with `Esc`. Every change applies
 * immediately and is written to `config.json`.
 *
 * Each field is built by its own function below, so `render` reads as the list
 * of settings the sheet offers rather than as the DOM calls that draw them.
 */

import type { Config } from "./bridge";

export interface SettingsHooks {
  onChange: (config: Config) => void;
  onPickNoteFile: () => Promise<string | null>;
  onClose: () => void;
}

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 28;

/** What every field needs: the current values, and a way to change one. */
interface Field {
  config: Config;
  commit: (patch: Partial<Config>) => void;
}

/** True while the shortcut input is listening for a key combination. */
interface Recording {
  value: boolean;
}

export class SettingsSheet {
  private readonly root: HTMLElement;
  private config: Config;
  private readonly recording: Recording = { value: false };

  constructor(
    root: HTMLElement,
    config: Config,
    private readonly hooks: SettingsHooks,
  ) {
    this.root = root;
    this.config = config;
    this.root.addEventListener("mousedown", (event) => {
      if (event.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setConfig(config: Config): void {
    this.config = config;
    if (this.isOpen) this.render();
  }

  open(): void {
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.recording.value = false;
    this.root.hidden = true;
    this.hooks.onClose();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private commit(patch: Partial<Config>): void {
    this.config = { ...this.config, ...patch };
    this.hooks.onChange(this.config);
  }

  private render(): void {
    const field: Field = {
      config: this.config,
      commit: (patch) => {
        this.commit(patch);
      },
    };

    const sheet = el("div", "sheet");
    sheet.appendChild(el("h2", "", "Settings"));

    for (const part of [
      themeField(field),
      ...fontSizeField(field),
      alwaysOnTopField(field),
      ...shortcutField(field, this.recording),
      noteFileField(this.config, () => this.pickNoteFile()),
      doneFooter(() => {
        this.close();
      }),
    ]) {
      sheet.appendChild(part);
    }

    this.root.textContent = "";
    this.root.appendChild(sheet);
  }

  private pickNoteFile(): void {
    void this.hooks.onPickNoteFile().then((chosen) => {
      if (!chosen) return;
      this.config = { ...this.config, notePath: chosen };
      this.render();
    });
  }
}

/* ------------------------------------------------------------------ fields */

function themeField({ config, commit }: Field): HTMLElement {
  const theme = document.createElement("select");
  for (const value of ["light", "dark", "system"] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    option.selected = config.theme === value;
    theme.appendChild(option);
  }
  theme.addEventListener("change", () => {
    commit({ theme: theme.value as Config["theme"] });
  });
  return row("Theme", theme);
}

function fontSizeField({ config, commit }: Field): HTMLElement[] {
  const size = document.createElement("input");
  size.type = "number";
  size.min = String(MIN_FONT_SIZE);
  size.max = String(MAX_FONT_SIZE);
  size.step = "1";
  size.value = String(config.fontSize);
  size.addEventListener("change", () => {
    const value = clamp(Number(size.value), MIN_FONT_SIZE, MAX_FONT_SIZE);
    size.value = String(value);
    commit({ fontSize: value });
  });

  return [
    row("Font size", size),
    el(
      "div",
      "hint",
      "Cmd/Ctrl with + or − changes this while you write. Cmd/Ctrl + 0 restores it.",
    ),
  ];
}

function alwaysOnTopField({ config, commit }: Field): HTMLElement {
  const onTop = document.createElement("input");
  onTop.type = "checkbox";
  onTop.checked = config.alwaysOnTop;
  onTop.addEventListener("change", () => {
    commit({ alwaysOnTop: onTop.checked });
  });
  return row("Always on top", onTop);
}

function shortcutField(
  { config, commit }: Field,
  recording: Recording,
): HTMLElement[] {
  const shortcut = document.createElement("input");
  shortcut.type = "text";
  shortcut.className = "shortcut";
  shortcut.readOnly = true;
  shortcut.value = pretty(config.globalShortcut);

  shortcut.addEventListener("focus", () => {
    recording.value = true;
    shortcut.classList.add("recording");
    shortcut.value = "Press keys…";
  });
  shortcut.addEventListener("blur", () => {
    recording.value = false;
    shortcut.classList.remove("recording");
    shortcut.value = pretty(config.globalShortcut);
  });
  shortcut.addEventListener("keydown", (event) => {
    if (!recording.value) return;
    event.preventDefault();
    event.stopPropagation();
    const accelerator = toAccelerator(event);
    if (!accelerator) return;
    commit({ globalShortcut: accelerator });
    shortcut.blur();
  });

  return [
    row("Quick note shortcut", shortcut),
    el(
      "div",
      "hint",
      "The operating system cannot report that another application already " +
        "owns a combination. If the shortcut does nothing, choose another one.",
    ),
  ];
}

function noteFileField(config: Config, onPick: () => void): HTMLElement {
  const path = el("div", "path", config.notePath);
  const pick = document.createElement("button");
  pick.type = "button";
  pick.textContent = "Change…";
  pick.addEventListener("click", onPick);

  const fileRow = row("Note file", pick);
  fileRow.insertBefore(path, pick);
  return fileRow;
}

function doneFooter(onDone: () => void): HTMLElement {
  const footer = document.createElement("footer");
  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", onDone);
  footer.appendChild(done);
  return footer;
}

/* ----------------------------------------------------------------- helpers */

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("div", "row");
  wrap.appendChild(el("label", "", label));
  wrap.appendChild(control);
  return wrap;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Builds a Tauri accelerator string from a key press. */
function toAccelerator(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Cmd");

  const code = event.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code;
  else if (code === "Space") key = "Space";
  else if (code === "Enter") key = "Enter";

  // A bare key would swallow that key in every other application.
  if (!key || parts.length === 0) return null;

  parts.push(key);
  return parts.join("+");
}

/** Shows the accelerator the way the platform writes it. */
function pretty(accelerator: string): string {
  const mac = /mac/i.test(navigator.userAgent);
  if (!mac) return accelerator;
  return accelerator
    .replace(/CommandOrControl|CmdOrCtrl/g, "⌘")
    .replace(/Command|Cmd|Super|Meta/g, "⌘")
    .replace(/Control|Ctrl/g, "⌃")
    .replace(/Option|Alt/g, "⌥")
    .replace(/Shift/g, "⇧")
    .replace(/\+/g, "");
}

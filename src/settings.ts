/**
 * The settings sheet. PRD Sections 15 and 21.
 *
 * It opens with `Cmd/Ctrl + ,` and closes with `Esc`. Every change applies
 * immediately and is written to `config.json`.
 */

import type { Config } from "./bridge";

export interface SettingsHooks {
  onChange: (config: Config) => void;
  onPickNoteFile: () => Promise<string | null>;
  onClose: () => void;
}

export class SettingsSheet {
  private readonly root: HTMLElement;
  private config: Config;
  private recording = false;

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
    this.recording = false;
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
    this.root.textContent = "";

    const sheet = el("div", "sheet");
    sheet.appendChild(el("h2", "", "Settings"));

    /* -------------------------------------------------------- theme */

    const theme = document.createElement("select");
    for (const value of ["light", "dark", "system"] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value[0].toUpperCase() + value.slice(1);
      option.selected = this.config.theme === value;
      theme.appendChild(option);
    }
    theme.addEventListener("change", () =>
      this.commit({ theme: theme.value as Config["theme"] }),
    );
    sheet.appendChild(row("Theme", theme));

    /* ---------------------------------------------------- font size */

    const size = document.createElement("input");
    size.type = "number";
    size.min = "12";
    size.max = "28";
    size.step = "1";
    size.value = String(this.config.fontSize);
    size.addEventListener("change", () => {
      const value = clamp(Number(size.value), 12, 28);
      size.value = String(value);
      this.commit({ fontSize: value });
    });
    sheet.appendChild(row("Font size", size));
    sheet.appendChild(
      el("div", "hint", "Cmd/Ctrl with + or − changes this while you write. Cmd/Ctrl + 0 restores it."),
    );

    /* -------------------------------------------------- always on top */

    const onTop = document.createElement("input");
    onTop.type = "checkbox";
    onTop.checked = this.config.alwaysOnTop;
    onTop.addEventListener("change", () =>
      this.commit({ alwaysOnTop: onTop.checked }),
    );
    sheet.appendChild(row("Always on top", onTop));

    /* ------------------------------------------------ global shortcut */

    const shortcut = document.createElement("input");
    shortcut.type = "text";
    shortcut.className = "shortcut";
    shortcut.readOnly = true;
    shortcut.value = pretty(this.config.globalShortcut);
    shortcut.addEventListener("focus", () => {
      this.recording = true;
      shortcut.classList.add("recording");
      shortcut.value = "Press keys…";
    });
    shortcut.addEventListener("blur", () => {
      this.recording = false;
      shortcut.classList.remove("recording");
      shortcut.value = pretty(this.config.globalShortcut);
    });
    shortcut.addEventListener("keydown", (event) => {
      if (!this.recording) return;
      event.preventDefault();
      event.stopPropagation();
      const accelerator = toAccelerator(event);
      if (!accelerator) return;
      this.commit({ globalShortcut: accelerator });
      shortcut.blur();
    });
    sheet.appendChild(row("Quick note shortcut", shortcut));

    sheet.appendChild(
      el(
        "div",
        "hint",
        "The operating system cannot report that another application already " +
          "owns a combination. If the shortcut does nothing, choose another one.",
      ),
    );

    /* ------------------------------------------------------ note file */

    const path = el("div", "path", this.config.notePath);
    const pick = document.createElement("button");
    pick.type = "button";
    pick.textContent = "Change…";
    pick.addEventListener("click", () => {
      void this.hooks.onPickNoteFile().then((chosen) => {
        if (chosen) {
          this.config = { ...this.config, notePath: chosen };
          this.render();
        }
      });
    });

    const fileRow = row("Note file", pick);
    fileRow.insertBefore(path, pick);
    sheet.appendChild(fileRow);

    /* ---------------------------------------------------------- close */

    const footer = document.createElement("footer");
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.addEventListener("click", () => this.close());
    footer.appendChild(done);
    sheet.appendChild(footer);

    this.root.appendChild(sheet);
  }
}

/* ------------------------------------------------------------- helpers */

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

/**
 * The two pieces of permanent and near-permanent chrome. PRD Section 8.
 *
 * A save indicator that fades in only when it has something to report, and a
 * one-line notice that never blocks typing and never takes focus.
 */

import type { SaveState } from "./persistence";

const LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "Saving",
  saved: "Saved",
  error: "Not saved",
};

export class StatusIndicator {
  private readonly el: HTMLElement;
  private fadeTimer: number | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  set(state: SaveState): void {
    this.el.dataset.state = state;
    this.el.textContent = LABEL[state];

    if (this.fadeTimer !== null) window.clearTimeout(this.fadeTimer);
    if (state === "saved") {
      // "Saved" says its piece and then gets out of the way.
      this.fadeTimer = window.setTimeout(() => {
        if (this.el.dataset.state === "saved") this.el.dataset.state = "idle";
      }, 1600);
    }
  }
}

export class Notice {
  private readonly el: HTMLElement;
  private timer: number | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Shows one line. `timeout` of 0 keeps it until the user dismisses it. */
  show(message: string, timeout = 6000): void {
    this.el.textContent = "";

    const text = document.createElement("span");
    text.textContent = message;
    this.el.appendChild(text);

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss");
    close.addEventListener("click", () => this.hide());
    this.el.appendChild(close);

    this.el.hidden = false;

    if (this.timer !== null) window.clearTimeout(this.timer);
    if (timeout > 0) {
      this.timer = window.setTimeout(() => this.hide(), timeout);
    }
  }

  hide(): void {
    this.el.hidden = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}

export type ThemeChoice = "light" | "dark" | "system";

const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.2v2.2M12
    19.6v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.2 12h2.2M19.6 12h2.2M4.4 19.6l1.6-1.6M18
    6l1.6-1.6"/></svg>`;

const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.8A8.8 8.8 0 0 1
    9.2 3.5a8.8 8.8 0 1 0 11.3 11.3z"/></svg>`;

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** What the window is actually showing right now. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/**
 * The theme toggle in the top corner.
 *
 * It switches between light and dark and nothing else. A three-way cycle
 * through `system` looks broken, because stepping from an explicit theme to
 * `system` changes nothing on screen whenever the operating system already
 * resolves to that same appearance — the user sees a dead click. `system`
 * stays available in the settings sheet, where it is a choice rather than a
 * step in a cycle.
 */
export class ThemeToggle {
  constructor(
    private readonly el: HTMLElement,
    private choice: ThemeChoice,
    private readonly onChange: (choice: ThemeChoice) => void,
  ) {
    this.el.addEventListener("click", () => {
      // Always the opposite of what is on screen, so every click is visible.
      this.onChange(resolveTheme(this.choice) === "dark" ? "light" : "dark");
    });

    // While the choice is `system`, the icon follows the operating system.
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (this.choice === "system") this.render();
      });

    this.render();
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    this.render();
  }

  private render(): void {
    const showing = resolveTheme(this.choice);
    const following = this.choice === "system" ? "Following the system. " : "";

    this.el.innerHTML = showing === "dark" ? MOON : SUN;

    const label = `${following}Click for ${showing === "dark" ? "light" : "dark"}`;
    this.el.setAttribute("title", label);
    this.el.setAttribute("aria-label", label);
  }
}

/** Applies a theme choice to the document root. PRD Section 19. */
export function applyTheme(choice: "light" | "dark" | "system"): void {
  const resolved =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = resolved;
}

/** Repaints when the operating system switches theme, if the choice follows it. */
export function watchSystemTheme(getChoice: () => string): void {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getChoice() === "system") applyTheme("system");
    });
}

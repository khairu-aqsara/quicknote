/**
 * The five things the renderer draws in place of Markdown source.
 *
 * Each one replaces a range without editing it. The buffer and the file on disk
 * still hold the characters underneath. See PRD Section 10.
 */

import { EditorView, WidgetType } from "@codemirror/view";

/**
 * The round bullet Typora paints in place of `-`, `*`, or `+`.
 *
 * It replaces the marker and the spaces after it, and fills the whole marker
 * column, so the item's text starts exactly where a wrapped line hangs back to.
 */
export class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** A clickable checkbox for `- [ ]` and `- [x]`. */
export class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = this.checked ? "cm-task cm-task-done" : "cm-task";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** A horizontal rule drawn in place of `---`. */
export class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-rule";
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** The kind label drawn in place of a callout's opening `:::success` line. */
export class CalloutLabel extends WidgetType {
  constructor(private readonly kind: string) {
    super();
  }

  override eq(other: CalloutLabel): boolean {
    return other.kind === this.kind;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-callout-label";
    span.textContent = this.kind;
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** An inline image. Only local files load — see PRD Section 25. */
export class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      wrap.classList.add("cm-image-broken");
      wrap.textContent = this.alt || "image not found";
    });
    wrap.appendChild(img);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * The font size, and the one place a config change is applied and stored.
 */

import { setFontSize } from "../editor/editor";
import type { Config } from "../bridge";
import type { AppContext } from "./context";

const DEFAULT_FONT_SIZE = 17;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 28;

/** Replaces the config, tells the settings sheet, and writes it to disk. */
export function commitConfig(ctx: AppContext, next: Config): void {
  ctx.config = next;
  ctx.settings.setConfig(next);
  void ctx.backend.configSave(next);
}

/**
 * `Cmd/Ctrl` with `+` or `-` steps the size. `Cmd/Ctrl + 0` restores it.
 * A step of 0 means "back to the default".
 */
export function stepFontSize(ctx: AppContext, step: number): void {
  const current = ctx.config.fontSize;
  const next =
    step === 0
      ? DEFAULT_FONT_SIZE
      : Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, current + step));

  if (next === current) return;

  setFontSize(ctx.view, next);
  commitConfig(ctx, { ...ctx.config, fontSize: next });
}

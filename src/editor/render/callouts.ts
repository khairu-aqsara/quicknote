/**
 * Callout blocks. See `../callouts.ts` for why the grammar knows nothing about
 * them and this pass reads them from a separate scanner.
 *
 * It runs after the tree walk rather than inside it, because a callout is a run
 * of lines the grammar sees only as paragraphs.
 */

import { findCallouts } from "../callouts";
import type { DecorationBuilder } from "./builder";
import { CalloutLabel } from "./widgets";

export function decorateCallouts(
  builder: DecorationBuilder,
  visible: { from: number; to: number }[],
): void {
  const { doc } = builder;

  // Only decorate the lines the viewport actually shows.
  const firstVisible = doc.lineAt(visible.at(0)?.from ?? 0).number;
  const lastVisible = doc.lineAt(visible.at(-1)?.to ?? doc.length).number;

  for (const callout of findCallouts(builder.state)) {
    if (callout.lastLine < firstVisible || callout.firstLine > lastVisible) {
      continue;
    }

    const from = Math.max(callout.firstLine, firstVisible);
    const to = Math.min(callout.lastLine, lastVisible);
    for (let n = from; n <= to; n++) {
      builder.lineAt(n, `cm-callout cm-callout-${callout.kind}`);
    }

    if (callout.firstLine >= firstVisible) {
      builder.lineAt(callout.firstLine, "cm-callout-open");

      if (
        !builder.isRevealedLine(callout.firstLine) &&
        callout.openTo > callout.openFrom
      ) {
        builder.replaceOnly(callout.openFrom, callout.openTo, {
          widget: new CalloutLabel(callout.label),
        });
      }
    }

    const { closeFrom, closeTo } = callout;
    if (
      closeFrom !== null &&
      closeTo !== null &&
      callout.lastLine <= lastVisible
    ) {
      builder.lineAt(callout.lastLine, "cm-callout-close");

      if (!builder.isRevealedLine(callout.lastLine) && closeTo > closeFrom) {
        builder.replaceOnly(closeFrom, closeTo, {});
      }
    }
  }
}

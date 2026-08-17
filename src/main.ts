/**
 * QuickNote — application entry point.
 *
 *   Type it. Close it. It's still there.
 */

import { boot } from "./app/boot";

boot().catch((error: unknown) => {
  // A failure this early means the editor never appeared. Say so plainly
  // rather than leaving a blank window.
  const el = document.getElementById("notice");
  if (el) {
    el.hidden = false;
    el.textContent = `QuickNote could not start — ${String(error)}`;
  }
});

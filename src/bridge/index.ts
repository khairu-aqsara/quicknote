/**
 * The bridge to the Rust backend. PRD Section 23.
 *
 * `initBridge` hands back the one object every other module uses. Nothing is
 * stored at module scope, so there is no order to get wrong: a caller either
 * holds a `Backend` or it does not.
 */

import { createTauriBackend, isTauriHost, type Backend } from "./backend";
import { createBrowserBackend } from "./browser";

export type { Backend } from "./backend";
export { isAbsolutePath, resolveImageSrc } from "./images";
export type {
  BackendEvent,
  Config,
  NoteCheck,
  NoteLoad,
  NoteSave,
  Session,
} from "./types";

export function initBridge(): Promise<Backend> {
  return isTauriHost()
    ? createTauriBackend()
    : Promise.resolve(createBrowserBackend());
}

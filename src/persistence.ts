/**
 * Autosave, flush, and external-change handling. PRD Sections 12 and 13.
 *
 * The atomic write, the recovery scan, and the conflict copy all live in Rust.
 * This class decides only *when* to write, and what to tell the user.
 */

import { noteSave, noteCheck } from "./bridge";

/** PRD Section 12 — write once the user stops typing. */
const DEBOUNCE_MS = 400;

/** PRD Section 12 — never leave text unwritten longer than this. */
const MAX_INTERVAL_MS = 5000;

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface PersistenceHooks {
  onState: (state: SaveState) => void;
  /** An external edit arrived while the editor was clean. */
  onReload: (content: string) => void;
  /** An external edit arrived while the editor was dirty. */
  onConflict: (conflictFile: string) => void;
  onError: (message: string) => void;
}

export class Persistence {
  private content: string;
  private baseHash: string;
  private dirty = false;
  private stopped = false;

  private debounceTimer: number | null = null;
  private maxTimer: number | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    initialContent: string,
    initialHash: string,
    private readonly hooks: PersistenceHooks,
  ) {
    this.content = initialContent;
    this.baseHash = initialHash;
  }

  /** The editor changed. Start or extend the autosave window. */
  schedule(content: string): void {
    if (this.stopped) return;
    this.content = content;
    this.dirty = true;
    this.hooks.onState("saving");

    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.write();
    }, DEBOUNCE_MS);

    // Continuous typing must not postpone the write forever.
    if (this.maxTimer === null) {
      this.maxTimer = window.setTimeout(() => {
        this.maxTimer = null;
        void this.write();
      }, MAX_INTERVAL_MS);
    }
  }

  /** Write now and wait for the write to land. */
  async flush(): Promise<void> {
    this.clearTimers();
    if (this.inflight) await this.inflight;
    if (this.dirty) await this.write();
  }

  /** True when the editor holds changes that are not on disk yet. */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Compares the file on disk against the last version QuickNote wrote.
   * Called when the window gains focus. PRD Section 13.
   */
  async checkExternal(): Promise<void> {
    if (this.stopped || this.dirty) return;
    try {
      const result = await noteCheck(this.baseHash);
      if (result.changed) {
        this.content = result.content;
        this.baseHash = result.hash;
        this.hooks.onReload(result.content);
      }
    } catch {
      // A failed check is not worth interrupting the user. The write path
      // performs the same comparison and reports failures there.
    }
  }

  /** Stops all writing. Used when the note file is not writable. */
  disable(): void {
    this.stopped = true;
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxTimer !== null) {
      window.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
  }

  private write(): Promise<void> {
    if (this.stopped || !this.dirty) return Promise.resolve();
    if (this.inflight) return this.inflight;

    this.clearTimers();
    const pending = this.content;
    this.hooks.onState("saving");

    this.inflight = noteSave(pending, this.baseHash)
      .then((result) => {
        this.baseHash = result.hash;
        // More typing may have arrived while the write was in flight.
        this.dirty = this.content !== pending;
        this.hooks.onState(this.dirty ? "saving" : "saved");
        if (result.conflictFile) {
          this.hooks.onConflict(result.conflictFile);
        }
        if (this.dirty) this.schedule(this.content);
      })
      .catch((error: unknown) => {
        this.hooks.onState("error");
        this.hooks.onError(String(error));
        // Keep the text dirty so the next autosave retries it.
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }
}

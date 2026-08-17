/**
 * Autosave, flush, and external-change handling. PRD Sections 12 and 13.
 *
 * The atomic write, the recovery scan, and the conflict copy all live in Rust.
 * This class decides only *when* to write, and what to tell the user.
 */

import type { Backend } from "./bridge";

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
  /** The note file was deleted or moved outside QuickNote. */
  onMissing: () => void;
  onError: (message: string) => void;
}

export class Persistence {
  private content: string;
  private baseHash: string;
  private dirty = false;
  private stopped = false;

  /**
   * Counts note files this instance has served. A write started before a
   * `reset` belongs to the previous file, so its result must not land on the
   * new file's hash.
   */
  private generation = 0;

  private debounceTimer: number | null = null;
  private maxTimer: number | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly backend: Backend,
    initialContent: string,
    initialHash: string,
    private readonly hooks: PersistenceHooks,
  ) {
    this.content = initialContent;
    this.baseHash = initialHash;
  }

  /**
   * Points this instance at another file's content and hash.
   *
   * Every field that describes the *previous* file has to go. A stale
   * `baseHash` makes the next write compare the new file against the old
   * file's hash, which reads as an external edit and writes a conflict copy of
   * a file nobody touched. Writing starts again here, so a read-only file no
   * longer stops QuickNote for the rest of the session.
   */
  reset(content: string, hash: string): void {
    this.clearTimers();
    this.generation++;
    this.content = content;
    this.baseHash = hash;
    this.dirty = false;
    this.stopped = false;
    this.hooks.onState("saved");
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
      const result = await this.backend.noteCheck(this.baseHash);

      // The file was deleted or moved. Say so, then write the editor's text
      // back to that path. A silent recreation on the next keystroke looks
      // like the note came back on its own.
      if (result.missing) {
        this.hooks.onMissing();
        this.dirty = true;
        await this.write();
        return;
      }

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
    const generation = this.generation;
    this.hooks.onState("saving");

    this.inflight = this.backend
      .noteSave(pending, this.baseHash)
      .then((result) => {
        // The note file changed while this write was in flight. The result
        // describes the old file and says nothing about the new one.
        if (generation !== this.generation) return;

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
        if (generation !== this.generation) return;
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

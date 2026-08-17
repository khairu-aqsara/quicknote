/**
 * Autosave. PRD Sections 12 and 13.
 *
 * The subtle part is the generation counter. A write started before the user
 * switched note files must not land its result on the new file, or the next
 * save compares the new text against the old file's hash and writes a conflict
 * copy of a file nobody touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Persistence,
  type PersistenceHooks,
  type SaveState,
} from "./persistence";
import type { Backend, NoteCheck, NoteSave } from "./bridge";

/**
 * `Persistence` schedules through `window`, because the DOM's `setTimeout`
 * returns a number while Node's returns a handle. The shim below forwards to
 * whatever the global is at call time, so Vitest's fake timers still apply.
 */
function stubWindow(): void {
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => {
      clearTimeout(id);
    },
  });
}

interface Recorder {
  backend: Backend;
  saves: Array<{ content: string; baseHash: string }>;
  /** Replaces what the next `noteSave` resolves or rejects with. */
  nextSave: (result: Promise<NoteSave>) => void;
  nextCheck: (result: NoteCheck) => void;
}

function recorder(): Recorder {
  const saves: Array<{ content: string; baseHash: string }> = [];
  let save: Promise<NoteSave> | null = null;
  let check: NoteCheck = {
    changed: false,
    content: "",
    hash: "h0",
    missing: false,
  };

  const backend = {
    noteSave: (content: string, baseHash: string) => {
      saves.push({ content, baseHash });
      const result =
        save ??
        Promise.resolve({ hash: `hash:${content}`, conflictFile: null });
      save = null;
      return result;
    },
    noteCheck: () => Promise.resolve(check),
  } as unknown as Backend;

  return {
    backend,
    saves,
    nextSave: (result) => {
      save = result;
    },
    nextCheck: (result) => {
      check = result;
    },
  };
}

function hooks(): {
  hooks: PersistenceHooks;
  states: SaveState[];
  log: string[];
} {
  const states: SaveState[] = [];
  const log: string[] = [];
  return {
    states,
    log,
    hooks: {
      onState: (state) => states.push(state),
      onReload: (content) => log.push(`reload:${content}`),
      onConflict: (file) => log.push(`conflict:${file}`),
      onMissing: () => log.push("missing"),
      onError: (message) => log.push(`error:${message}`),
    },
  };
}

describe("Persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("writes once the user stops typing", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    p.schedule("edited");
    expect(rec.saves).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(400);

    expect(rec.saves).toEqual([{ content: "edited", baseHash: "h0" }]);
    expect(h.states.at(-1)).toBe("saved");
  });

  it("does not postpone the write forever while typing continues", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    // A keystroke every 300 ms never lets the 400 ms debounce expire.
    for (let i = 0; i < 20; i++) {
      p.schedule(`text ${i}`);
      await vi.advanceTimersByTimeAsync(300);
    }

    expect(rec.saves.length).toBeGreaterThan(0);
  });

  it("flushes on demand without waiting for the debounce", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    p.schedule("edited");
    await p.flush();

    expect(rec.saves).toEqual([{ content: "edited", baseHash: "h0" }]);
    expect(p.isDirty()).toBe(false);
  });

  it("reports a conflict copy the backend wrote", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    rec.nextSave(
      Promise.resolve({ hash: "h1", conflictFile: "notes.conflict-1.md" }),
    );
    p.schedule("ours");
    await p.flush();

    expect(h.log).toContain("conflict:notes.conflict-1.md");
  });

  it("keeps the text dirty when the write fails", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    rec.nextSave(Promise.reject(new Error("disk is full")));
    p.schedule("edited");
    await p.flush();

    expect(h.states.at(-1)).toBe("error");
    expect(h.log.some((line) => line.startsWith("error:"))).toBe(true);
    expect(p.isDirty()).toBe(true);
  });

  it("stops writing once disabled", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    p.disable();
    p.schedule("edited");
    await vi.advanceTimersByTimeAsync(6000);

    expect(rec.saves).toHaveLength(0);
  });

  /**
   * The generation guard. A write in flight when the note file changes must
   * not put the old file's hash onto the new one.
   */
  it("ignores a write that lands after the note file changed", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "old text", "old-hash", h.hooks);

    let land: (result: NoteSave) => void = () => {};
    rec.nextSave(
      new Promise<NoteSave>((resolve) => {
        land = resolve;
      }),
    );

    p.schedule("old text edited");
    await vi.advanceTimersByTimeAsync(400);
    expect(rec.saves).toHaveLength(1);

    // The user picks another file while that write is still in the air.
    p.reset("new file text", "new-hash");
    land({ hash: "stale-hash", conflictFile: null });
    await vi.advanceTimersByTimeAsync(0);

    // The next write must compare against the NEW file, not the stale result.
    p.schedule("new file edited");
    await p.flush();

    expect(rec.saves.at(-1)).toEqual({
      content: "new file edited",
      baseHash: "new-hash",
    });
  });

  it("starts writing again after a reset", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    // A read-only file stopped this instance for good, until it was pointed
    // at another one.
    p.disable();
    p.reset("another file", "h9");
    p.schedule("edited");
    await p.flush();

    expect(rec.saves).toEqual([{ content: "edited", baseHash: "h9" }]);
  });
});

describe("Persistence.checkExternal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reloads text that changed outside QuickNote", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    rec.nextCheck({
      changed: true,
      content: "someone else wrote this",
      hash: "h-external",
      missing: false,
    });
    await p.checkExternal();

    expect(h.log).toContain("reload:someone else wrote this");
  });

  /**
   * A silent recreation on the next keystroke looks like the note came back on
   * its own, so the deletion is reported and then written back.
   */
  it("reports a deleted file and writes it again", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "the text", "h0", h.hooks);

    rec.nextCheck({
      changed: false,
      content: "",
      hash: "h0",
      missing: true,
    });
    await p.checkExternal();

    expect(h.log).toContain("missing");
    expect(rec.saves).toHaveLength(1);
  });

  it("leaves the file alone while the editor holds unsaved text", async () => {
    const rec = recorder();
    const h = hooks();
    const p = new Persistence(rec.backend, "start", "h0", h.hooks);

    rec.nextCheck({
      changed: true,
      content: "external",
      hash: "h-external",
      missing: false,
    });
    p.schedule("still typing");
    await p.checkExternal();

    // The write path performs the same comparison and copies the external text
    // aside, so a reload here would throw away what the user just typed.
    expect(h.log).not.toContain("reload:external");
  });
});

# Contributing to QuickNote

Thank you for looking. QuickNote is small on purpose, and keeping it small is
most of the work.

## The one question

Every change has to pass this:

> **Does this make QuickNote faster, simpler, or more comfortable for a quick
> note?**

If the answer is no, the change belongs in a fork rather than here. That is not
a judgement on the idea. Notion, Obsidian, and VS Code already exist and do
those things well.

## What will not be merged

Plugins, cloud sync, accounts, collaboration, AI features, a database,
workspaces, tabs, multiple notes, Kanban, graph view, backlinks, and tag
systems. These are listed in Section 27 of the product requirements document.
A pull request for any of them will be closed with thanks.

## What is very welcome

- Cursor, selection, and undo defects in the live-rendering layer. This is the
  hardest part of the application and the place bugs hide.
- Anything that loses a character of the user's text. Report these as security
  issues would be reported: quickly and with steps to reproduce.
- Startup time, typing latency, and memory.
- Markdown constructs that render wrongly or, worse, that a save rewrites.
- Platform behaviour on Windows and Linux, which get less use than macOS.

## Before you start something large

Open an issue first. A change that touches `src/editor/live-render.ts` or
`src-tauri/src/lib.rs` is worth agreeing on before it is written.

## Setting up

```bash
npm install
npm run tauri:dev
```

The first Rust compile takes several minutes.

To work on the editor alone, `npm run dev` opens it in a browser against a
`localStorage` stand-in for the filesystem.

## The rules the code follows

1. **The buffer is the Markdown source.** The rendering layer decorates. It
   never edits the document. A change that rewrites the user's text to make
   rendering easier is the wrong change.
2. **Unsupported syntax survives.** QuickNote does not render tables, but a
   pasted table must come back character for character after a save.
3. **Rust owns anything that can lose text.** The note path, the atomic write,
   the recovery scan, and the conflict copy stay in `src-tauri/src/lib.rs`. The
   frontend never builds a path and never touches the filesystem.
4. **The interface layer is a leaf.** `src/persistence.ts` and
   `src/editor/` must not import from `src/ui.ts` or `src/settings.ts`.
5. **No network.** QuickNote makes no outbound request. A dependency that
   phones home is a defect.

## Checks before you open a pull request

```bash
npm run typecheck
npm run build
cd src-tauri && cargo check && cargo clippy
```

Then run the application and use it to write a real note for a few minutes.
Most defects in a live-rendering editor only show up under a real cursor.

## Commit messages

Say what changed and why, in plain sentences. One instruction per sentence.
Reference the PRD section when a change follows from it, for example
"PRD Section 13".

## Reporting a bug

Include your operating system, whether you built from source or used a release,
what you typed, what you expected, and what happened. If text was lost, say so
in the first line and attach the note file if you can share it.

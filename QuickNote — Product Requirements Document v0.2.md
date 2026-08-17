# QuickNote — Product Requirements Document v0.2

| Field | Value |
|---|---|
| Status | In build |
| Supersedes | v0.1 |
| Date | 2026-08-15 |
| Visual reference | **Typora.** Seamless live preview, one centred column, hidden syntax, no panes. See D-11. |
| Language | English. The project is open source and accepts outside contributors, so the specification, the code, and the repository documents all use one language. |

---

## 0. Decision Log — what changed from v0.1

v0.1 described the product well but deferred the decisions that control whether the product can be built. This version makes those decisions. Each row states the decision and the reason.

| # | Question left open in v0.1 | Decision in v0.2 | Reason |
|---|---|---|---|
| D-01 | Which editing engine? | **CodeMirror 6** | The document model is the Markdown source itself. The file on disk stays byte-exact, and the cursor, the selection, and the undo history all address source positions. A rich-text model would re-serialize the file and rewrite the user's formatting. See §10. |
| D-02 | Which frontend framework? | **TypeScript with Vite. No UI framework in V1.** | The editor owns the DOM. The remaining interface is a status line, a find panel, and a settings sheet. A framework can be added later without touching the editor or the persistence layer. See §23. |
| D-03 | Where does the note live? | **`~/QuickNote/notes.md`, visible and configurable** | §11 requires the user to open the file in another editor, back it up, and commit it to Git. A hidden folder or an operating-system application-data folder defeats all three. |
| D-04 | Which operating systems ship in V1? | **macOS signed and notarized. Windows and Linux built from the same source, released unsigned.** | Signing certificates cost money and add release delay. macOS is the primary development and dogfooding platform, so it gets the paid path first. |
| D-05 | Which license? | **MIT** | §26 asks for a project that is easy to use, fork, and extend. MIT is the shortest and the most familiar permissive license. |
| D-06 | What is the global shortcut? | **`Ctrl+N` on every platform. Configurable in V1.** | `⌘⇧Space` sits beside Spotlight and the input-source switcher. The operating system cannot report that another application already owns a combination, so the user must be able to change it. Configurability moves from "a later version" into V1. |
| D-07 | What happens when the file changes outside QuickNote? | **Defined conflict rule. Nothing is ever lost.** | v0.1 invited the user to edit the file elsewhere and then never said what happens. See §13. |
| D-08 | Does the application stay running after the window closes? | **Yes. Close hides the window. Quit exits.** | The global shortcut must open a window in under 300 ms. A cold process start cannot meet that. See §14. |
| D-09 | How big is "a normal document"? | **Typical 5,000 words. Stress 200,000 characters.** | §24 sets memory and latency budgets. A budget without a document size cannot be tested. |
| D-10 | What does "no noticeable lag" mean? | **Keystroke to painted frame under 16 ms at the typical size.** | Every acceptance criterion in this version carries a number or a yes/no observation. |
| D-11 | What should it look like? | **Typora is the visual and interaction reference.** | Typora already solved the look this product wants: one centred column, seamless live preview, syntax that disappears, and nothing else on screen. Naming a reference removes a hundred small style arguments. It is a reference for *feel*, not a feature list — §27 still governs scope. Two consequences: images render inline (D-12), and the interface keeps no permanent chrome beyond one save word. |
| D-12 | Do images render? | **Local images render inline. Remote URLs stay as a styled link.** | Inline images are part of the Typora feel. Loading a remote URL would be an outbound network request, which §25 forbids, so remote references keep their link form and the user can still read the address. |
| D-13 | Is there a throwaway prototype first? | **No. The editing engine is built inside the real application.** | v0.2 named CodeMirror 6 and gave the engine a checklist. Building that checklist twice buys nothing. §30 keeps the checklist as a verification gate on real code. |

---

## 1. Product Overview

**QuickNote** is an open-source desktop application for **Markdown quick notes** with a minimal writing experience.

The user opens the application, types, and closes it. Markdown renders **inside the editor**, so the user never switches between a source pane and a preview pane.

QuickNote saves the note automatically. The note is still there when the user opens the application again.

### Product Statement

> **Type it. Close it. It's still there.**

---

## 2. Product Vision

QuickNote is a **digital sheet of paper that is always available**, with the power of Markdown.

QuickNote does not replace Notion, Obsidian, or VS Code.

QuickNote must feel:

- fast
- light
- simple
- unobtrusive
- persistent
- keyboard-friendly
- offline-first
- open source

---

## 3. Problem

Existing Markdown applications carry one or more of these problems:

1. They are too complex.
2. They add a sidebar, a workspace, tabs, and plugins that a quick note does not need.
3. Their Markdown editor feels like a code editor.
4. They demand several steps before the user can type the first word.
5. Small notes end up scattered across many applications.

QuickNote solves this with **one place for quick notes that is always available**.

---

## 4. Target User

### Primary User

A person who writes many small notes and needs one place to keep them.

Examples: ideas, TODO items, meeting notes, snippets, commands, reminders, drafts, study notes, temporary information, and checklists.

### Secondary User

A Markdown user who wants an editor that is far simpler than a full Markdown application.

---

## 5. Core Experience

```text
Open QuickNote
      ↓
The editor is ready
      ↓
Type
      ↓
Markdown renders as you type
      ↓
Autosave
      ↓
Close
      ↓
Open again
      ↓
The note is still there
```

QuickNote must never require this flow:

```text
Open → Select workspace → Select folder → Create document → Select template → Start writing
```

---

## 6. Design Principles

### 6.1 Instant
The application is ready to use as soon as it opens.

### 6.2 Minimal
Every interface element must have a clear reason. If a feature is not necessary for a quick note, leave it out.

### 6.3 Persistent
The user never thinks about a Save button. QuickNote saves every change automatically.

### 6.4 Markdown-native
Markdown is the primary data format, not an export format.

### 6.5 Distraction-free
The editor is the centre of the application. The normal state shows no sidebar and no large toolbar.

### 6.6 Local-first
The note stays on the user's computer. QuickNote needs no account, no internet, no cloud, and no server.

### 6.7 Never lose text
QuickNote must not lose a character that the user typed, in any failure. This principle outranks every other principle in this section. §12 and §13 implement it.

---

## 7. Glossary

| Term | Meaning in this document |
|---|---|
| **Note** | The Markdown text the user writes. QuickNote V1 holds exactly one note. |
| **Note file** | The file on disk that stores the note. Default `~/QuickNote/notes.md`. |
| **Source** | The raw Markdown characters in the note file. |
| **Construct** | One Markdown element, such as a heading, a bold span, a list item, or a fenced code block. |
| **Mark** | The syntax characters of a construct, such as `**`, `# `, or the backticks of a fence. |
| **Live rendering** | Styling a construct in place and hiding its marks, while the source stays unchanged. |
| **Reveal** | Showing the marks of a construct again, because the cursor entered its line or block. |
| **Atomic write** | Writing to a temporary file, then renaming that file over the note file. The note file is never observed half-written. |
| **Recovery file** | The temporary file that an atomic write leaves behind when the application stops mid-write. |
| **External change** | A change to the note file made by another program while QuickNote holds the file open. |
| **Conflict** | An external change that arrives while QuickNote holds unsaved edits. |
| **Conflict copy** | A dated copy of the external version that QuickNote writes before it saves the user's version. |
| **Flush** | Writing pending changes to disk immediately, without waiting for the autosave delay. |
| **Resident** | The application process keeps running after the window closes. |
| **Typical document** | 5,000 words. The size used for latency and memory budgets. |
| **Stress document** | 200,000 characters. The size used for the upper bound of those budgets. |

---

## 8. User Interface

```text
┌───────────────────────────────────────────┐
│                                           │
│                                           │
│  # Meeting Notes                          │
│                                           │
│  Tomorrow meeting with the **design       │
│  team**.                                  │
│                                           │
│  - Review prototype                       │
│  - Discuss navigation                     │
│  - Finalize typography                    │
│                                           │
│                                           │
│                                    Saved  │
└───────────────────────────────────────────┘
```

### Default state

The default interface shows no sidebar, no file explorer, no tabs, no ribbon, no permanent toolbar, and no preview pane.

The editor fills the window.

### The only permanent chrome

One save-state indicator sits in a corner. It shows four states: `idle`, `saving`, `saved`, and `error`. It uses one word and no icon. The `error` state is the only state that draws attention with colour.

### Transient surfaces

Three surfaces appear on demand and close with `Esc`:

1. **Find panel** — `Ctrl/Cmd + F`. See §18.
2. **Settings sheet** — `Ctrl/Cmd + ,`. See §21.
3. **Notice line** — a single line of text for a conflict or an error. See §13 and §22. It never blocks typing and it never takes focus.

---

## 9. Markdown Editing

QuickNote uses **live rendering**.

### The reveal rule

QuickNote reveals marks **by line** for inline constructs, and **by block** for block constructs.

- The cursor sits on a line → that line shows its marks and stays editable as plain source.
- The cursor sits inside a fenced code block, a blockquote, or a table → the whole block shows its marks.
- Every other line renders with its marks hidden.
- **A selection that spans text reveals nothing.** Revealing marks makes a line longer, and text that grows under a dragging mouse cannot be aimed at. Only a plain cursor reveals.

Example. The source is:

```markdown
This is **bold** text.
```

With the cursor on another line, the editor paints:

> This is **bold** text.

With the cursor on this line, the editor paints the source, including the `**` marks.

The source never changes when the cursor moves. Only the painting changes.

### Dialect — V1

| Construct | V1 rendering |
|---|---|
| Heading, levels 1 to 6 | ✅ |
| Bold | ✅ |
| Italic | ✅ |
| Strikethrough | ✅ |
| Ordered list | ✅ |
| Unordered list | ✅ |
| Task list (`- [ ]`, `- [x]`) | ✅ |
| Blockquote | ✅ |
| Inline code | ✅ |
| Fenced code block | ✅ Highlighted by the info string — see below |
| Link | ✅ |
| Image | ✅ Local files render inline. A remote URL keeps its link form — see D-12. |
| Horizontal rule | ✅ Drawn as a rule |
| Table | Painted as an aligned monospaced grid with dimmed pipes. Not drawn as a real table. |
| Callout | ✅ `:::success` … `:::` — see below |

### Lists

A list is the construct a quick note reaches for most, so it has to look right.

**The indent comes from the syntax tree, not from the text.** Markdown carries nesting as leading spaces, and a space in a proportional serif is about a quarter of an em. Two spaces of source therefore read as no indent at all, and three levels of a list collapse into a ragged left edge. QuickNote instead asks the parser how deep each item is and indents by one full step per level. The step is `--list-indent`, one value that the renderer and the stylesheet both read.

**The marker column has one width.** A bullet, an ordered number, and a task checkbox all fill the same column, so the text of every item in a list begins on the same vertical line no matter which marker it carries.

**A wrapped item hangs.** The second visual line of a long item starts under the item's own text, not under its bullet. This is what separates one item from the next when both wrap, and it is the difference between a list that reads as a list and a list that reads as a paragraph with dots in it.

**Nothing in the file is hidden to achieve this.** The leading spaces stay in the buffer and stay on screen. They add the same small offset at every level, so the step between levels stays even, and the cursor can still be placed anywhere in the indent. Hiding the indent would put the cursor inside replaced text, which Section 10 forbids.

### Code highlighting

A fenced block is highlighted according to its info string:

````text
```php
<?php class Car {}
```
````

A block with **no** info string is not highlighted. That is not a limitation to work around — the info string is the author's statement of what the code is, and guessing at it would colour a block wrongly and silently. The language name stays visible on the block's top edge, so the reason a block is or is not coloured is always on screen.

Every grammar is a separate dynamic import. Nothing is loaded until a note actually contains that language, so startup cost is zero for languages the user never writes.

### Callouts

```text
:::success
Ship it.
:::
```

QuickNote paints this as a tinted block with a coloured left edge and an uppercase kind label. Five palettes cover every kind: **success**, **info**, **warning**, **danger**, and **neutral**. `tip` and `done` map onto success, `note` and `important` onto info, `caution` onto warning, `error` and `bug` onto danger. An unrecognised kind renders neutral rather than failing.

Three rules make this safe to add to a product that promises a plain Markdown file:

1. **The grammar never sees it.** `:::` is not CommonMark, so the Markdown parser reports these lines as ordinary paragraph text. QuickNote finds callouts with its own line scan and only paints them.
2. **The file stays literal.** Another editor shows `:::success` as text and never rewrites it. Nothing is lost and nothing is corrupted.
3. **A `:::` inside a fenced code block stays code.** The scanner tracks fence state, so a callout marker in an example is never captured.

The content inside a callout is ordinary Markdown, so bold, links, lists, and inline code all render there as usual.

The dialect is CommonMark plus the GitHub task list and strikethrough extensions.

**Why the table is the one deliberate difference from Typora.** Typora draws a real table. Drawing one here means replacing the block with a widget, which takes the cursor out of the source and breaks the model in §10 that keeps the file exact. A monospaced grid aligns its columns, stays fully editable as text, and never rewrites the user's file. A real table is a V1.1 item, not a V1 compromise.

**Round-trip requirement.** QuickNote must preserve every character of any Markdown the user pastes, including the constructs it does not render. A table must survive an open, an edit elsewhere in the document, and a save, character for character. Rendering coverage is a display choice. Data preservation is not.

**A note on priorities.** The editing experience matters more than dialect completeness.

---

## 10. Editing Engine — the core decision

This section records D-01. It is the most important engineering decision in the document.

### The decision

QuickNote uses **CodeMirror 6** with a decoration layer for live rendering.

### Why a source-model editor and not a rich-text editor

Two families of editor can produce live Markdown rendering.

| | Source model (CodeMirror 6) | Rich-text model (ProseMirror, Tiptap) |
|---|---|---|
| The document in memory is | the Markdown source | a tree of rich-text nodes |
| Saving means | writing the buffer | serialising the tree back to Markdown |
| Unsupported syntax | survives untouched | is dropped or rewritten |
| Cursor and undo address | source positions | tree positions |
| Rendering is | a paint layer over the text | the document itself |

§11 promises the user that the note file is plain Markdown that other editors can open. §9 promises that a pasted table survives. A rich-text model breaks both promises, because every save rewrites the file from a tree that never held the original bytes. That model reformats lists, normalises emphasis characters, and silently discards anything its schema does not know.

The source model keeps the file exact. This is the promise the product is built on, so the editor family follows from the promise.

### How live rendering works

The rendering layer never edits the document. It only decorates it.

1. Parse the visible range with the Lezer Markdown grammar that CodeMirror ships.
2. For each construct outside the revealed line or block, add a `Decoration.replace` over its marks, so the marks take no width.
3. Add a `Decoration.mark` over its content to carry the style.
4. Recompute decorations when the document changes, when the selection moves, and when the viewport scrolls.

Because the marks are hidden and not deleted, the buffer and the file always hold the full source.

### Behaviours the engine must define

Phase 0 is complete only when each of these behaves correctly. §30 gates the roadmap on this list.

| Behaviour | Required result |
|---|---|
| Cursor moves into a rendered construct | The construct reveals its marks. The cursor lands on the source offset the user aimed at. |
| Arrow key crosses a hidden mark | One key press moves one visible position. The cursor never stops inside a hidden mark. |
| Selection spans several constructs | Every touched line reveals. The copied text is the source, including marks. |
| `Backspace` at the start of a list item | The item loses its list mark and becomes a paragraph. |
| `Backspace` immediately after a hidden mark | The whole mark is removed as one unit, not one character of it. |
| `Enter` inside a list | A new item appears with the same mark and the same indent. |
| `Enter` on an empty list item | The mark is removed and the list ends. |
| Paste of Markdown text | The text is inserted as source and renders immediately. |
| Paste of rich text from a browser | The text is inserted as plain text in V1. |
| Undo and redo | One step reverses one user action. Autosave never creates a step. Rendering never creates a step. |
| Markdown input shortcuts | `# `, `- `, `> `, `1. `, and `- [ ] ` at the start of a line begin the construct. |

---

## 11. Persistence and File Layout

The note file is the storage. QuickNote uses no database. No SQLite, no IndexedDB, and no remote store.

### Layout

```text
~/QuickNote/
└── notes.md                     the note — the user's data
```

Application state lives elsewhere, in the operating-system configuration directory:

```text
macOS    ~/Library/Application Support/QuickNote/
Windows  %APPDATA%\QuickNote\
Linux    ~/.config/quicknote/

├── config.json                  user settings — see §21
└── session.json                 cursor, scroll, and window state — see §21
```

The note directory is **visible and configurable**. The user can point QuickNote at any path, including a folder that is already a Git repository.

**The note must never be stored in `config.json` or `session.json`.**

### Why this split

The note is the user's document, so it sits where the user can reach it, back it up, and commit it. Settings and window state are the application's own bookkeeping, so they sit in the operating system's directory for that purpose. This split also means that deleting the application's state directory never destroys a note.

### File format

The note file holds standard Markdown and nothing else:

```markdown
# Meeting

- Review prototype
- Talk with the design team

Remember to send the proposal.
```

QuickNote writes no front matter, no header, and no metadata into the note file. The user can therefore:

- open the file in another editor
- back it up by copying it
- commit it to Git
- move it to another computer
- read it without QuickNote

No proprietary format is allowed for the user's data.

---

## 12. Autosave, Atomic Write, and Recovery

### Autosave

```text
User types
   ↓
400 ms without a keystroke
   ↓
Atomic write
   ↓
Indicator shows "Saved"
```

QuickNote also flushes immediately on each of these events:

- the window loses focus
- the window hides or closes
- the application quits
- the user presses `Ctrl/Cmd + S`
- 5 seconds have passed since the last write while the user keeps typing without a pause

The 5-second rule bounds the worst case. Continuous typing must never leave text unwritten for longer than that.

Autosave must be asynchronous. It must never block a keystroke, freeze the interface, or add a visible delay to rendering. The 400 ms delay applies to the disk write only. It never applies to rendering.

### Atomic write

Every write follows three steps:

1. Write the full content to `notes.md.tmp`.
2. Rename `notes.md.tmp` over `notes.md`.
3. Remove the temporary file if it survives the rename.

The note file is never observed in a partly written state, so a power loss during a write cannot truncate the note.

### Recovery on startup

```text
1. Create the note directory. Report a failure loudly.
2. If notes.md.tmp exists:
   a. notes.md is missing        → promote the .tmp file
   b. .tmp is newer than notes.md → promote the .tmp file
   c. otherwise                   → delete the stale .tmp file
3. If notes.md is missing        → create it empty
4. Read notes.md
```

A crash therefore costs at most the text typed since the last write, and never costs the whole note.

### Close behaviour

```text
Check for unsaved changes
       ↓
Flush and wait for the write to finish
       ↓
Close
```

QuickNote must not show a "Save?" dialog in normal operation. The only dialog allowed at close is an error report when the write itself failed. See §22.

---

## 13. External Change and Conflict

§11 invites the user to edit the note file in another editor and to commit it to Git. QuickNote must therefore handle a file that changed underneath it.

QuickNote compares a hash of the note file against the hash of the last version it wrote. It performs this check when the window gains focus, and again immediately before every write.

| State of the editor | Note file on disk | QuickNote does this |
|---|---|---|
| No unsaved changes | Unchanged | Nothing. |
| No unsaved changes | Changed externally | Reload the file into the editor. Keep the cursor at the same line if that line still exists. Show a notice: `Reloaded — the file changed outside QuickNote`. |
| Unsaved changes | Unchanged | Write normally. |
| Unsaved changes | Changed externally | **Conflict.** Copy the disk version to `notes.conflict-YYYYMMDD-HHMMSS.md` in the note directory. Then write the editor version to `notes.md`. Show a notice: `Your version was kept — the external version is in notes.conflict-….md`. |

The conflict rule keeps the text the user is looking at, and it keeps the external version on disk. Neither version is ever lost. QuickNote never merges automatically and never shows a blocking dialog.

QuickNote does not watch the file continuously in V1. Checking on focus and before each write is sufficient, because a note the user cannot see is a note the user is not editing.

---

## 14. Startup, Residency, and Close

### Residency

QuickNote stays resident after the window closes. Closing the window hides it. `Ctrl/Cmd + Q` quits the process.

This decision follows from §15. A global shortcut must present a ready editor in under 300 ms, and a cold process start cannot meet that budget on any of the three platforms.

QuickNote runs as a tray application on every platform. It shows a tray icon — the macOS menu bar, the Windows notification area, the Linux status area — and it shows no Dock icon and no taskbar button. On macOS `LSUIElement` in `Info.plist` and `ActivationPolicy::Accessory` at runtime set this policy; elsewhere `skipTaskbar` on the window does.

A left click on the tray icon toggles the window. A right click opens a menu with two items: **Open QuickNote** and **Quit QuickNote**. The quit item runs the same flush-then-exit sequence as `Ctrl/Cmd + Q`, so no write is cut short.

### Cold start

```text
Start the process
       ↓
Run recovery (§12)
       ↓
Read notes.md
       ↓
Render the document
       ↓
Restore cursor, scroll, and window position from session.json
       ↓
Focus the editor
```

The cursor is ready for typing at the end of this sequence. QuickNote shows no splash screen.

### Warm open

```text
Global shortcut or tray click
       ↓
Show and focus the existing window
       ↓
Check for external changes (§13)
       ↓
Focus the editor
```

### Single instance

Only one QuickNote process may run at a time. A second launch focuses the running window instead of opening a second one. Two processes writing one file would defeat §12 and §13.

---

## 15. Global Quick Note

### Default shortcut

| Platform | Default |
|---|---|
| Every platform | `Ctrl+N` |

One modifier and one letter. The user asked for a short combination, and a short combination is the reason the application feels close at hand.

The cost is real and the user accepted it. A global shortcut takes the combination away from every other application. On macOS `Ctrl+N` moves the cursor down one line in every text field, and QuickNote takes that behaviour away while it runs. Settings changes the combination, which is why §D-06 moved configurability into V1.

`⌘⇧Space` from v0.1 is rejected. It sits beside Spotlight (`⌘Space`) and beside the input-source switcher, and several input methods claim it.

### The shortcut is configurable in V1

The operating system cannot reliably report that another application already owns a key combination. On macOS, two processes can register the same combination and both receive the key press, with no error from either registration. QuickNote therefore cannot detect a collision and warn the user.

Because detection is impossible, **rebinding is the only remedy, so it ships in V1**. The settings sheet records a new combination from a key press and writes it to `config.json`.

### Permission

The global shortcut needs an Accessibility or Input Monitoring grant on macOS. QuickNote requests this grant **when the user first opens the settings sheet or first presses the shortcut**, never during startup. Startup must stay clear, per §6.1.

If the grant is missing, QuickNote still works as a normal window. The settings sheet shows one line explaining what the grant enables and a button that opens the correct system settings pane.

### Behaviour

```text
Shortcut pressed
   ↓
The window appears and takes focus
   ↓
The cursor is ready
```

Pressing the shortcut while the QuickNote window is already focused hides the window. The shortcut therefore toggles.

---

## 16. Window Behaviour

| Mode | Behaviour |
|---|---|
| Normal | A standard desktop window. QuickNote restores its last size and position from `session.json`. |
| Always on top | Off by default. The user can switch it on in settings. |

The v0.1 term "Quick Mode" is removed. It described window restore, which every launch already performs.

Default window size on first run is 800 × 800 logical points.

QuickNote stores window geometry in **logical points, never physical pixels**. Physical pixels halve the window on a 2× display and do not survive a move to a screen with a different scale factor.

---

## 17. Keyboard

QuickNote supports the mouse, but the whole application must be comfortable with the keyboard alone.

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Flush pending changes to disk now |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + F` | Open the find panel |
| `Ctrl/Cmd + G` | Find next |
| `Ctrl/Cmd + Shift + G` | Find previous |
| `Ctrl/Cmd + +` | Increase the font size by one step |
| `Ctrl/Cmd + -` | Decrease the font size by one step |
| `Ctrl/Cmd + 0` | Restore the default font size |
| `Ctrl/Cmd + ,` | Open the settings sheet |
| `Ctrl/Cmd + Enter` | Leave a code block, a quote, a table, or a callout |
| `Ctrl/Cmd + W` | Hide the window |
| `Ctrl/Cmd + Q` | Quit the application |
| `Esc` | Close the find panel, the settings sheet, or the notice line |
| `Ctrl+N` | Show, focus, or hide QuickNote from any application |

`Ctrl/Cmd + S` does not change the persistence model. QuickNote already saves without it. The shortcut exists because typists press it by habit, and pressing it must do something honest rather than nothing.

Markdown input shortcuts are listed in §10.

---

## 18. Find

Find works **within the open document only**. Search across many notes is not in V1, because V1 holds one note.

`Ctrl/Cmd + F` opens a single-line find panel. `Esc` closes it and returns focus to the editor at the current match.

The panel supports find next, find previous, and a match count. Replace is not in V1.

Find must reveal the marks of any line that holds a match, so the user sees the real source of the text they searched for.

---

## 19. Theme

QuickNote offers three settings: **light**, **dark**, and **system**. The default is **system**.

The icon in the top corner switches between light and dark only, and always to the opposite of what is on screen. It must never cycle through `system`: stepping from an explicit theme to `system` changes nothing whenever the operating system already resolves to that same appearance, and a click that changes nothing reads as a broken button. `system` is chosen in the settings sheet, where it is a choice rather than a step in a cycle.

| Theme | Background | Text |
|---|---|---|
| Light | Warm white | Dark grey |
| Dark | Dark grey | Light grey |

Neither theme uses pure white or pure black. QuickNote follows the operating-system theme when the setting is `system`, and it switches live when the operating system switches.

Body text must meet a contrast ratio of at least 7:1 against the background in both themes.

A theme marketplace and custom themes are not in V1.

---

## 20. Typography

Typography carries most of the "document, not source code" feeling.

| Property | Default |
|---|---|
| Prose typeface | **A serif.** `ui-serif`, which is New York on macOS, then Iowan Old Style, Charter, Georgia, and Palatino. A serif is what makes the window read as a page of prose rather than a text field. |
| Interface typeface | The system interface sans. It is used for the settings sheet, the find panel, and the notice line, so the chrome reads as part of the operating system and not as part of the note. |
| Code typeface | The system monospaced typeface. SF Mono, Cascadia Mono, or the system mono on Linux. |
| Body size | 17 px, adjustable from 12 px to 28 px |
| Line height | 1.72 |
| Line length | Capped at 72 characters, with the text column centred in the window |
| Heading scale | 1.6, 1.4, 1.2, 1.1, 1.0, 1.0 times the body size, each with clear space above |
| Paragraph spacing | 0.75 of the line height |

**QuickNote bundles no font files.** A font family costs several megabytes per weight, which works against §25. QuickNote reads a preference list of installed families and falls back to the system typeface.

Headings must differ by weight and spacing, not by colour alone.

---

## 21. Configuration and Session State

Two files, with two different purposes. Both live in the operating-system state directory listed in §11.

### `config.json` — the user's settings

```json
{
  "notePath": "~/QuickNote/notes.md",
  "theme": "system",
  "fontSize": 16,
  "alwaysOnTop": false,
  "globalShortcut": "Ctrl+N"
}
```

The user may edit this file by hand. QuickNote validates every field on load and falls back to the default for any field that is missing or invalid. An invalid file never blocks startup.

### `session.json` — the application's bookkeeping

```json
{
  "version": 2,
  "cursorOffset": 1284,
  "scrollTop": 420,
  "windowX": 120,
  "windowY": 80,
  "windowWidth": 800,
  "windowHeight": 800
}
```

`version` lets QuickNote discard stored state whose meaning has changed, without discarding the file. Geometry from an older version is replaced by the defaults; the cursor is kept, because its meaning did not change.

QuickNote writes this file on close and on window move. Losing this file costs the user nothing beyond a reset cursor and a default window position.

Both files are written with the atomic write from §12.

---

## 22. Error States

Every failure below must produce a visible, specific result. A silent failure is a defect.

| Failure | What QuickNote does |
|---|---|
| The note directory cannot be created | Show a blocking dialog with the path and the operating-system error. Offer a button to choose a different directory. Do not start with an editor the user believes is saving. |
| The note file cannot be read | Start with an empty editor and a notice line: `Could not read notes.md — your file was not changed`. Disable autosave until the user chooses an action. Never overwrite a file that failed to read. |
| A write fails | Set the indicator to `error`. Show a notice with the operating-system error. Retry on the next autosave. Keep the text in the editor. |
| A write fails at quit | Show a blocking dialog. Offer "Retry", "Save as…", and "Quit anyway". This is the one place a dialog may block, because quitting would otherwise discard the text. |
| The disk is full | Treated as a write failure. The atomic write means `notes.md` still holds the last good version. |
| The note file is read-only | Detect on startup. Show a notice and disable autosave until the user picks another path. |
| `config.json` is invalid | Load defaults, keep the broken file, and show a notice naming the file. |
| The global shortcut cannot be registered | Show one line in the settings sheet. The application continues as a normal window. |

---

## 23. Technical Architecture

| Layer | Choice |
|---|---|
| Shell | Tauri 2 |
| Backend | Rust |
| Frontend | TypeScript, built with Vite. No UI framework. |
| Editor | CodeMirror 6 |
| Markdown grammar | The Lezer Markdown grammar that CodeMirror ships |

### Rust handles

- filesystem access, including the atomic write and the recovery scan
- the note-path allowlist, so the frontend cannot reach outside the note directory and the state directory
- window management and single-instance enforcement
- the global shortcut registration
- reading and writing `config.json` and `session.json`

### TypeScript handles

- the editor and the live-rendering decoration layer
- the find panel, the settings sheet, and the notice line
- the theme
- the autosave scheduler and the conflict rule

### Why no UI framework

The editor owns its own DOM subtree and its own state. The remaining interface is one status word, one find panel, and one settings sheet. A framework would add a build step and a dependency for markup that three functions can produce. §27 removes the features that would later justify one.

This decision is reversible. The persistence layer and the editor layer must not import anything from the interface layer, so a framework can be introduced later without touching them.

### Data flow

```text
notes.md  ──read──►  Editor buffer (the Markdown source)
                          │
                          ├──parse──►  Syntax tree  ──►  Decorations  ──►  Painted document
                          │
                          └──400 ms idle──►  Atomic write  ──►  notes.md
```

The buffer is the single source of truth. The syntax tree and the decorations are derived and disposable. The file is the buffer, written out.

---

## 24. Performance and Size Budgets

Every number below is a target measured on the primary development machine. A number is a guardrail for engineering judgement, not a release gate on every operating system, because a WebView baseline differs by platform.

### Document sizes

| Name | Size |
|---|---|
| Typical document | 5,000 words, about 36 KB |
| Stress document | 200,000 characters |

### Latency

| Measurement | Target |
|---|---|
| Cold start to a ready cursor | Under 1,000 ms |
| Global shortcut to a ready cursor, resident | Under 300 ms |
| Keystroke to painted frame, typical document | Under 16 ms |
| Keystroke to painted frame, stress document | Under 33 ms |
| Autosave write, typical document | Under 20 ms, off the input path |

### Memory

| Document | Target resident set |
|---|---|
| Empty | Under 120 MB |
| Typical | Under 150 MB |
| Stress | Under 200 MB |

These figures assume the platform WebView, which carries most of the baseline. Measure them; do not estimate them.

### Application size

Keep the installed application as small as is reasonable. Tauri is chosen because it uses the platform WebView instead of bundling a browser. QuickNote bundles no fonts, per §20. Set a firm number after the Phase 0 prototype produces the first real build.

---

## 25. Offline and Privacy

QuickNote works completely without internet access. It requires no login, no telemetry, no cloud, and no remote API.

> **Everything stays local.**

V1 sends no note content, no telemetry, no analytics, and no usage data to any server. QuickNote makes no outbound network request at all. A build that opens a socket is a defect.

---

## 26. Open Source and License

### License: MIT

MIT is chosen over Apache-2.0 and GPL-3.0. §2 asks for a project that is easy to use, fork, and extend. MIT is the shortest and most familiar permissive license, and it adds no notice file to maintain.

### Repository contents

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
```

### Release targets

| Platform | V1 |
|---|---|
| macOS, Apple Silicon and Intel | Signed and notarized `.dmg` |
| Windows x64 | `.msi` and NSIS `.exe`, unsigned in V1 |
| Linux x64 | `.AppImage` and `.deb`, unsigned |

The README must state plainly that the Windows and Linux builds are unsigned, and must show the user how to get past the operating-system warning. Signing those platforms is a V1.1 item that costs money, not engineering.

---

## 27. Non-Goals

QuickNote is **not** Notion, Obsidian, VS Code, Evernote, a project management application, a collaboration tool, a cloud note service, or a knowledge management system.

Not in V1:

- plugin system
- cloud sync
- accounts
- collaboration
- AI features
- any database
- workspaces or multiple notes
- Kanban, graph view, backlinks, or a tag system
- PDF export or presentation mode
- table rendering (§9 still preserves tables)
- find and replace
- a menu-bar-only mode

---

## 28. MVP

The MVP must do six things very well:

```text
1. Open
2. Type
3. Render Markdown
4. Autosave
5. Close
6. Reopen
```

If those six feel perfect, the MVP has succeeded.

---

## 29. Acceptance Criteria

Each criterion states a test that a person can run and either pass or fail.

| ID | Criterion | Test |
|---|---|---|
| AC-01 | Open | Launch QuickNote. The last note is on screen and the cursor is ready, with no click and no dialog. |
| AC-02 | Type | Type immediately after launch. No document creation step is required. |
| AC-03 | Render | Type each construct in the §9 table. Each one renders, and its marks reveal when the cursor enters its line or block. |
| AC-04 | Persistence | Type text, quit, relaunch. The text is present. |
| AC-05 | Autosave | Type text, wait 1 second, then kill the process. Relaunch. The text is present. |
| AC-06 | Offline | Disable the network. Every feature works. A packet capture during a 10-minute session shows no outbound request. |
| AC-07 | Plain file | Open `notes.md` in another editor. It is standard Markdown with no added metadata. |
| AC-08 | Typing latency | Type continuously in the typical document. Keystroke to painted frame stays under 16 ms at the 95th percentile. |
| AC-09 | Minimal interface | The default window shows the editor and one save indicator. Nothing else. |
| AC-10 | Normal close | Type text and close the window with no pause. Reopen. The text is present, with no "Save?" dialog. |
| AC-11 | Crash recovery | Kill the process during a write. Relaunch. The note is either the last saved version or the recovered version. It is never truncated and never empty. |
| AC-12 | Round trip | Paste a Markdown table and a nested list. Edit a different paragraph. Save. Compare the table and the list against the original, character for character. They are identical. |
| AC-13 | External change, no local edits | Edit `notes.md` in another editor while QuickNote is open and clean. Focus QuickNote. The editor shows the new content and a notice. |
| AC-14 | Conflict | Type in QuickNote without saving. Edit `notes.md` elsewhere. Return to QuickNote and save. `notes.md` holds the QuickNote version, a conflict copy holds the external version, and a notice names that copy. |
| AC-15 | Global shortcut | Press the shortcut from another application. QuickNote appears and the cursor is ready in under 300 ms. |
| AC-16 | Shortcut rebinding | Change the global shortcut in settings. It takes effect without a restart and survives a restart. |
| AC-17 | Startup | Cold start reaches a ready cursor in under 1,000 ms with the typical document. |
| AC-18 | Undo | Type a sentence, wait for an autosave, then press undo. The sentence is removed in the same steps as if no save had occurred. |
| AC-19 | Write failure | Make the note directory read-only while QuickNote runs. Type. The indicator shows `error` and a notice names the problem. The text stays in the editor. |
| AC-20 | Theme | Switch the operating system between light and dark with the theme set to `system`. QuickNote follows within one second. |

---

## 30. Development Roadmap

### Phase 0 — Editing engine — **gated**

Build the Tauri window, CodeMirror 6, the decoration layer, and the §9 dialect. This is real application code, not a prototype to throw away. §10 already names the engine and lists what it must do, so building it twice buys nothing.

**Gate.** Phase 0 ends only when every behaviour in the §10 table is correct, and when the author has written real notes with it for one working day without fighting the cursor.

If the gate fails, stop and reconsider the engine before the rest of the application is built on it. §10 is the core technology; everything after it is assembly.

### Phase 1 — Persistence

The note file, the atomic write, recovery, the conflict rule, autosave, and the save indicator. Covers AC-04, AC-05, AC-07, AC-10, AC-11, AC-12, AC-13, AC-14, and AC-19.

### Phase 2 — Application shell

Themes, typography, the find panel, keyboard shortcuts, the settings sheet, `config.json`, and `session.json`. Covers AC-01, AC-02, AC-09, AC-17, and AC-20.

### Phase 3 — Quick note experience

Residency, single instance, the global shortcut, shortcut rebinding, the macOS permission flow, window restore, cursor restore, and optional always-on-top. Covers AC-15 and AC-16.

### Phase 4 — Release

Measure every budget in §24. Icons, packaging for three platforms, macOS signing and notarization, the four repository documents, and the first tagged release.

---

## 31. Definition of Done

QuickNote V1 is done when a person can:

> open the application → type a Markdown note immediately → see it render naturally → close the application → open it again hours later → find the note intact → and feel a light native application throughout, not an IDE.

The product is not the feature count.

**Simplicity, speed, persistence, and a natural Markdown experience.**

---

## 32. Product North Star

Every development decision must pass one question:

> **"Does this make QuickNote faster, simpler, or more comfortable for a quick note?"**

If the answer is no, the feature stays out of the core product.

---

## 33. Deliberately Open

Three items are open on purpose. None of them blocks Phase 0.

| Item | Decide by |
|---|---|
| The firm application size target | End of Phase 0, from the first real build |
| Windows and Linux code signing | Phase 4, a budget decision rather than an engineering one |
| A macOS menu-bar-only mode | After V1, based on how the author actually uses the global shortcut |

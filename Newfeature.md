# Feature Spec: Books, Reader, Favorites and Notes (v2)

Audience: an AI coding agent working inside the existing Vault repo (React Native + Expo, Android, APK built via GitHub Actions).

**Priority order:**

1. **The reader** (library, import, EPUB reader, bulletproof resume, favorites, notes under Books).
2. **Capture from other apps** (selection menu and share sheet).
3. Scan-from-paper (optional, last).

## 0. Ground rules

1. **Inspect the repo first.** Read the structure, navigation, storage layer, the existing Notes feature, folder model, backup/export code, theme, and which OCR library is already used. Reuse them. Do not introduce a second storage system or navigation pattern.
2. **Fully offline. No network of any kind.**
   - No API calls, no analytics, no crash-reporting SDKs, no accounts, no remote fonts, no remote scripts.
   - Every JavaScript, CSS, font and WebView asset the reader needs must be **bundled inside the app** and loaded locally. If a library (for example an epub.js wrapper) loads scripts or styles from a CDN, replace that with local copies and prove it by testing in airplane mode.
   - Acceptance test for every phase: with airplane mode on and no cached data, the feature works completely.
   - Optional hardening at the end: try removing the `INTERNET` permission from the release manifest. If the app still works fully, keep it removed. If something breaks, restore it and report why.
3. **Work in phases (Section 10).** Finish and test one phase before starting the next. Commit after each phase.
4. **Do not guess library APIs.** Check docs and installed versions first. If a library is unmaintained or incompatible with the installed Expo SDK, choose a maintained alternative and explain why in the phase report.
5. **Keep the UI minimal and fast.** Fewer taps beats more options. Do not add features not listed here (Section 11).
6. **Position is sacred.** The thing that must never fail is reopening a book exactly where the user stopped (Section 6).

## 1. Goal

Reading in the Vault should feel as good as a dedicated reader app:

- Import an EPUB or PDF, read it comfortably, and always come back to the exact spot.
- Favorite books, find them fast, and keep all notes, highlights and bookmarks for each book in one place under **Books**.
- Later (second priority), save text from other apps into the same per-book notes.

## 2. Data model

Adapt names and storage to existing conventions. If no SQLite is in use, prefer `expo-sqlite`. Use migrations, not destructive schema changes.

**Book**

- `id` (uuid), `title`, `author` (nullable)
- `type`: `epub` | `pdf` | `external` (`external` means a name only, with no file, used for notes captured from other apps)
- `filePath` (nullable, app-private storage), `coverPath` (nullable)
- `isFavorite` (bool, default false), `favoritedAt` (nullable)
- `addedAt`, `lastOpenedAt` (nullable)
- `progress`:
  - `epubCfi` (nullable string; **source of truth** for EPUB)
  - `percentage` (0 to 1)
  - `chapterLabel` (nullable)
  - `pdfPage` (nullable int, 1-based), `pdfTotalPages` (nullable int)
  - `updatedAt`
- `status` (derived): `unread` (0%), `reading`, `finished` (at or above 98%, or user marks finished)

**BookLocations** (EPUB only; cache)

- `bookId`, `locationsJson` (the generated epub.js locations list), `generatedAt`, `locationCount`
- Generate once, in the background, the first time a book is opened. Reuse afterwards. See 5.5.

**Quote** (highlight or saved text; this is what the user sees as "notes")

- `id`, `bookId` (nullable; null means Inbox), `text` (required)
- `epubCfiRange` (nullable), `pdfPage` (nullable), `pageLabel` (nullable free text)
- `color` (one of 4: yellow, green, blue, pink; default yellow)
- `userNote` (nullable)
- `source`: `reader` | `selection_menu` | `share` | `scan`
- `createdAt`

**Bookmark**

- `id`, `bookId`, `epubCfi` (nullable), `pdfPage` (nullable), `label` (chapter name or "Page N"), `percentage`, `createdAt`

**ReaderSettings** (global, a single record)

- `theme`: `light` | `sepia` | `dark` | `black`
- `fontFamily`, `fontSize`, `lineHeight`, `margin` (small/medium/large), `textAlign` (left/justify)
- `keepScreenOn`, `brightness` (nullable, meaning "use system"), `tapZonesEnabled`

**Rules**

- Deleting a book asks whether to also delete its quotes and bookmarks. Default: keep quotes (they move to the Inbox), delete bookmarks.
- Saving the exact same text to the same book within a few seconds is treated as a duplicate and ignored.

## 3. Screens and navigation

Add a **Books** section, separate from the document folders. Match the existing navigation pattern.

### 3.1 Books library (home of the section)

- Top row: **Continue reading**: a large card for the most recently opened book, with cover, title, percentage, "Page X of Y" or chapter, and a Resume button. One tap opens the reader at the saved spot.
- Filter chips: **All | Favorites | Reading | Finished**.
- Sort: Recently read (default), Title, Date added.
- Grid of books: cover, title, thin progress bar, and a heart icon to toggle favorite right on the card.
- A "+" button imports an EPUB or PDF. An "Inbox" entry appears whenever it has unassigned quotes.
- Empty state: a short explanation and an Import button.
- Long press a book: Favorite/Unfavorite, Mark finished, Rename, Delete.

### 3.2 Book detail

- Header: cover, title, author, heart toggle, progress, "Continue reading" button (if a file exists).
- Tabs: **Notes** (default) | **Bookmarks**.
  - **Notes** tab: all quotes and highlights for this book, ordered by position in the book (default) or newest first (toggle). Each row shows the text, color dot, page/chapter label and the user's note if present. Tap to open the editor; tap "Go to" to open the reader at that spot; long press for copy and delete. A search field filters by text and note.
  - **Bookmarks** tab: list of bookmarks; tap to jump; swipe to delete.
- Menu: Export notes (Markdown), Mark finished, Rename, Delete book.
- Integrate with the existing Notes feature: reuse its components and style. If the existing Notes design conflicts with this spec, keep the existing design and tell the user.

### 3.3 Quote editor

Bottom sheet with the editable text, color picker (4 colors), personal note, book picker (change book), and Delete.

### 3.4 Inbox

Quotes with no book. Each has "Move to book". (Used mainly by Phase 3.)

### 3.5 Global notes search

One search box across all quotes in all books, showing the book name on each result.

## 4. Importing books

- Use the system document picker for `.epub` and `.pdf`. Copy the file into app-private storage so deleting it from Downloads never breaks the book.
- Extract title, author and cover from EPUB metadata when present. For PDFs, use the filename as the title and render page 1 as the cover if feasible, otherwise use a generated placeholder cover (title on a colored background).
- Import runs off the main thread with a progress indicator. Duplicate detection: if a file with the same name and size already exists, ask "Import again?".
- **DRM or invalid files:** if an EPUB cannot be parsed or is encrypted, show: "This book is protected or unreadable. Only DRM-free EPUB and PDF files can be opened." Do not crash and do not leave a broken entry.

## 5. EPUB reader (full feature set)

### 5.1 Rendering

- Render with epub.js inside a WebView, with all assets bundled locally (see Ground rule 2). A maintained React Native wrapper may be used if it can work with no network. Otherwise build a thin custom WebView page.
- Paginated reading (not continuous scroll) as the default. Optional setting: scrolled mode.
- Page turns: tap left/right zones (about 30% of the width each side) and horizontal swipe. Center tap toggles the UI. Page turns must feel immediate: no visible flicker, blank flash, or layout jump.
- Respect the system status/navigation bars. Immersive mode while reading (UI hidden), restored when the UI is toggled.

### 5.2 Typography and appearance (this decides whether reading feels good)

- Themes: **Light, Sepia, Dark, Black (AMOLED)**. The theme applies to the page, UI chrome and the selection toolbar.
- Font size: smooth slider with a live preview, plus A- / A+ buttons.
- Font family: bundle at least 4 fonts locally (for example one serif, one sans-serif, one dyslexia-friendly, and the system default). Include a font that renders **Devanagari and Gujarati** properly, or confirm the system font does.
- Line spacing, margins (small/medium/large) and text alignment (left/justify). Hyphenation on when available.
- In-reader brightness slider (adjusts the app window brightness only; "System" option resets it). Keep screen awake while the reader is open (setting, default on).
- Changing any setting re-flows the text **while keeping the reader on the same spot** (anchor to the current CFI, not to a page index).
- Settings are global. Remember them across launches.

### 5.3 Navigation inside the book

- **Table of contents** screen. Tap a chapter to jump; the current chapter is highlighted.
- **Progress bar / slider** at the bottom (when the UI is visible): drag to scrub, with a floating preview of the chapter or page label. Releasing jumps there; a small "Back to where you were" chip appears for a few seconds so the user can undo an accidental jump.
- Footer shows: chapter title, "Page X of Y" (see 5.5) and percentage; optionally "N min left in chapter" (estimate from a reading-speed constant, no tracking).
- **In-book search**: full-text search with a result list (snippet plus chapter), tap to jump, highlights the match, with next/previous.
- **Bookmarks**: a bookmark icon in the top bar toggles a bookmark at the current spot. The icon is filled when the current page is bookmarked.
- Internal links and footnotes inside the book work. Tapping a footnote link shows it in a popup if feasible, otherwise jumps there and offers "Back".
- Images are shown scaled to fit the page; tapping an image opens it full-screen with pinch zoom.

### 5.4 Selection, highlights and notes

- Selecting text shows a floating toolbar with: **4 highlight color dots**, **Note**, **Copy**, **Share** (Android share sheet).
  - Tapping a color saves the selection as a Quote for this book (`source: reader`, `epubCfiRange` set), draws the highlight, and shows a brief confirmation.
  - **Note** saves the highlight and opens the note field.
- Highlights are drawn on the page and re-applied every time the book opens.
- Tapping an existing highlight shows: change color, edit note, copy, delete.
- A quote's "Go to" action opens the reader at that highlight.

### 5.5 Page numbers (be honest about what they are)

- EPUBs reflow, so "pages" change with font size. The **CFI is the real position**. "Page X of Y" is a convenience display.
- Use epub.js locations to compute an approximate stable "page" count that does **not** change when the user changes font size (for example about 1000 characters per location). Show it as "Page X of Y".
- Generate locations in a background task on first open and cache them in `BookLocations`. Show percentage only until they are ready. Never block opening the book on this.
- If locations are missing or fail, fall back to percentage and chapter name without errors.

### 5.6 Other reader behaviors

- Orientation: follows system, with a lock toggle in the reader menu.
- Optional (only if simple and reliable): turn pages with volume keys, as a setting that is off by default.
- Finishing the last page marks the book `finished` and shows a small "Finished" message.

## 6. Resume position: highest-priority requirement

The user must **always** return to exactly where they stopped.

**What to save** (to `Book.progress`): `epubCfi`, `percentage`, `chapterLabel`, `updatedAt` (EPUB) or `pdfPage`, `pdfTotalPages`, `percentage` (PDF).

**When to save:**

1. On every location change, **debounced to about 500 ms**.
2. Immediately (no debounce) when the reader screen unmounts, when the Android back button is pressed, and when the app state changes to `background` or `inactive`.
3. After a successful jump (TOC, search, slider, bookmark, quote "Go to").
4. Every 15 to 30 seconds while the reader is open as a safety net.

**How to save:** a single small write to the local database, atomic (one transaction). Never write partial progress. A failure must not crash the reader. Retry once, then log locally.

**How to restore:**

- Open at the saved `epubCfi`. If the CFI does not resolve (for example the book file changed), fall back to `percentage`, then to the start. Never open at the start without trying these first.
- PDF: reopen at `pdfPage`.
- After restoring, scroll or position must match within the same page. A visible "jump" or flash of the first page before the saved position is a bug: show a loading state (the cover, or a blank themed page) until the saved position is ready.
- Surface resume everywhere: the "Continue reading" card, the book card progress, Book detail.

**Must-pass tests (do these on a real device, not only an emulator):**

- Read to the middle of a chapter, close the reader with the back button, reopen: same spot.
- Read, press Home, then **force-stop the app** from system settings, reopen: same spot.
- Read, change the font size, close, reopen: same spot (same text on the page).
- Read, rotate the device, close, reopen: same spot.
- Read, **reboot the phone**, reopen: same spot.
- Switch between two books several times: each reopens at its own spot.
- Backup, restore on a clean install: positions are restored too.

## 7. PDF reader

- Use a native PDF viewer (for example `react-native-pdf`; it needs a dev build or prebuild, which the GitHub Actions APK flow already does). Check compatibility first, and make sure it needs no network.
- Required: vertical or horizontal page mode, page jump (type a number), pinch zoom, double-tap zoom, current page indicator ("Page N of M"), PDF outline/table of contents if the file has one, and **resume page** (Section 6).
- Dark appearance: if the viewer supports it, offer a night mode (inverted colors). If it does not, skip it and note it.
- Bookmarks work (store `pdfPage`).
- **Text selection limitation:** native PDF viewers usually do not support selecting text. Do not fake it. Provide **"Capture from this page"**:
  1. Get the text of the current page: from the PDF text layer if the file has one, otherwise by running the existing on-device OCR on a render of the page.
  2. Show the result as selectable lines. The user taps the lines to include, picks a color, optionally adds a note, and saves. The Quote gets `source: reader` and `pdfPage` set.
  3. **OCR must be bundled and offline.** If the OCR library normally downloads its model on first use (for example the unbundled Google ML Kit models), switch to the bundled variant. Verify in airplane mode on a fresh install.
- If this is too slow or inaccurate on real PDFs, ship PDF with page-resume and bookmarks only, and report it.

## 8. Capture from other apps (second priority; Phase 3)

All of this is offline and local.

### 8.1 Share sheet intake (text)

Register an intent filter for `ACTION_SEND` with `text/plain` (extend the existing share handler if the app already receives shared files). Incoming text opens the Quick Save sheet (8.3).

### 8.2 Selection-menu intake (`PROCESS_TEXT`)

- Add an intent filter for `android.intent.action.PROCESS_TEXT` with `text/plain` using an Expo config plugin so it survives prebuild.
- Android passes the text in `Intent.EXTRA_PROCESS_TEXT`. Reading it from JavaScript needs native code: write a small local Expo module or config-plugin-injected activity (Kotlin) that reads the extra and hands it to the Quick Save UI.
- Prefer a **translucent, dialog-style activity** so the user stays visually in the reading app and returns to it after saving. Launch the full app only if that is the only option.
- Menu label: **"Save to Vault Notes"**.
- Known limitation: some apps (notably Kindle) may not show third-party selection items. Do not try to work around it; the share sheet is the fallback. Record which apps do and do not show it.

### 8.3 Quick Save sheet

- Shows the captured text, the selected book, and a Save button. Saving takes one tap once a default book exists.
- **Default book** = the last book used for saving. If none exists, the book field says "Choose a book" and Save is blocked until the user picks or creates one. "No book (Inbox)" is always available.
- Changing the book is a small "change" link. The picker lists existing books plus "New book" (type a name, which creates an `external` book).
- Optional personal note, collapsed by default. Color picker, default yellow.
- After Save: short confirmation, close, and return the user to the previous app if launched from outside.
- Remember the chosen book as the new default.

## 9. Backup, restore and export

- The existing manual backup must include: books metadata, `isFavorite`, reading progress, quotes, bookmarks and reader settings. Include book files if the current backup already includes document files; otherwise include metadata only and make that clear in the UI.
- "Export notes" per book as Markdown: the book title as a heading, each quote as a blockquote with page or chapter label, the user's note, and bookmarks listed at the end.
- Restore must not create duplicates of books, quotes or bookmarks that already exist (match by `id`).
- Backups are created and restored entirely on the device and through files the user chooses. No network.

## 10. Phases and acceptance criteria

**Phase 1: Library and the core reader**

- Books library with Continue reading card, filters (All, Favorites, Reading, Finished), sort, favorite hearts.
- Import of EPUB (and PDF to the library list), covers, metadata, DRM/invalid-file message.
- EPUB reader: paginated reading, tap and swipe navigation, immersive mode, table of contents, progress slider, themes (4), font size, font family, line spacing, margins, brightness, keep-screen-on, orientation.
- **Full resume behavior (Section 6), including every must-pass test.**
- Verified in airplane mode.

**Phase 2: Notes, search and PDF**

- Highlights (4 colors), notes on highlights, bookmarks, in-book search, Book detail with Notes and Bookmarks tabs, global notes search, export notes to Markdown.
- Page numbers via cached locations (5.5).
- PDF reader with resume page, page jump, bookmarks and "Capture from this page" (Section 7).
- Footnotes and image zoom in EPUB.
- Backup and restore cover all new data.

**Phase 3: Capture from other apps**

- Share-sheet text intake, `PROCESS_TEXT` selection-menu item, Quick Save sheet, Inbox.
- Verified manually in at least Chrome, a PDF viewer, WhatsApp and Kindle, with a note on which show the menu item.

**Phase 4 (optional): Scan from a printed book**

- "Scan a page" in Book detail and in Quick Save, using the existing scanner and the bundled offline OCR. The user taps the recognized lines to include and saves them as a Quote with `source: scan`.

**Testing checklist (every phase)**

- A 500+ page book and a large EPUB (30 MB or more) open without freezing the UI. Page turns stay smooth.
- Non-Latin scripts (Gujarati, Hindi) display and save correctly.
- Rotate mid-read: position kept.
- Delete a book with and without quotes.
- Backup then restore on a clean install.
- Airplane mode on a fresh install: everything works.
- A fresh APK builds in the GitHub workflow, including the native module and config plugin from Phase 3.

## 11. Out of scope (do not build)

Cloud sync, accounts, any network feature, DRM handling, Kindle or Play Books integration, text-to-speech, dictionary or translation lookup, reading statistics, streaks or goals, social sharing of reading activity, and a book store or catalog. Quote-image cards and a daily resurfaced quote are planned later and must not be started here.

## 12. Report back

At the end of each phase, write a short summary: what works, what limitations were found (especially anything that needed a workaround for offline use, which apps do not show the selection-menu item, how PDF text capture performs, and how long locations take to generate on a large book), and anything that deviated from this spec and why.

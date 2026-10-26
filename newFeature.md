# Capture to Reminder: Feature Spec

**App:** DocVault (Android, Expo SDK 54 / React Native, TypeScript, new architecture)
**Target release:** 1.4.0
**Status:** ready for implementation
**Audience:** a coding agent working in the existing DocVault repo

---

## 1. Summary

Today a user creates a reminder by typing everything in (`ReminderEditScreen`). Most reminder-worthy information already exists somewhere else on the phone: an SMS from the electricity board, a WhatsApp message with a rent amount, a Netflix email, a photo of a paper bill, a PDF premium notice.

**Capture to Reminder** lets the user send any of those into DocVault and get a **pre-filled reminder to confirm in one tap**: what it is, how much, when it's due, whether it repeats.

> Share (or scan) a bill → DocVault reads it on the phone → user checks a pre-filled form → reminder saved.

Nothing leaves the phone. Nothing is saved without the user confirming.

## 2. Why this feature

- Reminders are only useful if creating them takes seconds. Typing "Torrent Power ₹1,846 due 17 Oct monthly" into five fields is the main reason people never set them up.
- It reuses what is already built: share-in (`expo-share-intent`), on-device OCR (`expo-text-extractor`), the scanner, and the reminder engine. The new work is mostly one parser and one review screen.
- It makes the app useful every month (bills), not only when someone needs an ID.

### User stories

| #   | As a user I want to...                                                 | So that...                                    |
| --- | ---------------------------------------------------------------------- | --------------------------------------------- |
| U1  | share an SMS or WhatsApp message to DocVault and get a reminder        | I don't retype amount and date                |
| U2  | share a screenshot or photo of a bill                                  | the same, for bills that only exist as images |
| U3  | tap "Scan a bill" and photograph a paper bill                          | I can handle paper bills                      |
| U4  | see what DocVault found and fix mistakes before saving                 | I can trust it                                |
| U5  | keep the bill image or PDF attached to the reminder                    | I can open it when I pay or dispute it        |
| U6  | have a repeating bill update instead of creating duplicates each month | my list stays clean                           |
| U7  | get a subscription reminder a few days early                           | I can cancel before it renews                 |

## 3. Scope

### In scope

- Entry points: Android share sheet (text, image), **Scan a bill** button, **Paste from clipboard** button, and a "this looks like a bill" prompt after a document scan.
- On-device extraction of: **biller/title, amount, due date, repeat, reference number, category**.
- Review-and-confirm screen with confidence indicators.
- Optional "keep the original" (saves the image/PDF to a `Bills` folder and links it to the reminder).
- Smart matching with existing reminders to update instead of duplicating.
- Unit tests with fixtures; manual test checklist.

### Out of scope (do not build)

- Reading SMS, notifications or email automatically. **No `READ_SMS`, no notification-listener, no accessibility service, no Gmail API.** The user always initiates.
- Any network call. The app has the `INTERNET` permission removed on purpose (see §11).
- Paying bills, UPI deep links, account aggregation (possible later feature, not here).
- iOS.
- Quarterly/custom repeat intervals (see §15 optional extension).

### Phasing

| Phase | Deliverable                                             | Notes                                                                   |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0     | Refactors + data model + `ShareChooser`                 | no visible parsing yet                                                  |
| 1     | **Text and image** capture, parser, review screen       | the core value; ship this first                                         |
| 2     | Scan a bill, clipboard, post-scan prompt, keep-the-bill |                                                                         |
| 3     | Smart match / duplicates                                |                                                                         |
| 4     | **PDF** support (needs a small native module)           | digital PDFs are common in India; separate because it needs native code |

## 4. Existing codebase facts (do not break these)

The agent must read these files first. Paths are relative to the repo root.

| Area                      | Files                                                                                                                                                                                                     | Relevant facts                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| App shell, share handling | `App.tsx`                                                                                                                                                                                                 | `Shell` navigates to route `Save` when `hasShareIntent`. Also handles notification taps/actions and the "can't read data" screen.                                                   |
| Share intake today        | `src/screens/SaveScreen.tsx`                                                                                                                                                                              | Handles **files only**. If `shareIntent.files` is empty it shows "Nothing to save". Calls `resetShareIntent()` on unmount.                                                          |
| Reminder model            | `src/types.ts` → `Reminder`                                                                                                                                                                               | `{ id, title, dueOn (YYYY-MM-DD), time (HH:MM), repeat: none                                                                                                                        | monthly | yearly, offsets: number[], amount?, note?, doneThrough?, snoozeUntil?, createdAt }` |
| Reminder planning         | `src/reminders-plan.ts`, `src/reminders.ts`                                                                                                                                                               | Pure planner (tested) + scheduler using `expo-notifications`. Monthly clamps to month end. `dueOn` is the **anchor** date of the cycle.                                             |
| Reminder UI               | `src/screens/RemindersScreen.tsx`, `src/screens/ReminderEditScreen.tsx`                                                                                                                                   | Text entry happens in `PromptModal` (top-anchored sheet, avoids keyboard issues). Dates use `DateTimePickerAndroid`.                                                                |
| Storage                   | `src/storage/vault.tsx`                                                                                                                                                                                   | `createReminder`, `updateReminder`, `addFiles(folderId, IncomingFile[])` (supports `meta`), folder helpers. Index is **encrypted** (`vault.enc`); all writes go through `mutate()`. |
| OCR                       | `src/ocr/read.ts` (`readPageText`), `src/ocr/parse.ts` (document detector with `findDates`, `classifyDates`)                                                                                              | `readPageText(uri)` takes a `file://` or plain path. ML Kit via Google Play services.                                                                                               |
| UI kit                    | `src/components/ui.tsx` (`ScreenHeader`, `Button`, `PromptModal`, `SheetModal`, `ActionMenu`, `FabBar`, `Pill`), `src/components/Rows.tsx` (`DueBadge`, `ExpiryBadge`), `src/components/FolderPicker.tsx` | Reuse. Do not introduce a new UI library.                                                                                                                                           |
| Theme                     | `src/theme.ts`                                                                                                                                                                                            | colors, fonts (`Bricolage Grotesque` headings, `Figtree` body), radius. Feather icons via `@expo/vector-icons/Feather` (single-family import to keep the APK small).                |
| Lock                      | `src/lock/LockProvider.tsx`                                                                                                                                                                               | Wrap anything that opens another system activity in `runExternal(...)`.                                                                                                             |
| Tests                     | `scripts/test-*.ts`, run by `npm test` with `tsx`                                                                                                                                                         | Pure logic must be testable without a phone.                                                                                                                                        |

**Hard constraints**

1. Android only. New architecture is enabled. Prefer Expo modules.
2. `android.permission.INTERNET` is blocked in `app.json`. Do not add a dependency that needs it at runtime.
3. All new logic that decides something (parsing, matching, dates) goes in **pure functions with unit tests**.
4. Text input stays in `PromptModal`-style top sheets; do not add bottom-anchored inputs (keyboard covers them under edge-to-edge).
5. Use `stripFileScheme()` from `src/utils.ts` before passing paths to `readPageText`.
6. Keep the encrypted-index invariants: never write the index outside `mutate()`.

## 5. User flows

### Flow A: Share a text (SMS / WhatsApp / email body)

1. User long-presses a message in their messaging app → **Share** → **DocVault**.
2. DocVault opens (behind the lock if enabled), then shows **Share Chooser** (§6.1) with the text preview and one primary action: **Create a reminder**.
3. Tap → **Capture Review** (§6.2) in a short "Reading…" state (≤ 300 ms for text), then the pre-filled form.
4. User corrects anything, taps **Save reminder**.
5. Notification permission is requested if not granted (existing `requestReminderPermission()`), then the app goes to the **Reminders** list with the new item highlighted for 2 seconds.

### Flow B: Share an image (screenshot or photo)

1. Share → DocVault. Chooser shows an image thumbnail with two actions: **Create a reminder** (primary) and **Save to a folder** (secondary; goes to the existing `SaveScreen`).
2. **Create a reminder** → Capture Review with "Reading the image…" (OCR, 0.5–3 s). A progress shimmer replaces the form fields, not a blocking spinner.
3. Review → Save. The **Keep the bill** switch defaults **on** and saves the image into `Bills/`.

### Flow C: Scan a bill with the camera

1. Reminders screen → **Scan a bill** pill. (Also reachable from Home's bell → Reminders.)
2. Existing document scanner opens via `runExternal`. User scans 1 to 3 pages (cap 3 for bills).
3. On return: Capture Review reading all pages, same as Flow B.
4. **Keep the bill** saves a single PDF (existing `buildPdf`) into `Bills/`.

### Flow D: Paste from clipboard

1. In `ReminderEditScreen` (new reminder only), a chip **Paste from clipboard** sits above the fields.
2. Tap reads the clipboard (`expo-clipboard`) **only on tap**. If empty or not text, toast: "Nothing to paste."
3. Parsed result pre-fills the form in place (same screen, no navigation) and shows the confidence banner.

### Flow E: "This looks like a bill" after a document scan

1. In `ScanScreen` after OCR on Save press, the existing review form for document details is shown.
2. If the parser also finds **amount and a due date**, show a banner at the top of that form: **"This looks like a bill. Remind me to pay it?"** with a switch (default **off**; never create a reminder silently).
3. If on, saving the scan also creates the reminder linked to the saved file (`fileId`). No second review screen; the banner expands inline to show amount, date and title editable via the same rows as §6.2.
4. Phase 2.

## 6. UI specification

Visual language is unchanged: deep document-blue (`colors.primary`), marigold accent for primary floating actions, Bricolage Grotesque for titles, Figtree for body. Cards use `radius.lg`. Keep every tap target ≥ 48 dp.

### 6.1 New screen: `ShareChooserScreen` (route `ShareChooser`)

Purpose: replace the current direct jump to `Save` when something is shared. `App.tsx` navigates here instead of `Save`.

```
┌────────────────────────────────────────┐
│ ←  Shared to DocVault                  │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ [thumb 56]  Screenshot_2026…png    │ │   source card
│ │             1.2 MB                 │ │   (text share: first 3 lines, ellipsised)
│ └────────────────────────────────────┘ │
│                                        │
│ What would you like to do?             │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ [bell]  Create a reminder          │ │   primary card (blue tint)
│ │ Finds the amount and due date      │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ [folder] Save to a folder          │ │   secondary card (hidden for text shares)
│ │ Keep it with your documents        │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

Rules:

- **Text-only share** (`shareIntent.text` or `webUrl`, no files): show only **Create a reminder**. Remove the old "Nothing to save" dead end.
- **File share, image**: both cards.
- **File share, other types** (PDF in phase 1-3): both cards; **Create a reminder** is disabled with helper text "PDF support is coming. Take a screenshot of the bill and share that." Phase 4 enables it.
- **Multiple files**: **Create a reminder** reads up to the first 3 images; extra files are ignored with a one-line note.
- Back/close calls `resetShareIntent()` and returns to Home (same as `SaveScreen.close`).
- Accessibility: each card is a button with label "Create a reminder from this" / "Save this to a folder".

### 6.2 New mode of `ReminderEditScreen`: "capture"

Do **not** create a separate form. Extend `ReminderEditScreen` with an optional route param:

```ts
ReminderEdit: { id?: string; draft?: CaptureDraft } | undefined
// CaptureDraft = { result: BillParseResult; source: CaptureSource }
```

When `draft` is present the screen is in **capture mode**:

```
┌────────────────────────────────────────┐
│ ←  New reminder from bill              │
│                                        │
│ ┌──────────────────────────────────────┐
│ │ [thumb] Screenshot… / “Dear Customer,│   Source card (collapsed)
│ │ your Airtel bill of Rs 749…”         │   chevron: “What I read ▾”
│ └──────────────────────────────────────┘
│  ┌───────────────────────────────────┐
│  │ i  I found 3 of 4 details. Check  │   Confidence banner
│  │    the ones marked “Check”.       │
│  └───────────────────────────────────┘
│                                        │
│  What      Airtel                  ✎   │   biller title (+ category icon)
│  Amount    ₹749.00         [High]  ✎   │
│            ( ₹749.00 ) ( ₹620.00 )     │   alternative chips (only when >1 candidate)
│  Date      25 Oct 2026   [Check]   📅  │   amber when low confidence, red outline when missing
│  Time      9:00 AM                  🕘  │
│  Repeat    ( Once ) (●Monthly ) ( Yearly )
│  Notify    ( On the day ● ) ( 1 day ● ) ( 3 days ) ( 7 days )
│  Reference 9876543210   (optional)  ✎   │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Keep the bill          [ switch ]│  │   only for image/scan sources
│  │ Save to  Bills ›                 │  │   opens FolderPicker
│  └──────────────────────────────────┘  │
│                                        │
│  [ Save reminder ]                     │   disabled until title + date present
│  Discard                               │   text button
└────────────────────────────────────────┘
```

#### Element details

**Source card**

- Image/scan: 56 dp thumbnail + file name. Text: first 120 chars.
- Tap expands **What I read**: the recognised text in a scrollable box (max 6 lines, selectable). This is the transparency feature: users can see why a value was chosen. Text is **not** stored.
- Collapsed by default.

**Confidence banner**

- Count = detected fields among {title, amount, date}. Copy:
  - 3/3 high: "Everything looks right. Check it, then save."
  - otherwise: "I found {n} of 3 details. Check the ones marked “Check”."
  - 0 found: "I couldn't find an amount or date. You can fill them in below." (no error styling)
- Banner uses the existing light-blue info style (`#E6EAFB`). Never red.

**Field rows**

Reuse `Row` from `ReminderEditScreen`. Add a trailing **confidence tag**:

| Confidence               | Tag                    | Style                                     |
| ------------------------ | ---------------------- | ----------------------------------------- |
| `high`                   | none (no visual noise) |                                           |
| `medium`                 | "Check"                | amber text on `#FFF1D6` pill              |
| `low`                    | "Check"                | amber, and row gets a 1.5 dp amber border |
| missing (required: date) | "Needed"               | red text, red 1.5 dp border               |

Tapping a row edits it exactly as today (`PromptModal` / date picker). After the user edits a flagged field, remove its tag.

**Amount alternatives**

When the parser finds more than one labelled amount (e.g. _Total due_ and _Minimum due_, or _Payable by due date_ and _after due date_), show chips under the Amount row. Labels:

- "Total ₹12,430.50" (default selected)
- "Minimum ₹620.00"
- "After due date ₹1,880.00" (never default)

Selecting a chip replaces the amount and writes the label into the note only if the user chose a non-default one (e.g. `Minimum amount due`). **Other…** is not needed because the Amount row already opens a text prompt.

**Title**

- Prefilled with the canonical biller name from the dictionary (e.g. `Airtel`, `Netflix`, `HDFC Bank Credit Card`), else the best header line (§8.3), else empty.
- Keep the existing quick-pick suggestions in the title prompt.
- A small category icon appears left of the row label (Feather): `smartphone` (telecom), `zap` (utility), `credit-card` (card/EMI), `shield` (insurance), `tv` (subscription), `home` (rent), `file-text` (other).

**Repeat and Notify**

- Prefilled from category defaults (§8.6). Same chips as today.
- If the parser is not confident about repeat (no keyword, no dictionary hit), preselect **Once** and show the hint "Repeats? Tap Monthly or Yearly."

**Reference (new optional row)**

- Free text: consumer number, policy number, phone number.
- Shown only if found or if the user taps **Add reference** (a text button under Notify).
- Used for smart match (§9). Displayed on the reminder row as `Ref …1234` (last 4) and **never** in notification text.

**Keep the bill (image/scan sources only)**

- Switch default **on**. Under it: `Save to  Bills ›` opens `FolderPicker`.
- First use auto-creates a root folder named `Bills` (color `#2F8FD0`); if the user already has a folder named `Bills` (case-insensitive), reuse it.
- Text-only sources: this block is hidden.
- For images: save the original image (no re-encode). For scans: one PDF built by `buildPdf`.

**Primary action**

- **Save reminder** disabled until `title.trim()` and `dueOn` exist.
- On save: create reminder → (optionally) `addFiles` → set `fileId` → `requestReminderPermission()` → navigate to `Reminders` with the new id highlighted.
- **Discard** asks only if the user edited something: "Discard this reminder?"

#### Loading, empty and error states (capture mode)

| State                                                                 | UI                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading image                                                         | Source card visible; field rows replaced by 4 shimmer bars; Save disabled; text "Reading the bill on your phone…"                                                                              |
| Text found                                                            | form pre-filled                                                                                                                                                                                |
| Nothing found                                                         | empty form; banner "I couldn't find an amount or date…"; user can still save manually                                                                                                          |
| OCR unsupported / failed (no Play services, model not yet downloaded) | empty form; banner "Couldn't read text on this phone right now. You can fill the details in, or try again when you're online so Google can download its text model." with **Try again** button |
| PDF protected / unreadable (phase 4)                                  | banner "This PDF is password protected. Open it in your PDF app, take a screenshot and share that."                                                                                            |

### 6.3 Changed screen: `RemindersScreen`

- Bottom bar becomes two pills: **Scan a bill** (dark, `camera` icon) and **New reminder** (accent, `plus`). Same `FabBar`.
- Empty state gets a second block under the existing text, titled **Add one in seconds**, with three steps (icons `share-2`, `cpu`, `check`):
  1. "Share a message or screenshot of a bill to DocVault."
  2. "DocVault reads it on your phone."
  3. "Check and save."
- Each reminder card:
  - Left: category icon (36 dp round, tinted by tone).
  - Title, subline `₹749.00 • Every month • 9:00 AM`, due badge (`DueBadge`) as today.
  - If `fileId` exists: a `paperclip` icon button that opens the file (`openFile`). Accessibility label "Open the bill".
  - If `reference`: appended to the subline as `Ref …6789`.

### 6.4 Changed screen: `ReminderEditScreen` (non-capture mode)

- New chip row at the top, **new reminders only**: `Paste from clipboard` (icon `clipboard`) and `Scan a bill` (icon `camera`). They act as in Flows C and D.
- Under the Notify card add a text button **Add reference** (and the optional Reference row described above).
- If `existing.fileId` exists, show a card **Attached bill** with the file name, **Open**, and **Remove link** (does not delete the file).

### 6.5 Changed screen: `ScanScreen` (phase 2, Flow E)

- In the document-details review (`ReviewForm`), when `parseBill(texts)` returns `isBill === true`, render a **Bill banner** above "Document type":
  - Title: "This looks like a bill"
  - Body: "{Biller} • {₹ amount} • due {date}" (only the parts found)
  - Switch: "Remind me to pay it" (default off)
- On save with the switch on, create the reminder (title/amount/date as detected; offsets and repeat from category defaults) and set `fileId` to the saved file. Show a toast: "Reminder added for {date}".
- If the OCR review form would otherwise not appear (no document fields found) but `isBill` is true, show the form anyway with only the bill banner.

### 6.6 Notification content

Unchanged mechanics; richer body. With **Show document names** on:

- Title: the reminder title, e.g. `Airtel`
- Body: `₹749.00 · due tomorrow` plus the existing note excerpt.
- Never include the reference number.

### 6.7 Microcopy (use exactly; tweak only for length)

| Where                  | Text                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| Chooser heading        | "What would you like to do?"                                                    |
| Chooser primary        | "Create a reminder" / "Finds the amount and due date"                           |
| Chooser secondary      | "Save to a folder" / "Keep it with your documents"                              |
| Reading                | "Reading the bill on your phone…"                                               |
| Banner (all good)      | "Everything looks right. Check it, then save."                                  |
| Banner (partial)       | "I found {n} of 3 details. Check the ones marked “Check”."                      |
| Banner (none)          | "I couldn't find an amount or date. You can fill them in below."                |
| Missing date tag       | "Needed"                                                                        |
| Low confidence tag     | "Check"                                                                         |
| Overdue notice         | "This was due on {date}. Remind me today at {time} instead?"                    |
| Keep switch            | "Keep the bill" / helper "Saved in your Bills folder, linked to this reminder." |
| Duplicate dialog title | "You already have “{title}”"                                                    |
| Clipboard empty        | "Nothing to paste."                                                             |
| Saved toast            | "Reminder added for {date}"                                                     |

## 7. Data model changes

All new fields are **optional**; no migration is required. Old indexes and backups keep working.

```ts
// src/types.ts
export type ReminderCategory =
  | "telecom"
  | "utility"
  | "card"
  | "insurance"
  | "subscription"
  | "rent"
  | "emi"
  | "other";

export type CaptureSource =
  | "manual"
  | "share-text"
  | "share-image"
  | "scan"
  | "clipboard";

export type Reminder = {
  // ...existing fields...
  fileId?: string; // linked bill in the vault (VaultFile.id)
  reference?: string; // consumer no., policy no., phone number
  category?: ReminderCategory;
  source?: CaptureSource; // for support/debugging only; not shown in UI
  amountValue?: number; // parsed numeric rupees when the amount is INR; enables future totals
};
```

Rules:

- `updateReminder` already strips empty strings; extend it to drop empty `reference`, undefined `fileId`, `category`, `amountValue`.
- If a linked file is deleted (`deleteFile` / `deleteFolder`), clear `fileId` on reminders that point to it, **inside the same `mutate()`** so the index never holds a dangling link. Add a unit-testable helper `unlinkFile(reminders, fileIds)`.
- `anchor` semantics are unchanged: `dueOn` is the first/anchor due date. See §9 for how an update changes it.
- Backup/restore: carried automatically (the index is serialised as a whole).

## 8. Parsing engine (`parseBill`)

New pure module. Suggested layout:

```
src/capture/
  parseBill.ts     // main entry
  amount.ts        // parseINR, formatINR, amount candidate finding
  billers.ts       // dictionary + aliases + category defaults
  match.ts         // smart matching with existing reminders (§9)
src/ocr/dates.ts   // findDates/classifyDates extracted from src/ocr/parse.ts and shared
```

Refactor first: move `findDates`, `makeISO`, month map and the classification helpers out of `src/ocr/parse.ts` into `src/ocr/dates.ts` and import them in both places. `npm test` must still pass before adding anything else.

### 8.1 API

```ts
export type Confidence = "high" | "medium" | "low";

export type Field<T> = { value: T; confidence: Confidence; why: string }; // `why` is for tests/debug only

export type AmountCandidate = {
  value: number; // rupees
  text: string; // as shown, e.g. "₹12,430.50"
  label: "total" | "minimum" | "payable" | "after-due" | "plain";
  confidence: Confidence;
};

export type BillParseResult = {
  isBill: boolean; // true if amount AND (date OR biller) found
  title?: Field<string>;
  amount?: Field<AmountCandidate>; // the chosen default
  amountAlternatives: AmountCandidate[]; // others, ordered
  dueOn?: Field<string>; // ISO date
  repeat?: Field<"none" | "monthly" | "yearly">;
  reference?: Field<string>;
  category: ReminderCategory; // "other" if unknown
  offsets: number[]; // default notify offsets for the category
  overdue: boolean; // dueOn < today
};

export function parseBill(
  input: string | string[],
  now?: Date,
): BillParseResult;
```

`now` is injectable so tests are deterministic.

### 8.2 Normalisation

1. Join multiple pages with `\n`.
2. Normalise: `\r` → `\n`; collapse spaces/tabs; replace `₹`, `Rs.`, `Rs`, `INR`, `Rs/-` variants with a single token `₹` **for matching only** (keep original for display).
3. Fix common OCR confusions **only inside amount tokens**: `O`→`0`, `l`/`I`→`1`, `S`→`5` when surrounded by digits and separators.
4. Split into lines; keep both the line list and the joined text.

### 8.3 Title (biller)

Priority:

1. **Dictionary match** on any alias in the text (case-insensitive, word boundary). Use the canonical name. Confidence `high`.
2. SMS sender header if present at the start (`AX-AIRTEL`, `VM-HDFCBK`): strip the 2-letter prefix and hyphen, map through aliases. `medium`.
3. Email `From:` display name. `medium`.
4. First non-empty line that is ≥ 3 chars, not mostly digits, not a greeting (`Dear`, `Hello`, `Hi`), ≤ 40 chars, title-cased. `low`.
5. Otherwise leave empty (user types it).

### 8.4 Amount

**Candidate extraction.** Match `₹\s?[\d,]+(\.\d{1,2})?` and `[\d,]+(\.\d{1,2})?\s?(rs|inr|rupees)`. Support Indian grouping `1,23,456.78`. Reject values `< 1` or `> 1_00_00_000`. Ignore numbers that are part of a longer digit run (phone numbers, account numbers).

**Label detection** from the 40 characters before the candidate (same line, or the previous line if the current line starts with the number):

| Label       | Trigger words (case-insensitive)                                                                                                                        | Priority             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `after-due` | "after due date", "late fee", "late payment", "penalty", "surcharge"                                                                                    | never default        |
| `total`     | "total amount due", "total due", "total payable", "amount due", "outstanding"                                                                           | 1                    |
| `payable`   | "net payable", "amount payable", "payable by", "pay now", "bill amount", "premium amount", "premium", "amount to pay", "you will be charged", "charged" | 2                    |
| `minimum`   | "minimum amount due", "min. amount due", "min due", "minimum due"                                                                                       | 3 (alternative only) |
| `plain`     | none of the above                                                                                                                                       | 4                    |

**Choice rule:** pick the lowest priority number that exists; within the same priority pick the first in reading order. If only `plain` candidates exist, pick the **one that is clearly largest** if it is ≥ 2× the next; otherwise pick the first and mark confidence `low`. All other candidates (except exact duplicates) become `amountAlternatives`, ordered `minimum`, `after-due`, `plain`.

**Confidence:** `high` for `total`/`payable` with a keyword on the same line; `medium` for `plain` that is clearly the largest; `low` otherwise.

`formatINR(n)` uses Indian grouping and two decimals only when the amount has paise.

### 8.5 Due date

Reuse the shared `findDates`/`classifyDates`. Extend the due keywords:

`due date`, `due on`, `due by`, `pay by`, `pay before`, `payment due`, `last date`, `last date of payment`, `next billing date`, `next payment`, `renews on`, `renewal date`, `will renew`, `expires on`, `valid till`, `valid until`, `bill due`.

Additional rules:

- **Date without a year** (`25 Oct`, `25th Oct`, `Oct 25`): resolve to the next occurrence on or after `now`; if that is more than 330 days away, use the previous occurrence instead. Confidence `medium`.
- **Ordinal day only** (`due by 5th`, `on the 5th of every month`): next occurrence of that day-of-month on or after today; also sets `repeat = monthly` with confidence `low`. Confidence `low`.
- **Two-digit years** (`25-10-26`): treat as 20yy.
- **Ambiguous day/month** (`03/04/2026`): India uses day first; always interpret as DD/MM. If both numbers ≤ 12, confidence `medium`, else `high`.
- If several due-keyword dates exist, choose the **earliest one that is not before today**; if all are past, choose the latest and set `overdue = true`.
- A date labelled bill date / invoice date / statement date / issue date is **never** the due date.
- If no keyword-labelled date exists but exactly one date is present, use it with confidence `low`.
- Nothing found → `dueOn` undefined (UI marks "Needed").

### 8.6 Category, repeat and notify defaults

Category comes from the dictionary entry, else from keywords:

| Category       | Keywords (fallback)                                                  | Default repeat                                   | Default offsets | Icon        |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------ | --------------- | ----------- |
| `subscription` | "subscription", "renews", "auto-renew", "membership", "next billing" | monthly (yearly if text says annual/yearly/year) | `[3, 1, 0]`     | tv          |
| `telecom`      | "recharge", "postpaid", "broadband", "fibre", "dth"                  | monthly                                          | `[1, 0]`        | smartphone  |
| `utility`      | "electricity", "consumer no", "gas", "water", "meter"                | monthly                                          | `[2, 0]`        | zap         |
| `card`         | "credit card", "card ending", "statement"                            | monthly                                          | `[3, 0]`        | credit-card |
| `emi`          | "emi", "loan", "instalment"                                          | monthly                                          | `[2, 0]`        | credit-card |
| `insurance`    | "premium", "policy", "insurance", "sum assured"                      | yearly (monthly if "monthly mode")               | `[30, 7, 0]`    | shield      |
| `rent`         | "rent"                                                               | monthly                                          | `[2, 0]`        | home        |
| `other`        | none                                                                 | once                                             | `[1, 0]`        | file-text   |

**Repeat overrides** from text: "monthly", "per month", "/month", "/mo" → monthly; "annual", "yearly", "per year", "/year", "mode: yearly" → yearly; "quarterly", "half yearly" → `once` plus a low-confidence hint in the banner: "This looks quarterly. DocVault doesn't repeat quarterly yet, so it's set to once."

Repeat confidence: `high` when stated in text; `medium` from dictionary/category; `low` from the ordinal-day rule; otherwise `none` with no tag.

### 8.7 Reference number

Labelled capture only: `consumer no`, `consumer number`, `customer id`, `policy no`, `policy number`, `account no`, `a/c no`, `card ending`, `loan account`, `mobile`, `ref no`. Value rules: 5–20 chars, at least 4 digits. Reuse the generic labelled-number regex from `src/ocr/parse.ts` (move to a shared helper). Confidence `high` when labelled. Store with original formatting; show masked (`…6789`) in lists.

### 8.8 `isBill`

`isBill = !!amount && (!!dueOn || !!title)`. Used by Flow E and to decide the banner copy.

### 8.9 Dictionary (`billers.ts`)

Seed list (extend freely; keep it a plain typed array so tests and contributions are easy):

```ts
{ name: "Netflix", aliases: ["netflix"], category: "subscription", repeat: "monthly" }
{ name: "Amazon Prime", aliases: ["amazon prime", "prime membership"], category: "subscription", repeat: "yearly" }
{ name: "Disney+ Hotstar", aliases: ["hotstar", "disney+"], category: "subscription", repeat: "yearly" }
{ name: "YouTube Premium", aliases: ["youtube premium", "youtube music premium"], category: "subscription", repeat: "monthly" }
{ name: "Spotify", aliases: ["spotify"], category: "subscription", repeat: "monthly" }
{ name: "JioHotstar", aliases: ["jiohotstar"], category: "subscription", repeat: "yearly" }
{ name: "Airtel", aliases: ["airtel"], category: "telecom", repeat: "monthly" }
{ name: "Jio", aliases: ["reliance jio", "jiofiber", "jio postpaid", "jio"], category: "telecom", repeat: "monthly" }
{ name: "Vi", aliases: ["vodafone idea", "vi postpaid", "vi "], category: "telecom", repeat: "monthly" }
{ name: "BSNL", aliases: ["bsnl"], category: "telecom", repeat: "monthly" }
{ name: "Torrent Power", aliases: ["torrent power"], category: "utility", repeat: "monthly" }
{ name: "Gujarat Gas", aliases: ["gujarat gas"], category: "utility", repeat: "monthly" }
{ name: "DGVCL", aliases: ["dgvcl", "dakshin gujarat vij"], category: "utility", repeat: "monthly" }
{ name: "MSEDCL", aliases: ["msedcl", "mahavitaran"], category: "utility", repeat: "monthly" }
{ name: "Tata Power", aliases: ["tata power"], category: "utility", repeat: "monthly" }
{ name: "HDFC Bank Credit Card", aliases: ["hdfc bank credit card", "hdfc credit card"], category: "card", repeat: "monthly" }
{ name: "SBI Card", aliases: ["sbi card"], category: "card", repeat: "monthly" }
{ name: "ICICI Bank Credit Card", aliases: ["icici bank credit card", "icici credit card"], category: "card", repeat: "monthly" }
{ name: "LIC of India", aliases: ["lic of india", "life insurance corporation", "lic premium"], category: "insurance", repeat: "yearly" }
{ name: "HDFC Life", aliases: ["hdfc life"], category: "insurance", repeat: "yearly" }
{ name: "Star Health", aliases: ["star health"], category: "insurance", repeat: "yearly" }
```

SMS sender header map (6-char DLT headers): `AIRTEL`→Airtel, `JIOPAY`/`JIO`→Jio, `HDFCBK`→HDFC Bank, `SBICRD`→SBI Card, `ICICIB`→ICICI Bank, `LICIND`→LIC of India. Unknown headers fall through to rule 4.

Ambiguity guard: the alias `vi ` needs word boundaries plus another telecom keyword in the text to count; short aliases must never match inside other words.

## 9. Smart match and duplicates (phase 3)

Run after parsing, before showing the form (and again on Save if the user changed the title/reference).

```ts
export function findMatch(
  r: DraftFields,
  existing: Reminder[],
): { reminder: Reminder; reason: "reference" | "title" } | null;
```

Match order:

1. Same non-empty `reference` (compare digits/letters only, case-insensitive) → match, `reason: "reference"`.
2. Same normalised title (lowercase, strip punctuation and spaces), **and** existing is `monthly` or `yearly` → match, `reason: "title"`.

If matched, show a sheet (SheetModal, bottom) **before** the form:

```
You already have “Torrent Power”
Every month • next due 17 Nov • ₹1,790.00

[ Update it with this bill ]   (primary)
[ Add as a separate reminder ]
[ Cancel ]
```

**Update it** applies, in one `updateReminder` call:

- `amount`/`amountValue` ← new amount.
- `fileId` ← newly kept file (if any). The old file stays in the vault.
- `reference` if previously empty.
- `doneThrough` ← cleared **only if** the new due date is later than the current next due date (meaning a new cycle).
- **Due date:** compare the new due date `D` with the reminder's current next occurrence `N`:
  - `|D − N| ≤ 3 days`: do nothing to the anchor (normal monthly drift).
  - otherwise show a second confirmation "The due date changed to {D}. Move the reminder?" If yes set `dueOn = D` and, for monthly reminders, set `doneThrough` to the occurrence just before `D` so earlier cycles don't re-fire.
- Toast: "Updated Torrent Power".

Edge: if the matched reminder is one-time (`repeat: none`), never auto-update; offer only "Add as a separate reminder".

## 10. Source handling details

### 10.1 Android share intake

- Intent filters are already `*/*` for single and multiple shares in `app.json` (`expo-share-intent`). Text shares arrive with `shareIntent.text` (and sometimes `webUrl`).
- **Verify on device** that text shared from WhatsApp, Google Messages and Gmail arrives in `shareIntent.text`. If a source sends content as a `.txt` stream instead, treat `.txt` files as text sources: read with `FileSystem.readAsStringAsync`.
- `resetOnBackground: false` stays (the system unlock prompt backgrounds the app).
- `App.tsx` change: when `hasShareIntent` and unlocked, `navigate("ShareChooser")` instead of `Save`.
- Unmount of `ShareChooser` and `ReminderEdit` (capture mode) must call `resetShareIntent()` exactly once to avoid re-opening on foreground.

### 10.2 Images

- `readPageText(uri)` on each shared image (max 3). Cache by uri for the life of the screen.
- Before OCR, if the longest side > 3000 px you may skip resizing (ML Kit handles it). Do **not** add an image-processing dependency for this.
- Screenshots of chat messages have large UI chrome. Parse the **whole text**; the label-based rules cope with it.
- Time budget: show shimmer immediately; hard timeout 10 s then fall back to the "couldn't read" state with **Try again**.

### 10.3 Clipboard

- `Clipboard.getStringAsync()` only inside the tap handler. Never poll or read on mount.
- Treat as `share-text`/`clipboard` source. No "keep the bill" block.

### 10.4 Scan a bill

- Reuse `DocumentScanner.scanDocument({ maxNumDocuments: 3 })` inside `runExternal`.
- Pass the page images through `readPageText`. For "keep the bill", build a PDF with the existing `buildPdf` and store it via `addFiles` with `IncomingFile.meta` left empty (the link to the reminder is created by id after `addFiles`; extend `addFiles` to return the created `VaultFile[]` for this).
- Clean up the scanner's temp images after saving or discarding (existing patterns in `ScanScreen`).

### 10.5 PDF (phase 4)

Digital bills from banks, electricity boards and insurers are mostly PDFs. ML Kit cannot read PDFs directly.

Preferred approach, a small local Expo module `modules/pdf-render`:

- Kotlin using `android.graphics.pdf.PdfRenderer` to render page 1 (and 2 if page 1 yields no amount) to a JPEG in the cache dir at ~1600 px on the long side, returning the file path.
- Then run the normal OCR path on the rendered image.
- If `PdfRenderer` throws `SecurityException` (password protected), return error code `PASSWORD_PROTECTED` → show the dedicated banner in §6.2.
- Keep the original PDF for "keep the bill".

If a text layer is present, an optional optimisation is to extract text directly, but it is not required for v1 of this phase.

## 11. Privacy and security requirements

1. **All processing is on-device.** No network, no analytics, no crash reporting added by this feature.
2. **User-initiated only.** Reading text happens after a share, a scan, or an explicit tap. Clipboard is read only on tap.
3. **Source text is never persisted.** Only fields the user confirms are saved (title, amount, date, repeat, offsets, reference, optional note, optional file link).
4. **Kept bills** are stored like any vault file (private app storage). The reminder holds only the file id.
5. **Notification text** never includes the reference number; amount and title obey the existing **Show document names** setting. With names off, notifications read "A reminder is due".
6. **Temporary files** (shared image copies, rendered PDF pages, scanner images) are deleted after save or discard. Extend `clearTempFiles()` to remove any new temp directories.
7. The index remains encrypted; every write goes through `mutate()`.
8. No new permissions. If the PDF module needs none, keep `app.json` unchanged.

## 12. Edge cases

| Case                                                       | Expected behaviour                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount found, no date                                      | Date row marked "Needed"; Save disabled until set                                                                                                   |
| Date found, no amount                                      | Allowed (amount optional)                                                                                                                           |
| Date in the past (one-time)                                | Inline notice "This was due on {date}. Remind me today at {time} instead?" with **Use today**; otherwise it saves as overdue                        |
| Date in the past (monthly)                                 | Planner already rolls to the next cycle; show the next due date in the row hint                                                                     |
| Two different due dates (e.g. bill period start/end + due) | Prefer keyword-labelled due date; else earliest future date; confidence `medium`                                                                    |
| "Pay before 5th" with no month                             | Next 5th; repeat monthly; low confidence                                                                                                            |
| Amount in words only                                       | Not parsed; user types it                                                                                                                           |
| Foreign currency (`$`, `USD`)                              | Keep as typed text in `amount`, leave `amountValue` undefined                                                                                       |
| Very long OCR text (> 20 000 chars)                        | Parse the first 20 000 chars                                                                                                                        |
| Same bill shared twice in a row                            | Smart match offers "Update it"; no silent duplicate                                                                                                 |
| Device locked when share arrives                           | Wait for unlock (existing behaviour), then open the chooser                                                                                         |
| User backs out of the review                               | Nothing saved; temp files cleaned; `resetShareIntent()` called                                                                                      |
| App killed during OCR                                      | Nothing saved; on next launch no share intent remains                                                                                               |
| Notification permission denied                             | Save anyway; show the existing "Notifications are off" alert with **Open settings**                                                                 |
| Linked file deleted later                                  | `fileId` cleared in the same transaction; paperclip disappears                                                                                      |
| Multiple currencies/amounts in one image (statement table) | Use label rules; low confidence chips; never auto-pick a transaction row (ignore lines that start with a date followed by a merchant and an amount) |

## 13. Files to add / change

**Add**

```
src/capture/parseBill.ts
src/capture/amount.ts
src/capture/billers.ts
src/capture/match.ts
src/ocr/dates.ts
src/screens/ShareChooserScreen.tsx
src/components/ConfidenceTag.tsx          // "Check" / "Needed" pill
src/components/SourceCard.tsx             // thumbnail/text excerpt + "What I read"
scripts/test-capture.ts
modules/pdf-render/                       // phase 4 only
```

**Change**

```
App.tsx                         // route ShareChooser, navigate on share; register screens
src/navigation.ts               // ShareChooser, ReminderEdit params { id?, draft? }
src/types.ts                    // Reminder fields (§7)
src/storage/vault.tsx           // addFiles returns created VaultFile[]; ensureFolder(name);
                                // unlink fileId on delete; updateReminder cleanup
src/screens/ReminderEditScreen.tsx   // capture mode, chips, reference, attached bill, keep-the-bill
src/screens/RemindersScreen.tsx      // Scan a bill pill, empty state, category icon, paperclip
src/screens/ScanScreen.tsx           // phase 2: bill banner in ReviewForm
src/screens/SaveScreen.tsx           // unchanged logic; only reached from the chooser
src/ocr/parse.ts                     // import from dates.ts; keep behaviour identical
src/reminders.ts                     // notification body includes amount (already supported)
README.md                            // document the feature + manual tests
package.json                         // add test-capture.ts to "test"
```

## 14. Test plan

### 14.1 Unit tests (`scripts/test-capture.ts`)

Use `now = new Date(2026, 9, 23, 10, 0)` (23 Oct 2026). Fixtures below are **synthetic**; expected values are what the parser must return.

| #   | Input text                                                                                                                                                               | Expected                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Dear Customer, your Airtel bill of Rs 749.00 for 9876543210 is due on 25-Oct-2026. Pay now: airtel.in/pay`                                                              | title `Airtel`, amount 749, due `2026-10-25`, repeat monthly (medium), category telecom, offsets `[1,0]`                                                     |
| 2   | `TORRENT POWER LIMITED\nConsumer No: 12345678901\nBill Date: 02/10/2026\nDue Date: 17/10/2026\nNet Payable Amount: ₹ 1,846.00\nAmount payable after due date ₹ 1,880.00` | title `Torrent Power`, amount 1846 (`payable`), alternative 1880 (`after-due`), due `2026-10-17`, `overdue: true`, reference `12345678901`, category utility |
| 3   | `HDFC Bank Credit Card XX1234: Total Amount Due Rs.12,430.50, Minimum Amount Due Rs.620.00, Payment Due Date 05-Nov-2026.`                                               | amount 12430.5 (`total`), alternative 620 (`minimum`), due `2026-11-05`, category card, repeat monthly                                                       |
| 4   | `Your next billing date is 12 November 2026. Your plan: Premium ₹649/month` + sender `Netflix`                                                                           | title `Netflix`, amount 649, due `2026-11-12`, repeat monthly, category subscription, offsets `[3,1,0]`                                                      |
| 5   | `Your subscription to YouTube Premium renews on 3 Dec 2026. You'll be charged ₹149.00 /month`                                                                            | title `YouTube Premium`, amount 149, due `2026-12-03`, monthly                                                                                               |
| 6   | `LIC of India\nPremium Due Date: 28/02/2027\nPremium Amount: Rs. 24,600\nPolicy No: 123456789\nMode: Yearly`                                                             | title `LIC of India`, amount 24600, due `2027-02-28`, yearly (high), category insurance, offsets `[30,7,0]`, reference `123456789`                           |
| 7   | `Rent for Nov ₹18,000 due by 5th`                                                                                                                                        | amount 18000, due `2026-11-05` (low), repeat monthly (low), category rent                                                                                    |
| 8   | `Thanks for shopping with us! Total ₹2,499`                                                                                                                              | amount 2499 (low), `dueOn` undefined, `isBill: false`                                                                                                        |
| 9   | `Bill due on 10/10/2026 amount ₹500`                                                                                                                                     | due `2026-10-10`, `overdue: true`, amount 500                                                                                                                |
| 10  | `Due 25 Oct, pay ₹1,23,456.78`                                                                                                                                           | due `2026-10-25` (medium), amount 123456.78 (Indian grouping)                                                                                                |
| 11  | `03/04/2026` alone                                                                                                                                                       | due `2026-04-03` (DD/MM), confidence `medium`                                                                                                                |
| 12  | `Dear Customer, call 98765 43210 for support. Ref 20261023`                                                                                                              | no amount (digit runs are not amounts), `isBill: false`                                                                                                      |
| 13  | `Quarterly premium ₹6,150 due 15/12/2026`                                                                                                                                | repeat `none` with the quarterly hint, amount 6150                                                                                                           |
| 14  | `Minimum due ₹200. Total due ₹4,500. Pay by 02-Nov-26`                                                                                                                   | amount 4500 (`total`), alternative 200, due `2026-11-02`                                                                                                     |

Additional unit tests:

- `parseINR("1,23,456.78") === 123456.78`; `formatINR(123456.78) === "₹1,23,456.78"`; `formatINR(499) === "₹499"`.
- Date resolution: `25 Oct` before/after `now`; day-of-month-only rollovers; Feb 29/30/31 handling for ordinal rules.
- `findMatch`: reference match, title match for monthly, no match for one-time, normalisation (`Torrent  Power!` equals `torrent power`).
- `unlinkFile(reminders, ["f1"])` clears only matching links.
- Regression: existing `test-ocr.ts` still passes after moving the date helpers.

### 14.2 Manual checklist (device)

1. Share an SMS (Google Messages) → chooser shows **Create a reminder** only → review shows amount and date → save → notification arrives at the chosen time.
2. Share a WhatsApp message with a rent amount → same.
3. Share a screenshot of an electricity bill → shimmer → pre-filled; toggle **Keep the bill**; save → reminder shows a paperclip that opens the image.
4. Share a screenshot with no bill text → "couldn't find an amount or date" banner; manual fill works.
5. Scan a paper bill (3 pages) → one PDF in `Bills/`.
6. Share the same electricity bill next month → duplicate sheet → **Update it** keeps one reminder with the new amount.
7. Turn off **Show document names** → notification says "A reminder is due".
8. Turn airplane mode on, repeat 3: OCR still works (after the model has downloaded once).
9. Lock the phone, share a bill: app asks to unlock first, then shows the chooser.
10. Delete the kept bill from the vault → paperclip disappears, no crash.
11. Update from the previous APK: existing reminders and files remain.

## 15. Acceptance criteria

- [ ] Sharing text from the Android share sheet opens the chooser and leads to a pre-filled reminder form; the old "Nothing to save" dead end is gone.
- [ ] Sharing an image does the same after OCR, with a non-blocking loading state.
- [ ] Every detected value shows its confidence; the date is required; nothing is saved without tapping **Save reminder**.
- [ ] All 14 fixture cases pass in `npm test`; existing suites still pass.
- [ ] No new permission and no network use; `INTERNET` remains removed.
- [ ] Source text is not stored anywhere after the screen closes; temp files are deleted.
- [ ] Duplicate bills offer **Update it** instead of creating a second reminder (phase 3).
- [ ] Deleting a linked file never leaves a dangling `fileId`.
- [ ] Back button and discard clear the pending share intent and temp files.
- [ ] Type check, bundle and `expo prebuild --platform android` succeed.

### Optional extension (not part of this ticket)

Add `repeat: "quarterly"` (and `"everyNMonths"`) to `Repeat`, `occurrenceDates`, the editor chips, and the parser's quarterly handling. Requires planner tests for month stepping.

## 16. Build order for the agent

1. **Refactor** date helpers into `src/ocr/dates.ts`; run `npm test`.
2. **Types and storage**: new `Reminder` fields, `addFiles` returns created files, `ensureFolder("Bills")`, `unlinkFile`. Tests for `unlinkFile`.
3. **`amount.ts`, `billers.ts`, `parseBill.ts`** with the 14 fixtures. Make the tests pass before any UI.
4. **`ShareChooserScreen`** and the `App.tsx` routing change. Text shares end up in the chooser.
5. **`ReminderEditScreen` capture mode**: source card, confidence tags, alternatives chips, reading state, notices.
6. **Image path**: OCR → parse → form; keep-the-bill; temp-file cleanup.
7. **`RemindersScreen`** changes (Scan a bill pill, empty state, category icon, paperclip) and the clipboard chip.
8. **Scan a bill** entry and **Flow E** banner in `ScanScreen`.
9. **`match.ts`** and the duplicate sheet.
10. **PDF module** (phase 4) behind a feature flag until verified on devices.
11. README, version bump to 1.4.0, `versionCode` +1.

## 17. Risks and open questions

| #   | Question / risk                                                                      | Recommended default                                                                          |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | Some messaging apps share text as a stream, not `shareIntent.text`                   | Handle `.txt` streams as text; verify on Google Messages, WhatsApp, Gmail                    |
| 2   | OCR quality on screenshots with dark mode or small fonts                             | Rely on label-based rules; show **What I read** so users can see failures; never auto-save   |
| 3   | Wrong amount chosen on statements with many numbers                                  | Prefer labelled amounts; low confidence + alternatives chips; require user confirmation      |
| 4   | Default for **Keep the bill**                                                        | On for images/scans (users expect to find the bill later); text sources have nothing to keep |
| 5   | Notification privacy for reference numbers                                           | Never include them                                                                           |
| 6   | Dictionary growth and regional billers (Gujarat/Maharashtra boards, local gas/water) | Plain data file; invite additions; fall back to header-line title                            |
| 7   | PDF support needs native code that cannot be tested in CI                            | Ship phases 1–3 first; gate phase 4 behind a flag                                            |
| 8   | Quarterly bills are common for insurance/property tax                                | Out of scope now; see the optional extension                                                 |
| 9   | Ordinal-day rule can mislabel non-bill text ("on the 5th")                           | Only apply when an amount is also present                                                    |
| 10  | Existing users have no `category`/`source`                                           | Fields are optional; UI falls back to `file-text` icon                                       |

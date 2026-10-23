export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  createdAt: number;
};

export type FileField = { id: string; label: string; value: string };

export type VaultFile = {
  id: string;
  folderId: string;
  name: string; // display name (original file name)
  mime: string;
  size: number;
  storedAs: string; // file name inside vault/files
  addedAt: number;
  /** all optional, so older indexes and backups keep working */
  notes?: string;
  tags?: string[];
  /** local calendar date, YYYY-MM-DD */
  expiresOn?: string;
  fields?: FileField[];
};

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

export type Repeat = "none" | "monthly" | "yearly";

export type Reminder = {
  id: string;
  title: string;
  /** first (or only) due date, YYYY-MM-DD */
  dueOn: string;
  /** local time of day, HH:MM */
  time: string;
  repeat: Repeat;
  /** days before the due date to notify; 0 = on the day */
  offsets: number[];
  amount?: string;
  note?: string;
  /** the cycle on or before this date has been marked done (YYYY-MM-DD) */
  doneThrough?: string;
  /** snoozed: notify again at this time (epoch ms) */
  snoozeUntil?: number;
  createdAt: number;
  /** linked bill file in the vault (VaultFile.id) */
  fileId?: string;
  /** consumer number, policy number, phone number (for matching / display) */
  reference?: string;
  category?: ReminderCategory;
  /** for support/debugging only; not shown in UI */
  source?: CaptureSource;
  /** parsed numeric rupees when the amount is INR; enables future totals */
  amountValue?: number;
};

export type Favorite = { kind: "file" | "folder"; id: string };

export type VaultIndex = {
  version: 1;
  folders: Folder[];
  files: VaultFile[];
  /** absent in indexes written before reminders existed */
  reminders?: Reminder[];
  /** in the order the user arranged them; absent in older indexes */
  favorites?: Favorite[];
};

export type IncomingFile = {
  uri: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  /** details to attach to the new file in the same save (from the scan review form) */
  meta?: { fields?: FileField[]; tags?: string[]; expiresOn?: string; notes?: string };
};

export type Settings = {
  lockEnabled: boolean;
  lockAfterSec: number;
  blockScreenshots: boolean;
  remindersEnabled: boolean;
  /** days before expiry to notify; 0 = on the day itself */
  remindOffsets: number[];
  notifyNames: boolean;
  /** read numbers and dates from scans on the phone */
  ocrEnabled: boolean;
  /** draw image previews on the home-screen widget (names are always shown) */
  widgetThumbnails: boolean;
  /** favorite file ids kept off the home-screen widget */
  widgetHidden: string[];
  /** preselected on the Save screen next time */
  lastSaveFolderId?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  lockEnabled: true,
  lockAfterSec: 60,
  blockScreenshots: true,
  remindersEnabled: true,
  remindOffsets: [60, 30, 7, 0],
  notifyNames: true,
  ocrEnabled: true,
  widgetThumbnails: false,
  widgetHidden: [],
};

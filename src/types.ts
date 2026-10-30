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
  /** last opened from inside DocVault (epoch ms) */
  openedAt?: number;
};

export type FileSort = "name" | "added" | "size" | "expiry" | "opened";

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

export type Favorite = { kind: "file" | "folder" | "note"; id: string };

export type EmergencyContact = { id: string; name: string; relation: string; phone: string };

/** The phone owner's details: drawn on the emergency card and offered by autofill. */
export type Profile = {
  name: string;
  /** the owner's own folder, so their saved document numbers are offered together with these details */
  folderId?: string;
  phone?: string;
  email?: string;
  address?: string;
  pincode?: string;
  /** as typed, e.g. 15/08/1990 */
  dob?: string;
  bloodGroup?: string;
  allergies?: string;
  conditions?: string;
  medicines?: string;
  contacts: EmergencyContact[];
  /** for whoever finds the phone, e.g. "Reward if returned" */
  note?: string;
  /** lock screen: medical details are shown unless turned off; the address only if turned on */
  showMedical: boolean;
  showAddress: boolean;
};

export type NoteColor = "default" | "yellow" | "peach" | "rose" | "purple" | "blue" | "mint" | "sage";

export type Note = {
  id: string;
  title: string;
  content: string;
  /** When true, content is secret (passwords, PINs, card info). Description is masked on the list with quick 1-tap copy. */
  isSecret?: boolean;
  pinned?: boolean;
  color?: NoteColor;
  createdAt: number;
  updatedAt: number;
};

export type VaultIndex = {
  version: 1;
  folders: Folder[];
  files: VaultFile[];
  /** absent in indexes written before reminders existed */
  reminders?: Reminder[];
  /** in the order the user arranged them; absent in older indexes */
  favorites?: Favorite[];
  profile?: Profile;
  /** notes and secure credentials; absent in older indexes */
  notes?: Note[];
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
  /** order of files inside a folder */
  fileSort: FileSort;
  /** hand saved details to Android autofill (the details stay encrypted until an unlock) */
  autofillEnabled?: boolean;
  /** emergency card drawn on the lock-screen wallpaper */
  lockCardWallpaper?: boolean;
  /** emergency card as a notification that stays visible on the lock screen */
  lockCardNotification?: boolean;
  /** lock-screen card type: QR code or details card */
  lockCardMode?: LockCardMode;
  /** lock-screen card size: small, medium (default), or large */
  lockCardSize?: LockCardSize;
  /** background photo for the lock-screen card, a file inside the app */
  lockCardPhoto?: string;
  /** show separate tabs for All Notes and Secure / Passwords inside the Notes screen */
  notesTabsEnabled?: boolean;
  /** weekly auto backup at 3:00 AM on Sunday */
  autoBackupEnabled?: boolean;
  /** timestamp when the last weekly auto backup was completed */
  lastAutoBackupTime?: number;
  /** resolved absolute path where the latest auto backup is stored */
  autoBackupPath?: string;
  /** show DocVault inside the system file picker (Documents Provider) */
  documentsProviderEnabled?: boolean;
};

export type LockCardMode = "qr" | "details";
export type LockCardSize = "small" | "medium" | "large";

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
  fileSort: "added",
  lockCardMode: "qr",
  lockCardSize: "medium",
  notesTabsEnabled: true,
  autoBackupEnabled: true,
  documentsProviderEnabled: true,
};


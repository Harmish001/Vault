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

export type VaultIndex = {
  version: 1;
  folders: Folder[];
  files: VaultFile[];
};

export type IncomingFile = {
  uri: string;
  name: string;
  mime?: string | null;
  size?: number | null;
};

export type Settings = {
  lockEnabled: boolean;
  lockAfterSec: number;
  blockScreenshots: boolean;
  remindersEnabled: boolean;
  /** days before expiry to notify; 0 = on the day itself */
  remindOffsets: number[];
  notifyNames: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  lockEnabled: true,
  lockAfterSec: 60,
  blockScreenshots: true,
  remindersEnabled: true,
  remindOffsets: [60, 30, 7, 0],
  notifyNames: true,
};

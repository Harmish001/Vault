export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  createdAt: number;
};

export type VaultFile = {
  id: string;
  folderId: string;
  name: string; // display name (original file name)
  mime: string;
  size: number;
  storedAs: string; // file name inside vault/files
  addedAt: number;
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
};

export const DEFAULT_SETTINGS: Settings = {
  lockEnabled: true,
  lockAfterSec: 60,
  blockScreenshots: true,
};

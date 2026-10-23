import type { BillParseResult } from "./capture/parseBill";
import type { CaptureSource } from "./types";

export type CaptureDraft = {
  result?: BillParseResult;
  source: CaptureSource;
  sourceText?: string;
  imageUris?: string[];
  originalName?: string;
  originalSize?: number;
};

export type RootStackParamList = {
  Home: undefined;
  Folder: { id: string };
  Settings: undefined;
  /** pick: opened from the "Add document" launcher shortcut, so choose files first */
  Save: { pick?: boolean } | undefined;
  Scan: { folderId?: string } | undefined;
  FileDetails: { fileId: string };
  Reminders: undefined;
  ReminderEdit: { id?: string; draft?: CaptureDraft } | undefined;
  ShareChooser: undefined;
  Favorites: undefined;
};

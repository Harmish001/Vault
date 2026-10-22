export type RootStackParamList = {
  Home: undefined;
  Folder: { id: string };
  Settings: undefined;
  Save: undefined;
  Scan: { folderId?: string } | undefined;
  FileDetails: { fileId: string };
};

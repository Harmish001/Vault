import * as FileSystem from "expo-file-system/legacy";

export const SCAN_OUT = (FileSystem.cacheDirectory ?? "") + "scan-out/";
// Where Google's scanner leaves its temporary page images (cleaned at every app start).
export const SCANNER_TMP = (FileSystem.cacheDirectory ?? "") + "mlkit_docscan_ui_client/";

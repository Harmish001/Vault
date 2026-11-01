import { useCallback } from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { canViewInApp } from "../screens/FileViewerScreen";
import type { VaultFile } from "../types";

/**
 * Returns a function that opens a vault file: in the built-in viewer for
 * supported types (image, PDF, text, CSV), or via the system intent
 * launcher for everything else.
 */
export function useOpenFile(
  navigation: NativeStackNavigationProp<RootStackParamList>
) {
  const { openFile } = useVault();
  return useCallback(
    (f: VaultFile) => {
      if (canViewInApp(f.mime, f.name)) {
        navigation.navigate("FileViewer", { fileId: f.id });
      } else {
        openFile(f);
      }
    },
    [navigation, openFile]
  );
}

import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

/** Opens a stored file in whichever installed app handles its type. */
export async function openFile(uri: string, mime: string) {
  try {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: mime,
    });
  } catch {
    Alert.alert(
      "Can't open this file",
      "No app on your phone can open this type of file. Use Share to send it to an app that can."
    );
  }
}

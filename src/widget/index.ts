import { TurboModuleRegistry } from "react-native";
import type { WidgetData } from "./task";

// The widget library throws on import when its native module is missing (Expo Go, or a build
// made before it was added), so it is only loaded when the module exists.
const task: typeof import("./task") | null = TurboModuleRegistry.get("AndroidWidget") ? require("./task") : null;

export function registerWidgets() {
  if (task) require("react-native-android-widget").registerWidgetTaskHandler(task.widgetTaskHandler);
}

export function refreshWidgets(data: WidgetData) {
  task?.refreshWidgets(data);
}

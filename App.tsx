import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold } from "@expo-google-fonts/figtree";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { RootStackParamList } from "./src/navigation";
import { SettingsProvider, useSettings } from "./src/storage/settings";
import { VaultProvider, useVault } from "./src/storage/vault";
import { LockProvider, useLock } from "./src/lock/LockProvider";
import { colors } from "./src/theme";
import HomeScreen from "./src/screens/HomeScreen";
import FolderScreen from "./src/screens/FolderScreen";
import SaveScreen from "./src/screens/SaveScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ScanScreen from "./src/screens/ScanScreen";
import FileDetailsScreen from "./src/screens/FileDetailsScreen";
import { configureNotifications, syncReminders } from "./src/reminders";
import { folderPath } from "./src/utils";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotifications();

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef = createNavigationContainerRef<RootStackParamList>();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const { ready: settingsReady, settings } = useSettings();
  const { ready: vaultReady, files, folders } = useVault();
  const { locked } = useLock();
  const { hasShareIntent, shareIntent } = useShareIntentContext();
  const [navReady, setNavReady] = useState(false);
  const hidden = useRef(false);

  const appReady = fontsReady && settingsReady && vaultReady;
  useEffect(() => {
    if (appReady && !hidden.current) {
      hidden.current = true;
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appReady]);

  // Files shared from the gallery / other apps: wait for unlock, then open the "Save to" screen.
  useEffect(() => {
    if (!appReady || !navReady || locked) return;
    if (hasShareIntent && navRef.getCurrentRoute()?.name !== "Save") {
      navRef.navigate("Save");
    }
  }, [appReady, navReady, locked, hasShareIntent, shareIntent]);

  // Keep scheduled reminders in step with the files (also after a backup restore).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setTick((t) => t + 1));
    return () => sub.remove();
  }, []);
  const entries = useMemo(
    () =>
      files
        .filter((f) => f.expiresOn)
        .map((f) => ({
          id: f.id,
          name: f.name,
          folderId: f.folderId,
          folderLabel: folderPath(folders, f.folderId),
          expiresOn: f.expiresOn as string,
        })),
    [files, folders]
  );
  const reminderSig = JSON.stringify([entries, settings.remindersEnabled, settings.remindOffsets, settings.notifyNames, tick]);
  useEffect(() => {
    if (appReady) syncReminders(entries, settings).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, reminderSig]);

  // Tapping a reminder opens that file's details (after unlock).
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledNote = useRef<string | null>(null);
  useEffect(() => {
    if (!lastResponse || !appReady || !navReady || locked) return;
    const id = lastResponse.notification.request.identifier;
    if (handledNote.current === id) return;
    handledNote.current = id;
    const fileId = (lastResponse.notification.request.content.data as { fileId?: string } | undefined)?.fileId;
    if (fileId) navRef.navigate("FileDetails", { fileId });
  }, [lastResponse, appReady, navReady, locked]);

  if (!appReady) return <View style={{ flex: 1, backgroundColor: colors.primaryDark }} />;

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Folder" component={FolderScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Save" component={SaveScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="FileDetails" component={FileDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  });

  return (
    <SafeAreaProvider>
      {/* resetOnBackground:false keeps a shared file alive while the phone's unlock screen is showing */}
      <ShareIntentProvider options={{ resetOnBackground: false }}>
        <SettingsProvider>
          <VaultProvider>
            <LockProvider>
              <StatusBar style="dark" />
              <Shell fontsReady={fontsLoaded} />
            </LockProvider>
          </VaultProvider>
        </SettingsProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}

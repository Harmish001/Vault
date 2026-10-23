import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Text, ToastAndroid, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
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
import { PASSWORD_REQUIRED, VaultProvider, useVault } from "./src/storage/vault";
import { LockProvider, useLock } from "./src/lock/LockProvider";
import { colors } from "./src/theme";
import HomeScreen from "./src/screens/HomeScreen";
import FolderScreen from "./src/screens/FolderScreen";
import SaveScreen from "./src/screens/SaveScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ScanScreen from "./src/screens/ScanScreen";
import FileDetailsScreen from "./src/screens/FileDetailsScreen";
import { configureNotifications, syncReminders } from "./src/reminders";
import { folderPath, parseISODate, toISODate } from "./src/utils";
import { nextDue } from "./src/reminders-plan";
import { Button, PromptModal } from "./src/components/ui";
import RemindersScreen from "./src/screens/RemindersScreen";
import ReminderEditScreen from "./src/screens/ReminderEditScreen";
import ShareChooserScreen from "./src/screens/ShareChooserScreen";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotifications();

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef = createNavigationContainerRef<RootStackParamList>();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const { ready: settingsReady, settings } = useSettings();
  const { ready: vaultReady, files, folders, reminders, updateReminder, error: vaultError } = useVault();
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

  // Files shared from the gallery / other apps: wait for unlock, then open the chooser screen.
  useEffect(() => {
    if (!appReady || !navReady || locked) return;
    const cur = navRef.getCurrentRoute()?.name;
    if (hasShareIntent && cur !== "ShareChooser" && cur !== "Save" && cur !== "ReminderEdit") {
      navRef.navigate("ShareChooser");
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
  const reminderSig = JSON.stringify([entries, reminders, settings.remindersEnabled, settings.remindOffsets, settings.notifyNames, tick]);
  useEffect(() => {
    if (appReady && !vaultError) syncReminders(entries, reminders, settings).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, reminderSig]);

  // Tapping a notification (or its Snooze / Done button) is handled once the app is unlocked.
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledNote = useRef<string | null>(null);
  useEffect(() => {
    if (!lastResponse || !appReady || !navReady || locked || vaultError) return;
    const id = lastResponse.notification.request.identifier;
    if (handledNote.current === id) return;
    handledNote.current = id;
    const data = lastResponse.notification.request.content.data as { fileId?: string; reminderId?: string; occurrence?: string } | undefined;
    const action = lastResponse.actionIdentifier;

    if (data?.reminderId) {
      const r = reminders.find((x) => x.id === data.reminderId);
      if (!r) {
        ToastAndroid.show("That reminder no longer exists.", ToastAndroid.SHORT);
        return;
      }
      if (action === "done") {
        const occ = data.occurrence ?? nextDue(r) ?? r.dueOn;
        const doneThrough = r.doneThrough && r.doneThrough > occ ? r.doneThrough : occ;
        updateReminder(r.id, { doneThrough, snoozeUntil: undefined })
          .then(() => ToastAndroid.show(`${r.title} marked done`, ToastAndroid.SHORT))
          .catch(() => undefined);
      } else if (action === "snooze") {
        const [h, m] = r.time.split(":").map(Number);
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(h || 9, m || 0, 0, 0);
        updateReminder(r.id, { snoozeUntil: t.getTime() })
          .then(() => ToastAndroid.show(`${r.title} snoozed until tomorrow`, ToastAndroid.SHORT))
          .catch(() => undefined);
      } else {
        navRef.navigate("Reminders");
      }
    } else if (data?.fileId) {
      navRef.navigate("FileDetails", { fileId: data.fileId });
    }
  }, [lastResponse, appReady, navReady, locked, vaultError, reminders, updateReminder]);

  if (!appReady) return <View style={{ flex: 1, backgroundColor: colors.primaryDark }} />;
  if (vaultError) return <VaultProblem message={vaultError} />;

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Folder" component={FolderScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Save" component={SaveScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="FileDetails" component={FileDetailsScreen} />
        <Stack.Screen name="Reminders" component={RemindersScreen} />
        <Stack.Screen name="ReminderEdit" component={ReminderEditScreen} />
        <Stack.Screen name="ShareChooser" component={ShareChooserScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/** Shown instead of the app when the encrypted data can't be read. Nothing is overwritten. */
function VaultProblem({ message }: { message: string }) {
  const { restoreBackup } = useVault();
  const { runExternal } = useLock();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(uri: string, password?: string) {
    setBusy(true);
    setNote(null);
    try {
      await restoreBackup(uri, password);
      setPicked(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === PASSWORD_REQUIRED) setPicked(uri);
      else {
        setPicked(null);
        setNote(msg || "That didn't work. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 28, gap: 14 }}>
      <Text style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 26, color: colors.ink }}>Can't open your data</Text>
      <Text style={{ fontFamily: "Figtree_400Regular", fontSize: 16, lineHeight: 24, color: colors.muted }}>{message}</Text>
      {note ? <Text style={{ fontFamily: "Figtree_500Medium", fontSize: 14, color: colors.danger }}>{note}</Text> : null}
      <Button
        label="Restore from a backup"
        loading={busy}
        onPress={async () => {
          const res = await runExternal(() => DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false }));
          if (!res.canceled && res.assets?.[0]) run(res.assets[0].uri);
        }}
      />
      <PromptModal
        visible={picked !== null}
        title="This backup needs a password"
        placeholder="Backup password"
        secure
        confirmLabel="Restore"
        onCancel={() => setPicked(null)}
        onSubmit={(v) => picked && run(picked, v)}
      />
    </View>
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

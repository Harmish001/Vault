import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Linking, Share, Text, ToastAndroid, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as DocumentPicker from "expo-document-picker";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold } from "@expo-google-fonts/figtree";
import { NavigationContainer, DefaultTheme, StackActions, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { RootStackParamList } from "./src/navigation";
import { SettingsProvider, useSettings } from "./src/storage/settings";
import { PASSWORD_REQUIRED, VaultProvider, useVault } from "./src/storage/vault";
import { LockProvider, useLock } from "./src/lock/LockProvider";
import { colors, fonts } from "./src/theme";
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
import ShareChooserScreen, { isSharedImage } from "./src/screens/ShareChooserScreen";
import FavoritesScreen from "./src/screens/FavoritesScreen";
import MyCardScreen from "./src/screens/MyCardScreen";
import NotesScreen from "./src/screens/NotesScreen";
import NoteEditScreen from "./src/screens/NoteEditScreen";

import { refreshWidgets } from "./src/widget";
import { syncFolderShortcuts } from "./src/folderShortcuts";
import { buildFillProfiles, syncAutofill } from "./src/autofill";
import { showCardNotification } from "./src/emergency";
import { parseBill } from "./src/capture/parseBill";

type AppLink = { action: "open" | "share" | "folder"; id: string } | { action: "scan" } | { action: "add" } | { action: "reminder" };

/**
 * Widget taps: docvault://widget/open?id=… or docvault://widget/share?id=…
 * Launcher shortcuts: docvault://quick/scan, /add, /reminder, and pinned folders as docvault://quick/folder?id=…
 */
function parseAppLink(url: string | null): AppLink | null {
  if (!url) return null;
  const w = /^docvault:\/\/widget\/(open|share)\?id=([^&]+)/.exec(url);
  if (w) return { action: w[1] as "open" | "share", id: decodeURIComponent(w[2]) };
  const q = /^docvault:\/\/quick\/(scan|add|reminder|folder)(?:\?id=([^&]+))?/.exec(url);
  if (!q) return null;
  if (q[1] === "folder") return q[2] ? { action: "folder", id: decodeURIComponent(q[2]) } : null;
  return { action: q[1] } as AppLink;
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotifications();

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef = createNavigationContainerRef<RootStackParamList>();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const { ready: settingsReady, settings } = useSettings();
  const { ready: vaultReady, files, folders, reminders, favorites, notes, profile, updateReminder, openFile, shareFile, error: vaultError } = useVault();
  const { locked, relockDue } = useLock();
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

  // Files shared from the gallery / other apps: wait for unlock, then go where the share can be used.
  // Only photos get the chooser; text can only become a reminder and other files can only be saved.
  useEffect(() => {
    if (!appReady || !navReady || locked) return;
    const cur = navRef.getCurrentRoute()?.name;
    if (!hasShareIntent || cur === "ShareChooser" || cur === "Save" || cur === "ReminderEdit") return;
    const shared = shareIntent.files ?? [];
    const text = shareIntent.text || shareIntent.webUrl || "";
    if (!shared.length && text) {
      navRef.navigate("ReminderEdit", { draft: { result: parseBill(text), source: "share-text", sourceText: text } });
    } else if (shared.length && !shared.some(isSharedImage)) {
      navRef.navigate("Save");
    } else {
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
    const data = lastResponse.notification.request.content.data as
      | { fileId?: string; reminderId?: string; occurrence?: string; emergencyCard?: boolean }
      | undefined;
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
    } else if (data?.emergencyCard) {
      navRef.navigate("MyCard");
    }
  }, [lastResponse, appReady, navReady, locked, vaultError, reminders, updateReminder]);

  // Home-screen widget: redraw from the unlocked app whenever what it shows may have changed.
  useEffect(() => {
    if (appReady && !vaultError) refreshWidgets({ index: { files, folders, favorites, notes }, settings });
  }, [appReady, vaultError, files, folders, favorites, notes, settings]);

  useEffect(() => {
    if (appReady && !vaultError) syncFolderShortcuts(folders);
  }, [appReady, vaultError, folders]);

  // Autofill reads its own encrypted copy, refreshed here while the app is unlocked.
  useEffect(() => {
    if (!appReady || vaultError) return;
    syncAutofill(settings.autofillEnabled ? buildFillProfiles(folders, files, profile) : null);
  }, [appReady, vaultError, settings.autofillEnabled, folders, files, profile]);

  // Android drops notifications on restart; put the emergency card back on the lock screen.
  useEffect(() => {
    if (appReady && !vaultError && settings.lockCardNotification && profile?.name.trim()) {
      showCardNotification(profile).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, vaultError]);

  // Widget and launcher-shortcut taps act only after the same unlock as opening the app.
  const [appLink, setAppLink] = useState<AppLink | null>(null);
  useEffect(() => {
    Linking.getInitialURL().then((u) => setAppLink(parseAppLink(u)));
    const sub = Linking.addEventListener("url", (e) => {
      const link = parseAppLink(e.url);
      if (link) setAppLink(link);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!appLink || !appReady || !navReady || locked || relockDue() || vaultError) return;
    setAppLink(null);
    // push, not navigate: a shortcut always starts a fresh scan / document / reminder
    if (appLink.action === "scan") return navRef.dispatch(StackActions.push("Scan"));
    if (appLink.action === "add") return navRef.dispatch(StackActions.push("Save", { pick: true }));
    if (appLink.action === "reminder") return navRef.dispatch(StackActions.push("ReminderEdit"));
    if (appLink.action === "folder") {
      if (folders.some((x) => x.id === appLink.id)) navRef.navigate("Folder", { id: appLink.id });
      else ToastAndroid.show("That folder is no longer in DocVault.", ToastAndroid.SHORT);
      return;
    }
    const f = files.find((x) => x.id === appLink.id);
    const n = notes.find((x) => x.id === appLink.id);
    if (n) {
      if (appLink.action === "share") {
        Share.share({ title: n.title, message: n.content }).catch(() => Alert.alert("Couldn't share this note"));
      } else {
        navRef.navigate("NoteEdit", { id: n.id });
      }
      return;
    }
    if (!f) {
      ToastAndroid.show("That item is no longer in DocVault.", ToastAndroid.SHORT);
    } else if (appLink.action === "share") {
      shareFile(f).catch(() => Alert.alert("Couldn't share this file"));
    } else {
      openFile(f);
    }
  }, [appLink, appReady, navReady, locked, relockDue, vaultError, files, folders, notes, openFile, shareFile]);

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
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="MyCard" component={MyCardScreen} />
        <Stack.Screen name="Notes" component={NotesScreen} options={{ animation: "none" }} />
        <Stack.Screen name="NoteEdit" component={NoteEditScreen} />
      </Stack.Navigator>

    </NavigationContainer>
  );
}

/** Shown instead of the app when the encrypted data can't be read. Nothing is overwritten. */
function VaultProblem({ message }: { message: string }) {
  const { restoreBackup, startFresh, errorDetail } = useVault();
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
      <Text style={{ fontFamily: fonts.title, fontSize: 26, color: colors.ink }}>Can't open your data</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted }}>{message}</Text>
      {errorDetail ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>Details: {errorDetail}</Text> : null}
      {note ? <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.danger }}>{note}</Text> : null}
      <Button
        label="Restore from a backup"
        loading={busy}
        onPress={async () => {
          const res = await runExternal(() => DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false }));
          if (!res.canceled && res.assets?.[0]) run(res.assets[0].uri);
        }}
      />
      <Button
        label="Start fresh, keep my files"
        kind="secondary"
        disabled={busy}
        onPress={() =>
          Alert.alert(
            "Start fresh?",
            "Your stored documents are kept and listed in a “Recovered files” folder. Their names, folders, details and reminders can't be brought back. The unreadable data is set aside on the phone, not deleted.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Start fresh",
                style: "destructive",
                onPress: async () => {
                  setBusy(true);
                  setNote(null);
                  try {
                    const n = await startFresh();
                    ToastAndroid.show(n ? `${n} files recovered` : "Started fresh", ToastAndroid.SHORT);
                  } catch (e) {
                    setNote(e instanceof Error ? e.message : "That didn't work. Please try again.");
                  } finally {
                    setBusy(false);
                  }
                },
              },
            ]
          )
        }
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}

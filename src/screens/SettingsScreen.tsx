import React, { useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as IntentLauncher from "expo-intent-launcher";
import { File as PickedFile } from "expo-file-system";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { BACKUPS_UNAVAILABLE, PASSWORD_REQUIRED, backupFileName, useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { colors, fonts, radius } from "../theme";
import { formatBytes, plural } from "../utils";
import { Button, PromptModal, ScreenHeader } from "../components/ui";
import { useLock } from "../lock/LockProvider";
import { requestReminderPermission } from "../reminders";
import { autofillSelected, autofillSupported, openAutofillSettings, turnOffAutofill } from "../autofill";

const OFFSET_OPTIONS = [
  { label: "90 days", d: 90 },
  { label: "60 days", d: 60 },
  { label: "30 days", d: 30 },
  { label: "7 days", d: 7 },
  { label: "1 day", d: 1 },
  { label: "On the day", d: 0 },
];

const LOCK_OPTIONS = [
  { label: "1 min", sec: 60 },
  { label: "5 min", sec: 300 },
  { label: "15 min", sec: 900 },
];

export default function SettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Settings">) {
  const { settings, update } = useSettings();
  const { files, folders, totalBytes, exportBackup, restoreBackup } = useVault();
  const insets = useSafeAreaInsets();
  const { runExternal } = useLock();
  const [exportPrompt, setExportPrompt] = useState(false);
  const [restorePrompt, setRestorePrompt] = useState<string | null>(null); // picked file uri awaiting a password
  const [busy, setBusy] = useState<null | "export" | "restore">(null);
  const [fillSelected, setFillSelected] = useState(autofillSelected);

  // The autofill choice is made in Android's settings, so check again whenever we come back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setFillSelected(autofillSelected()));
    return () => sub.remove();
  }, []);

  function chooseAutofill() {
    if (!openAutofillSettings()) {
      Alert.alert("Open it from Settings", "Open the phone's Settings, search for “Autofill service” and choose DocVault.");
    }
  }

  function toggleAutofill(on: boolean) {
    if (!on) {
      turnOffAutofill();
      update({ autofillEnabled: false });
      return;
    }
    if (!autofillSupported()) {
      Alert.alert("Not available", "This phone doesn't support autofill services.");
      return;
    }
    update({ autofillEnabled: true });
    if (fillSelected) return;
    Alert.alert(
      "Choose DocVault for autofill",
      "Android lets one app fill forms at a time. If Google or a password manager fills your passwords today, choosing DocVault replaces it for other apps' forms. Newer Android versions may keep your password manager as an additional service.",
      [
        { text: "Later", style: "cancel" },
        { text: "Choose DocVault", onPress: chooseAutofill },
      ]
    );
  }

  function chooseDestination(password: string) {
    setExportPrompt(false);
    Alert.alert("Where should the backup go?", "Save it to Google Drive, Downloads or another folder, or send it with an app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Share…", onPress: () => doExport(password) },
      { text: "Save to Files / Drive", onPress: () => saveToFiles(password) },
    ]);
  }

  async function saveToFiles(password: string) {
    // Android's "save as" screen lists Drive, Downloads and phone folders, and returns a writable uri.
    const res = await runExternal(() =>
      IntentLauncher.startActivityAsync("android.intent.action.CREATE_DOCUMENT", {
        type: "application/zip",
        category: "android.intent.category.OPENABLE",
        extra: { "android.intent.extra.TITLE": backupFileName() },
      })
    ).catch(() => null);
    if (res?.resultCode === IntentLauncher.ResultCode.Success && res.data) doExport(password, res.data);
  }

  async function doExport(password: string, saveTo?: string) {
    setBusy("export");
    try {
      await exportBackup(password || undefined, saveTo);
      if (saveTo) Alert.alert("Backup saved", "Keep it somewhere safe. You'll need it to restore DocVault on a new phone.");
    } catch (e) {
      if (saveTo) {
        try {
          new PickedFile(saveTo).delete(); // don't leave an empty backup file behind
        } catch {
          // best effort
        }
      }
      const msg = e instanceof Error && e.message === BACKUPS_UNAVAILABLE ? e.message : null;
      Alert.alert("Backup failed", msg ?? "The backup file couldn't be created. Check that your phone has free space and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function runRestore(uri: string, password?: string) {
    setBusy("restore");
    try {
      await restoreBackup(uri, password);
      setRestorePrompt(null);
      Alert.alert("Backup restored", "Your folders and files are back.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === PASSWORD_REQUIRED) {
        setRestorePrompt(uri);
      } else {
        setRestorePrompt(null);
        Alert.alert("Couldn't restore", msg || "Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  function startRestore() {
    Alert.alert(
      "Replace everything with a backup?",
      "All folders and files currently in DocVault will be replaced by what's in the backup file.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Choose backup file",
          style: "destructive",
          onPress: async () => {
            const res = await runExternal(() => DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false }));
            if (!res.canceled && res.assets?.[0]) runRestore(res.assets[0].uri);
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 18 }}>
        <Section title="Security">
          <Row
            title="Require unlock"
            body="Ask for your fingerprint, face, or phone PIN when opening DocVault."
            right={<Switch value={settings.lockEnabled} onValueChange={(v) => update({ lockEnabled: v })} trackColor={{ true: colors.primary }} />}
          />
          {settings.lockEnabled ? (
            <View style={styles.block}>
              <Text style={styles.rowTitle}>Lock again after leaving the app for</Text>
              <View style={styles.pills}>
                {LOCK_OPTIONS.map((o) => (
                  <Pressable
                    key={o.sec}
                    onPress={() => update({ lockAfterSec: o.sec })}
                    style={[styles.pill, settings.lockAfterSec === o.sec && styles.pillOn]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.pillText, settings.lockAfterSec === o.sec && { color: colors.onPrimary }]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <Row
            title="Block screenshots"
            body="Hides DocVault from screenshots, screen recording and the recent-apps view."
            right={<Switch value={settings.blockScreenshots} onValueChange={(v) => update({ blockScreenshots: v })} trackColor={{ true: colors.primary }} />}
          />
        </Section>

        <Section title="Autofill and My card">
          <Row
            title="Fill forms from DocVault"
            body="In other apps and websites, offer your saved Aadhaar, PAN, passport, licence and other numbers, plus your details from My card. Every fill asks for your fingerprint or PIN first."
            right={<Switch value={!!settings.autofillEnabled} onValueChange={toggleAutofill} trackColor={{ true: colors.primary }} />}
          />
          {settings.autofillEnabled ? (
            <View style={styles.block}>
              <Text style={styles.body}>
                {fillSelected
                  ? "DocVault is this phone's autofill service. Tap a form field such as “PAN number”, then “Fill from DocVault”."
                  : "One more step: choose DocVault as the phone's autofill service."}
              </Text>
              {!fillSelected ? <Button label="Choose DocVault in Android settings" onPress={chooseAutofill} style={{ marginTop: 12 }} /> : null}
            </View>
          ) : null}
          <View style={styles.block}>
            <Text style={styles.body}>Your name, contacts and blood group for the lock screen, and the details autofill uses.</Text>
            <Button label="Open My card" kind="secondary" onPress={() => navigation.navigate("MyCard")} style={{ marginTop: 12 }} />
          </View>
        </Section>

        <Section title="Scanner">
          <Row
            title="Read details from scans"
            body="After a scan, find document numbers and expiry dates on the phone and offer to save them. Nothing is uploaded."
            right={<Switch value={settings.ocrEnabled} onValueChange={(v) => update({ ocrEnabled: v })} trackColor={{ true: colors.primary }} />}
          />
        </Section>

        <Section title="Reminders">
          <Row
            title="Notifications"
            body="Show notifications for your reminders and for document expiry dates."
            right={
              <Switch
                value={settings.remindersEnabled}
                trackColor={{ true: colors.primary }}
                onValueChange={async (v) => {
                  await update({ remindersEnabled: v });
                  if (v && !(await requestReminderPermission())) {
                    Alert.alert(
                      "Notifications are off",
                      "Turn on notifications for DocVault in Android settings to receive reminders.",
                      [{ text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => Linking.openSettings() }]
                    );
                  }
                }}
              />
            }
          />
          {settings.remindersEnabled ? (
            <>
              <View style={styles.block}>
                <Text style={styles.rowTitle}>Remind me before a document expires</Text>
                <View style={styles.pills}>
                  {OFFSET_OPTIONS.map((o) => {
                    const on = settings.remindOffsets.includes(o.d);
                    return (
                      <Pressable
                        key={o.d}
                        accessibilityRole="button"
                        onPress={() => {
                          const next = on ? settings.remindOffsets.filter((x) => x !== o.d) : [...settings.remindOffsets, o.d];
                          if (next.length) update({ remindOffsets: next.sort((a, b) => b - a) });
                        }}
                        style={[styles.pill, on && styles.pillOn]}
                      >
                        <Text style={[styles.pillText, on && { color: colors.onPrimary }]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Row
                title="Show document names"
                body="Turn off to show only “A document expires soon” in notifications. Android can also hide notification text on the lock screen."
                right={<Switch value={settings.notifyNames} onValueChange={(v) => update({ notifyNames: v })} trackColor={{ true: colors.primary }} />}
              />
            </>
          ) : null}
        </Section>

        <Section title="Notes">
          <Row
            title="Separate category tabs"
            body="Show separate tabs for All Notes and Secure / Passwords inside the Notes screen."
            right={
              <Switch
                value={settings.notesTabsEnabled ?? true}
                onValueChange={(v) => update({ notesTabsEnabled: v })}
                trackColor={{ true: colors.primary }}
              />
            }
          />
        </Section>

        <Section title="Home-screen widget">
          <View style={styles.block}>
            <Text style={styles.body}>
              Add “DocVault favorite” or “DocVault favorites” from your launcher's widget list. The widget shows names of your favorite documents on the home screen; opening or sharing still asks for unlock.
            </Text>
            <Button label="Choose documents for the widget" kind="secondary" onPress={() => navigation.navigate("Favorites")} style={{ marginTop: 12 }} />
          </View>
          <Row
            title="Show image previews"
            body="Draw small previews of favorite photos on the widget. Anyone who sees your home screen can see them."
            right={<Switch value={settings.widgetThumbnails} onValueChange={(v) => update({ widgetThumbnails: v })} trackColor={{ true: colors.primary }} />}
          />
        </Section>

        <Section title="Backup">
          <View style={styles.block}>
            <Text style={styles.body}>
              Your documents live only on this phone. If it's lost, reset, or DocVault is uninstalled, they're gone unless you've saved a backup file somewhere safe, like Google Drive or a computer.
            </Text>
            <Button label="Export backup" loading={busy === "export"} onPress={() => setExportPrompt(true)} style={{ marginTop: 14 }} />
            <Button label="Restore from backup" kind="secondary" loading={busy === "restore"} onPress={startRestore} style={{ marginTop: 10 }} />
          </View>
        </Section>

        <Section title="Storage">
          <View style={styles.block}>
            <Text style={styles.rowTitle}>
              {plural(files.length, "file")} in {plural(folders.length, "folder")}
            </Text>
            <Text style={styles.body}>{formatBytes(totalBytes)} used on this phone</Text>
          </View>
        </Section>

        <Text style={styles.about}>
          DocVault {Constants.expoConfig?.version ?? ""}. The app has no internet permission, so your files can't be uploaded by DocVault itself.
        </Text>
      </ScrollView>

      <PromptModal
        visible={exportPrompt}
        title="Protect the backup file"
        placeholder="Password (optional)"
        secure
        allowEmpty
        confirmLabel="Export"
        hint="A password encrypts the backup with AES-256. Without one, anyone who gets the file can read every document in it. A forgotten password can't be recovered."
        onCancel={() => setExportPrompt(false)}
        onSubmit={(v) => chooseDestination(v)}
      />
      <PromptModal
        visible={restorePrompt !== null}
        title="This backup needs a password"
        placeholder="Backup password"
        secure
        confirmLabel="Restore"
        onCancel={() => setRestorePrompt(null)}
        onSubmit={(v) => restorePrompt && runRestore(restorePrompt, v)}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row(props: { title: string; body: string; right: React.ReactNode }) {
  return (
    <View style={[styles.block, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.body}>{props.body}</Text>
      </View>
      {props.right}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden" },
  block: { padding: 16 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 3 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  about: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: "center", paddingHorizontal: 12 },
});

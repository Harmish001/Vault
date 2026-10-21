import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { PASSWORD_REQUIRED, useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { colors, fonts, radius } from "../theme";
import { formatBytes, plural } from "../utils";
import { Button, PromptModal, ScreenHeader } from "../components/ui";

const LOCK_OPTIONS = [
  { label: "1 min", sec: 60 },
  { label: "5 min", sec: 300 },
  { label: "15 min", sec: 900 },
];

export default function SettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Settings">) {
  const { settings, update } = useSettings();
  const { files, folders, totalBytes, exportBackup, restoreBackup } = useVault();
  const insets = useSafeAreaInsets();
  const [exportPrompt, setExportPrompt] = useState(false);
  const [restorePrompt, setRestorePrompt] = useState<string | null>(null); // picked file uri awaiting a password
  const [busy, setBusy] = useState<null | "export" | "restore">(null);

  async function doExport(password: string) {
    setExportPrompt(false);
    setBusy("export");
    try {
      await exportBackup(password || undefined);
    } catch {
      Alert.alert("Backup failed", "The backup file couldn't be created. Check that your phone has free space and try again.");
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
            const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false });
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
                    <Text style={[styles.pillText, settings.lockAfterSec === o.sec && { color: "#fff" }]}>{o.label}</Text>
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
        onSubmit={(v) => doExport(v)}
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
  pills: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  about: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: "center", paddingHorizontal: 12 },
});

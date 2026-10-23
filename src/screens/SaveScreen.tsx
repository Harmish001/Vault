import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import { useShareIntentContext } from "expo-share-intent";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { useLock } from "../lock/LockProvider";
import { colors, fonts, radius } from "../theme";
import { folderPath, formatBytes, plural } from "../utils";
import type { Folder } from "../types";
import { FileThumb } from "../components/Rows";
import { FolderPicker } from "../components/FolderPicker";
import { Button, EmptyState, ScreenHeader } from "../components/ui";
import { useNameSuggestions } from "../components/NameSuggestions";

type Item = { path: string; fileName?: string | null; mimeType?: string | null; size?: number | null };

/** Shown when files are shared into DocVault, or picked from the "Add document" launcher shortcut. */
export default function SaveScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Save">) {
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const { addFiles, folders, favorites } = useVault();
  const { settings, update } = useSettings();
  const { runExternal } = useLock();
  const insets = useSafeAreaInsets();
  const pick = !!route.params?.pick;
  const [picked, setPicked] = useState<Item[] | null>(null);
  const [dest, setDest] = useState<string | null>(() =>
    folders.some((f) => f.id === settings.lastSaveFolderId) ? (settings.lastSaveFolderId as string) : null
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const names = useNameSuggestions();

  const incoming: Item[] = pick ? picked ?? [] : shareIntent.files ?? [];
  // Keep the list on screen even after the intent is reset at the end of a save.
  const snapshot = useRef(incoming);
  if (incoming.length) snapshot.current = incoming;
  const list = snapshot.current;

  // Last-used folder first, then favorite folders: one tap instead of browsing the picker.
  const quick = useMemo(() => {
    const ids = [settings.lastSaveFolderId, ...favorites.filter((f) => f.kind === "folder").map((f) => f.id)];
    return [...new Set(ids)]
      .map((id) => folders.find((f) => f.id === id))
      .filter((f): f is Folder => !!f)
      .slice(0, 6);
  }, [settings.lastSaveFolderId, favorites, folders]);

  // Leaving this screen any way (save, back button) clears the pending share.
  const resetRef = useRef(resetShareIntent);
  resetRef.current = resetShareIntent;
  useEffect(() => () => {
    if (!pick) resetRef.current();
  }, [pick]);

  const close = () => (pick ? navigation.goBack() : navigation.reset({ index: 0, routes: [{ name: "Home" }] }));

  useEffect(() => {
    if (!pick) return;
    runExternal(() => DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: false }))
      .then((res) => {
        if (res.canceled || !res.assets?.length) return navigation.goBack();
        setPicked(res.assets.map((a) => ({ path: a.uri, fileName: a.name, mimeType: a.mimeType, size: a.size })));
      })
      .catch(() => navigation.goBack());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  async function save() {
    if (!dest) return;
    setSaving(true);
    try {
      const out = await addFiles(
        dest,
        list.map((f) => ({ uri: f.path, name: f.fileName || "document", mime: f.mimeType, size: f.size }))
      );
      if (out.failed.length) {
        Alert.alert(`${plural(out.added, "file")} saved`, `These couldn't be added:\n${out.failed.join("\n")}`);
      }
      update({ lastSaveFolderId: dest });
      await names.review(out.files, () =>
        navigation.reset({
          index: 1,
          routes: [{ name: "Home" }, { name: "Folder", params: { id: dest } }],
        })
      );
    } catch {
      Alert.alert("Couldn't save", "Something went wrong. Nothing was lost; please try again.");
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={pick ? "Add to DocVault" : "Save to DocVault"}
        subtitle={list.length ? plural(list.length, "file") + (pick ? " chosen" : " shared") : undefined}
        onBack={close}
      />
      {pick && !picked ? null : list.length === 0 ? (
        <EmptyState
          title="Nothing to save"
          body="DocVault saves files. Share a photo, PDF or document from your gallery or another app and choose DocVault."
          action={<Button label="Back to my folders" onPress={close} />}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {list.map((f, i) => (
              <View key={f.path + i} style={styles.item}>
                <FileThumb name={f.fileName || "file"} mime={f.mimeType || ""} uri={f.path} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{f.fileName || "Untitled"}</Text>
                  {f.size ? <Text style={styles.itemSub}>{formatBytes(f.size)}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={styles.label}>Save into</Text>
            <Text style={styles.dest} numberOfLines={1}>
              {dest ? folderPath(folders, dest) : "No folder chosen yet"}
            </Text>
            {quick.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 6 }}>
                {quick.map((f) => {
                  const on = f.id === dest;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setDest(f.id)}
                      style={[styles.chip, on && { borderColor: f.color, backgroundColor: f.color + "26" }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Save into ${f.name}`}
                    >
                      <Feather name="folder" size={15} color={f.color} />
                      <Text style={styles.chipText} numberOfLines={1}>{f.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <Button
              label={dest ? "Choose a different folder" : "Choose folder"}
              kind={dest ? "secondary" : "primary"}
              onPress={() => setPicking(true)}
            />
            {dest ? (
              <Button
                label={`Save ${plural(list.length, "file")}`}
                loading={saving}
                onPress={save}
                style={{ marginTop: 10 }}
              />
            ) : null}
          </View>
        </>
      )}

      <FolderPicker
        visible={picking}
        title="Save into"
        confirmLabel="Use"
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setDest(id);
          setPicking(false);
        }}
      />
      {names.element}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  itemName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 8,
    elevation: 8,
  },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  dest: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink, marginBottom: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flexShrink: 1 },
});

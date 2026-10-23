import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { colors, fonts } from "../theme";
import { FileSort } from "../types";
import { SORT_LABELS, countInside, folderPath, plural, sortFiles } from "../utils";
import { FavStar, FileRow, FolderRow } from "../components/Rows";
import { isFavorite } from "../favorites";
import { useFileActions, useFolderActions } from "../components/actions";
import { useFileSelection } from "../components/batch";
import { useNameSuggestions } from "../components/NameSuggestions";
import { ActionMenu, EmptyState, FabBar, IconButton, Pill, PromptModal, ScreenHeader } from "../components/ui";
import { useLock } from "../lock/LockProvider";

export default function FolderScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Folder">) {
  const { id } = route.params;
  const { folders, files, createFolder, addFiles, fileUri, openFile, favorites, toggleFavorite } = useVault();
  const { settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const { runExternal } = useLock();
  const [newFolder, setNewFolder] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileActions = useFileActions();
  const folderActions = useFolderActions(() => navigation.goBack());
  const names = useNameSuggestions();

  const folder = folders.find((f) => f.id === id);
  useEffect(() => {
    if (!folder && navigation.canGoBack()) navigation.goBack();
  }, [folder, navigation]);

  const subfolders = useMemo(
    () => folders.filter((f) => f.parentId === id).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, id]
  );
  const here = useMemo(
    () => sortFiles(files.filter((f) => f.folderId === id), settings.fileSort),
    [files, id, settings.fileSort]
  );
  const selection = useFileSelection(here, id);
  if (!folder) return null;

  async function pickFiles() {
    try {
      const res = await runExternal(() =>
        DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: false })
      );
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      const out = await addFiles(
        id,
        res.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType, size: a.size }))
      );
      if (out.failed.length) {
        Alert.alert("Some files weren't added", out.failed.join("\n"));
      }
      await names.review(out.files);
    } catch {
      Alert.alert("Couldn't add files", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = !subfolders.length && !here.length;
  const sortKeys = Object.keys(SORT_LABELS) as FileSort[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {selection.selecting ? (
        selection.header
      ) : (
        <ScreenHeader
          title={folder.name}
          subtitle={folder.parentId ? folderPath(folders, folder.parentId) : plural(here.length, "file")}
          onBack={() => navigation.goBack()}
          right={
            <>
              <FavStar on={isFavorite(favorites, "folder", id)} onPress={() => toggleFavorite("folder", id)} label={folder.name} size={22} />
              <IconButton icon="folder-plus" label="New subfolder" onPress={() => setNewFolder(true)} />
              <IconButton icon="more-vertical" label="Folder options" onPress={() => folderActions.open(folder)} />
            </>
          }
        />
      )}
      <View style={[styles.accent, { backgroundColor: folder.color }]} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110, paddingHorizontal: 8, paddingTop: 8 }}>
        {!selection.selecting &&
          subfolders.map((f) => {
            const n = countInside(folders, files, f.id);
            return (
              <FolderRow
                key={f.id}
                folder={f}
                detail={plural(n.files, "file")}
                onPress={() => navigation.push("Folder", { id: f.id })}
              />
            );
          })}
        {here.length > 1 ? (
          <View style={styles.sortRow}>
            <Pressable
              onPress={() => setSortMenu(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Sorted by ${SORT_LABELS[settings.fileSort]}. Change order`}
              style={styles.sortBtn}
            >
              <Feather name="bar-chart-2" size={14} color={colors.primary} style={{ transform: [{ rotate: "90deg" }] }} />
              <Text style={styles.sortText}>{SORT_LABELS[settings.fileSort]}</Text>
              <Feather name="chevron-down" size={14} color={colors.primary} />
            </Pressable>
            {!selection.selecting ? <Text style={styles.sortHint}>Press and hold to select</Text> : null}
          </View>
        ) : null}
        {here.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            uri={fileUri(f)}
            onPress={() => (selection.selecting ? selection.toggle(f.id) : openFile(f))}
            onLongPress={() => selection.toggle(f.id)}
            selected={selection.selecting ? selection.isSelected(f.id) : undefined}
            onMenu={() => fileActions.open(f)}
            favorite={isFavorite(favorites, "file", f.id)}
            onToggleFavorite={() => toggleFavorite("file", f.id)}
          />
        ))}
        {empty ? (
          <EmptyState
            title="Nothing in this folder yet"
            body="Tap Add files to pick documents or photos. They're copied into DocVault, so the originals stay where they are."
          />
        ) : null}
      </ScrollView>

      {selection.selecting ? (
        selection.bar
      ) : (
        <FabBar>
          <Pill icon="camera" label="Scan" tone="dark" disabled={busy} onPress={() => navigation.navigate("Scan", { folderId: id })} />
          <Pill icon={busy ? "loader" : "plus"} label={busy ? "Adding…" : "Add files"} disabled={busy} onPress={pickFiles} />
        </FabBar>
      )}

      <ActionMenu
        visible={sortMenu}
        title="Sort files by"
        onClose={() => setSortMenu(false)}
        items={sortKeys.map((k) => ({
          label: SORT_LABELS[k],
          icon: k === settings.fileSort ? "check" : SORT_ICONS[k],
          onPress: () => update({ fileSort: k }),
        }))}
      />
      <PromptModal
        visible={newFolder}
        title="New subfolder"
        placeholder="e.g. Aadhaar, PAN, Passport"
        confirmLabel="Create"
        withColor
        initialColor={folder.color}
        onCancel={() => setNewFolder(false)}
        onSubmit={async (name, color) => {
          setNewFolder(false);
          await createFolder(name, id, color);
        }}
      />
      {fileActions.element}
      {folderActions.element}
      {selection.element}
      {names.element}
    </View>
  );
}

const SORT_ICONS: Record<FileSort, React.ComponentProps<typeof Feather>["name"]> = {
  added: "clock",
  name: "type",
  size: "hard-drive",
  expiry: "calendar",
  opened: "eye",
};

const styles = StyleSheet.create({
  accent: { height: 4, marginHorizontal: 16, borderRadius: 2 },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  sortText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  sortHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});

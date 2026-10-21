import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts } from "../theme";
import { countInside, folderPath, plural, sortFiles } from "../utils";
import { openFile } from "../openFile";
import { FileRow, FolderRow } from "../components/Rows";
import { useFileActions, useFolderActions } from "../components/actions";
import { EmptyState, IconButton, PromptModal, ScreenHeader } from "../components/ui";

export default function FolderScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Folder">) {
  const { id } = route.params;
  const { folders, files, createFolder, addFiles, fileUri } = useVault();
  const insets = useSafeAreaInsets();
  const [newFolder, setNewFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileActions = useFileActions();
  const folderActions = useFolderActions(() => navigation.goBack());

  const folder = folders.find((f) => f.id === id);
  useEffect(() => {
    if (!folder && navigation.canGoBack()) navigation.goBack();
  }, [folder, navigation]);

  const subfolders = useMemo(
    () => folders.filter((f) => f.parentId === id).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, id]
  );
  const here = useMemo(() => sortFiles(files.filter((f) => f.folderId === id)), [files, id]);
  if (!folder) return null;

  async function pickFiles() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: false });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      const out = await addFiles(
        id,
        res.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType, size: a.size }))
      );
      if (out.failed.length) {
        Alert.alert("Some files weren't added", out.failed.join("\n"));
      }
    } catch {
      Alert.alert("Couldn't add files", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = !subfolders.length && !here.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={folder.name}
        subtitle={folder.parentId ? folderPath(folders, folder.parentId) : plural(here.length, "file")}
        onBack={() => navigation.goBack()}
        right={
          <>
            <IconButton icon="folder-plus" label="New subfolder" onPress={() => setNewFolder(true)} />
            <IconButton icon="more-vertical" label="Folder options" onPress={() => folderActions.open(folder)} />
          </>
        }
      />
      <View style={[styles.accent, { backgroundColor: folder.color }]} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110, paddingHorizontal: 8, paddingTop: 8 }}>
        {subfolders.map((f) => {
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
        {here.map((f) => (
          <FileRow key={f.id} file={f} uri={fileUri(f)} onPress={() => openFile(fileUri(f), f.mime)} onMenu={() => fileActions.open(f)} />
        ))}
        {empty ? (
          <EmptyState
            title="Nothing in this folder yet"
            body="Tap Add files to pick documents or photos. They're copied into DocVault, so the originals stay where they are."
          />
        ) : null}
      </ScrollView>

      <Pressable
        onPress={pickFiles}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, (pressed || busy) && { opacity: 0.8 }]}
      >
        <Feather name={busy ? "loader" : "plus"} size={22} color={colors.primaryDark} />
        <Text style={styles.fabText}>{busy ? "Adding…" : "Add files"}</Text>
      </Pressable>

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
    </View>
  );
}

const styles = StyleSheet.create({
  accent: { height: 4, marginHorizontal: 16, borderRadius: 2 },
  fab: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    height: 54,
    borderRadius: 27,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primaryDark },
});

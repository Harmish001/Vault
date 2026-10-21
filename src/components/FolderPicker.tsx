import React, { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useVault } from "../storage/vault";
import { colors, folderColors, fonts, radius } from "../theme";
import { countInside, folderPath, plural } from "../utils";
import { Button, IconButton } from "./ui";

/** Full-screen folder browser. Pick a destination; files can't live at the top level. */
export function FolderPicker(props: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  disabledFolderId?: string | null;
  onClose: () => void;
  onPick: (folderId: string) => void;
}) {
  const { folders, files, createFolder } = useVault();
  const insets = useSafeAreaInsets();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (props.visible) {
      setCurrentId(null);
      setCreating(false);
      setNewName("");
    }
  }, [props.visible]);

  const children = folders
    .filter((f) => f.parentId === currentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const here = currentId ? folders.find((f) => f.id === currentId) : null;
  const parentOfHere = here?.parentId ?? null;
  const canPickHere = !!currentId && currentId !== props.disabledFolderId;

  async function makeFolder() {
    const name = newName.trim();
    if (!name) return;
    const f = await createFolder(name, currentId, folderColors[folders.length % folderColors.length]);
    setCreating(false);
    setNewName("");
    setCurrentId(f.id);
  }

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.head}>
          <IconButton icon="x" label="Close" onPress={props.onClose} />
          <Text style={styles.title}>{props.title}</Text>
        </View>

        <View style={styles.crumb}>
          {here ? (
            <Pressable onPress={() => setCurrentId(parentOfHere)} style={styles.up} accessibilityRole="button" accessibilityLabel="Up one level">
              <Feather name="corner-left-up" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          <Text style={styles.crumbText} numberOfLines={1}>
            {here ? folderPath(folders, currentId) : "All folders"}
          </Text>
        </View>

        {creating ? (
          <View style={styles.createRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder={currentId ? "Subfolder name" : "Folder name, e.g. Dad"}
              placeholderTextColor={colors.muted}
              autoFocus
              autoCapitalize="words"
              style={styles.input}
              onSubmitEditing={makeFolder}
            />
            <Button label="Create" onPress={makeFolder} disabled={!newName.trim()} />
          </View>
        ) : null}

        <FlatList
          data={children}
          keyExtractor={(f) => f.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={
            <Text style={styles.none}>
              {currentId ? "No folders inside here." : "No folders yet. Create one below."}
            </Text>
          }
          renderItem={({ item }) => {
            const n = countInside(folders, files, item.id);
            return (
              <Pressable onPress={() => setCurrentId(item.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#ECEFFA" }]}>
                <Feather name="folder" size={22} color={item.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowSub}>{plural(n.files, "file")}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            );
          }}
        />

        {!creating ? (
          <Button label={currentId ? "New folder in here" : "New folder"} kind="secondary" onPress={() => setCreating(true)} style={{ marginBottom: 10 }} />
        ) : null}
        <Button
          label={canPickHere ? `${props.confirmLabel} “${here?.name}”` : currentId ? "Already in this folder" : "Open a folder to choose it"}
          disabled={!canPickHere}
          onPress={() => currentId && props.onPick(currentId)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  title: { fontFamily: fonts.title, fontSize: 22, color: colors.ink, flex: 1 },
  crumb: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, paddingVertical: 10 },
  up: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E4E8FA", alignItems: "center", justifyContent: "center" },
  crumbText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.md },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  none: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 32 },
  createRow: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "center" },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
});

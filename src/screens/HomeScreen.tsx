import React, { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { colors, folderColors, fonts, radius } from "../theme";
import { countInside, folderPath, plural } from "../utils";
import { openFile } from "../openFile";
import { FileRow, FolderRow, FolderTile } from "../components/Rows";
import { useFileActions, useFolderActions } from "../components/actions";
import { Button, EmptyState, IconButton, PromptModal, ScreenHeader } from "../components/ui";

export default function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Home">) {
  const { folders, files, createFolder, fileUri } = useVault();
  const { noDeviceLock } = useLock();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const fileActions = useFileActions();
  const folderActions = useFolderActions();

  const roots = useMemo(
    () => folders.filter((f) => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );
  const q = query.trim().toLowerCase();
  const folderHits = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : [];
  const fileHits = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : [];

  const detail = (id: string) => {
    const n = countInside(folders, files, id);
    return n.folders ? `${plural(n.files, "file")} • ${plural(n.folders, "folder")}` : plural(n.files, "file");
  };

  // Two-column grid built from rows so tiles keep equal widths.
  const rows: (typeof roots)[] = [];
  for (let i = 0; i < roots.length; i += 2) rows.push(roots.slice(i, i + 2));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="DocVault"
        left={<Image source={require("../../assets/logo-mark.png")} style={{ width: 40, height: 40, borderRadius: 10 }} />}
        right={<IconButton icon="settings" label="Settings" onPress={() => navigation.navigate("Settings")} />}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {noDeviceLock ? (
          <View style={styles.warn}>
            <Feather name="alert-triangle" size={18} color="#8A5A00" />
            <Text style={styles.warnText}>
              This phone has no screen lock, so anyone who picks it up can open DocVault. Set a PIN, pattern or fingerprint in Android settings.
            </Text>
          </View>
        ) : null}

        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search folders and files"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
              <Feather name="x" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {q ? (
          <View style={{ paddingHorizontal: 8 }}>
            {folderHits.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                detail={folderPath(folders, f.id)}
                onPress={() => navigation.navigate("Folder", { id: f.id })}
              />
            ))}
            {fileHits.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                uri={fileUri(f)}
                subtitle={folderPath(folders, f.folderId)}
                onPress={() => openFile(fileUri(f), f.mime)}
                onMenu={() => fileActions.open(f)}
              />
            ))}
            {!folderHits.length && !fileHits.length ? (
              <EmptyState title="Nothing found" body={`No folder or file has “${query.trim()}” in its name.`} />
            ) : null}
          </View>
        ) : roots.length === 0 ? (
          <EmptyState
            title="Start with one folder per person"
            body="Make a folder for yourself and each family member, then add their Aadhaar, PAN and other documents. You can also share files straight from your gallery into DocVault."
            action={<Button label="Create first folder" onPress={() => setCreating(true)} />}
          />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 6 }}>
            {rows.map((pair, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 14 }}>
                {pair.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f}
                    detail={detail(f.id)}
                    onPress={() => navigation.navigate("Folder", { id: f.id })}
                    onLongPress={() => folderActions.open(f)}
                  />
                ))}
                {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            ))}
            <Text style={styles.tip}>Press and hold a folder to rename, recolor or delete it.</Text>
          </View>
        )}
      </ScrollView>

      {roots.length > 0 && !q ? (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { opacity: 0.9 }]}
        >
          <Feather name="folder-plus" size={20} color={colors.primaryDark} />
          <Text style={styles.fabText}>New folder</Text>
        </Pressable>
      ) : null}

      <PromptModal
        visible={creating}
        title="New folder"
        placeholder="e.g. Dad, Mom, Me, Property"
        confirmLabel="Create"
        withColor
        initialColor={folderColors[folders.length % folderColors.length]}
        onCancel={() => setCreating(false)}
        onSubmit={async (name, color) => {
          setCreating(false);
          const f = await createFolder(name, null, color);
          navigation.navigate("Folder", { id: f.id });
        }}
      />
      {fileActions.element}
      {folderActions.element}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  tip: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 6 },
  warn: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#FFF3D6",
  },
  warnText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: "#6B4700" },
  fab: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primaryDark },
});

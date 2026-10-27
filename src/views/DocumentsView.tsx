import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, folderColors, fonts, radius } from "../theme";
import { countInside, fileSearchText, folderPath, plural } from "../utils";
import { FileRow, FolderRow, FolderTile } from "../components/Rows";
import { isFavorite } from "../favorites";
import { useFileActions, useFolderActions } from "../components/actions";
import { Button, EmptyState, FabBar, Pill, PromptModal } from "../components/ui";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function DocumentsView({ navigation }: Props) {
  const { folders, files, createFolder, fileUri, openFile, favorites, toggleFavorite } = useVault();
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
  const fileHits = q ? files.filter((f) => fileSearchText(f).includes(q)) : [];

  const detail = (id: string) => {
    const n = countInside(folders, files, id);
    return n.folders ? `${plural(n.files, "file")} • ${plural(n.folders, "folder")}` : plural(n.files, "file");
  };

  // Two-column grid built from rows so tiles keep equal widths.
  const rows: (typeof roots)[] = [];
  for (let i = 0; i < roots.length; i += 2) rows.push(roots.slice(i, i + 2));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Document-specific searchbar */}
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search folders and document names"
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
          <View style={{ paddingHorizontal: 12 }}>
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
                onPress={() => openFile(f)}
                onMenu={() => fileActions.open(f)}
                favorite={isFavorite(favorites, "file", f.id)}
                onToggleFavorite={() => toggleFavorite("file", f.id)}
              />
            ))}
            {!folderHits.length && !fileHits.length ? (
              <EmptyState
                title="Nothing found"
                body={`Nothing matches “${query.trim()}”.`}
              />
            ) : null}
          </View>
        ) : roots.length === 0 ? (
          <EmptyState
            title="Start with one folder per person"
            body="Make a folder for yourself and each family member, then add their Aadhaar, PAN and other documents."
            action={<Button label="Create first folder" onPress={() => setCreating(true)} />}
          />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 4 }}>
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
          </View>
        )}
      </ScrollView>

      {/* Floating Action Buttons */}
      {!q ? (
        <FabBar bottomOffset={84}>
          <Pill icon="camera" label="Scan" tone="dark" onPress={() => navigation.navigate("Scan")} />
          <Pill icon="folder-plus" label="New folder" onPress={() => setCreating(true)} />
        </FabBar>
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
});

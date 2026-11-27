import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import type { VaultFile } from "../types";
import { colors, fonts, radius } from "../theme";
import { fileSearchText, folderPath, formatBytes, plural } from "../utils";
import { FileThumb } from "../components/Rows";
import { EmptyState, ScreenHeader } from "../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "ShareFiles">;

export default function ShareFilesScreen({ navigation, route }: Props) {
  const { files, folders, fileUri, shareFiles } = useVault();
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [folderFilter, setFolderFilter] = useState<string | null>(route.params?.folderId ?? null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const foldersWithFiles = useMemo(() => {
    const used = new Set(files.map((f) => f.folderId));
    return folders
      .filter((f) => used.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [files, folders]);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (folderFilter && f.folderId !== folderFilter) return false;
      if (!q) return true;
      const folderLabel = folderPath(folders, f.folderId).toLowerCase();
      return fileSearchText(f).includes(q) || folderLabel.includes(q);
    });
  }, [files, folders, folderFilter, query]);

  const selectedList = useMemo(
    () => files.filter((f) => selectedIds.has(f.id)),
    [files, selectedIds]
  );

  const allVisibleSelected =
    visibleFiles.length > 0 && visibleFiles.every((f) => selectedIds.has(f.id));

  function toggleFile(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const f of visibleFiles) next.delete(f.id);
      } else {
        for (const f of visibleFiles) next.add(f.id);
      }
      return next;
    });
  }

  async function handleShare() {
    if (!selectedList.length || busy) return;
    setBusy(true);
    try {
      await shareFiles(selectedList);
    } catch {
      Alert.alert("Couldn't share files", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function renderItem({ item }: { item: VaultFile }) {
    const checked = selectedIds.has(item.id);
    const folderLabel = folderPath(folders, item.folderId) || "Root";
    return (
      <Pressable
        onPress={() => toggleFile(item.id)}
        style={({ pressed }) => [
          styles.row,
          checked && styles.rowSelected,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.check, checked && styles.checkOn]}>
          {checked ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
        </View>
        <FileThumb name={item.name} mime={item.mime} uri={fileUri(item)} size={40} />
        <View style={styles.rowContent}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {folderLabel} · {formatBytes(item.size)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Share files"
        subtitle={
          selectedList.length
            ? `${plural(selectedList.length, "file")} selected`
            : "Pick files from any folder"
        }
        onBack={() => navigation.goBack()}
        right={
          visibleFiles.length > 0 ? (
            <Pressable onPress={toggleSelectAllVisible} hitSlop={8} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>
                {allVisibleSelected ? "Deselect" : "Select all"}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <View style={styles.search}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search files or folders"
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

      {foldersWithFiles.length > 1 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Pressable
              onPress={() => setFolderFilter(null)}
              style={[styles.chip, folderFilter === null && styles.chipOn]}
            >
              <Text style={[styles.chipText, folderFilter === null && styles.chipTextOn]}>
                All folders
              </Text>
            </Pressable>
            {foldersWithFiles.map((folder) => {
              const active = folderFilter === folder.id;
              return (
                <Pressable
                  key={folder.id}
                  onPress={() => setFolderFilter(active ? null : folder.id)}
                  style={[styles.chip, active && styles.chipOn]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
                    {folder.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={visibleFiles}
        keyExtractor={(f) => f.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <EmptyState
            title="No files found"
            body={
              files.length
                ? "Try clearing your search or picking another folder."
                : "Add documents to your folders first, then select them here to share."
            }
          />
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          onPress={handleShare}
          disabled={busy || selectedList.length === 0}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.shareBtn,
            (busy || selectedList.length === 0) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Feather name="share-2" size={18} color={colors.onPrimary} />
              <Text style={styles.shareBtnText}>
                {selectedList.length === 0
                  ? "Select files to share"
                  : `Share ${plural(selectedList.length, "file")}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectAllText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
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
    marginBottom: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  chips: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  chipTextOn: {
    color: colors.onPrimary,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  shareBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.onPrimary,
  },
});

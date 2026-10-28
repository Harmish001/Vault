import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { colors, fonts, noteColors, radius } from "../theme";
import { daysUntil, expiryInfo, fileSearchText, folderPath, plural } from "../utils";
import { nextDue } from "../reminders-plan";
import { DueBadge, ExpiryBadge, FavStar, FileRow, FileThumb, FolderRow } from "../components/Rows";
import { isFavorite } from "../favorites";
import type { Folder, Note, VaultFile } from "../types";
import { useFileActions, useFolderActions } from "../components/actions";
import { EmptyState } from "../components/ui";
import * as DocumentPicker from "expo-document-picker";
import { CompressModal, CompressTarget } from "../components/CompressModal";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  onSwitchTab?: (tab: "documents" | "notes" | "reminders") => void;
};

export default function HomeDashboardView({ navigation, onSwitchTab }: Props) {
  const { folders, files, reminders, notes, fileUri, openFile, favorites, toggleFavorite, shareFile } = useVault();
  const { noDeviceLock } = useLock();
  const [query, setQuery] = useState("");
  const [compressTarget, setCompressTarget] = useState<CompressTarget | null>(null);
  const fileActions = useFileActions();
  const folderActions = useFolderActions();

  async function pickAndCompress() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setCompressTarget({
        uri: asset.uri,
        name: asset.name,
        mime:
          asset.mimeType ||
          (asset.name.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "image/jpeg"),
        size: asset.size,
      });
    } catch {
      Alert.alert("Couldn't open file picker");
    }
  }

  // Reminders due within a week or overdue
  const dueSoon = useMemo(() => {
    const now = new Date();
    return reminders
      .map((r) => ({ r, due: nextDue(r, now) }))
      .filter((x) => x.due && daysUntil(x.due) <= 7)
      .sort((a, b) => (a.due as string).localeCompare(b.due as string));
  }, [reminders]);

  // Documents expiring soon (<= 60 days)
  const expiringFiles = useMemo(
    () =>
      files
        .filter((f) => f.expiresOn && daysUntil(f.expiresOn) <= 60)
        .sort((a, b) => (a.expiresOn as string).localeCompare(b.expiresOn as string)),
    [files]
  );

  // Favorites list with full objects
  const favItems = useMemo(
    () =>
      favorites.flatMap(
        (fav): ({ kind: "file"; file: VaultFile } | { kind: "folder"; folder: Folder } | { kind: "note"; note: Note })[] => {
          if (fav.kind === "file") {
            const file = files.find((f) => f.id === fav.id);
            return file ? [{ kind: "file" as const, file }] : [];
          }
          if (fav.kind === "folder") {
            const folder = folders.find((f) => f.id === fav.id);
            return folder ? [{ kind: "folder" as const, folder }] : [];
          }
          const note = notes.find((n) => n.id === fav.id);
          return note ? [{ kind: "note" as const, note }] : [];
        }
      ),
    [favorites, files, folders, notes]
  );

  // Overall search across Notes, Documents, and Folders
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    const matchedFolders = folders.filter((f) => f.name.toLowerCase().includes(q));
    const matchedFiles = files.filter((f) => fileSearchText(f).includes(q));
    const matchedNotes = notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
    const totalCount = matchedFolders.length + matchedFiles.length + matchedNotes.length;
    return {
      folders: matchedFolders,
      files: matchedFiles,
      notes: matchedNotes,
      totalCount,
    };
  }, [q, folders, files, notes]);

  const detail = (id: string) => {
    const count = files.filter((f) => f.folderId === id).length;
    return plural(count, "file");
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {noDeviceLock ? (
          <View style={styles.warn}>
            <Feather name="alert-triangle" size={18} color={colors.warnInk} />
            <Text style={styles.warnText}>
              This phone has no screen lock, so anyone who picks it up can open DocVault. Set a PIN, pattern or fingerprint in Android settings.
            </Text>
          </View>
        ) : null}

        {/* Unified Searchbar on Home */}
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search across documents, notes and folders"
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

        {/* Search Results Display */}
        {searchResults !== null ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            {searchResults.totalCount === 0 ? (
              <EmptyState
                title="Nothing found"
                body={`No documents, notes or folders match “${query.trim()}”.`}
              />
            ) : (
              <>
                {searchResults.notes.length > 0 ? (
                  <View style={styles.searchGroup}>
                    <Text style={styles.searchGroupTitle}>
                      Notes ({searchResults.notes.length})
                    </Text>
                    {searchResults.notes.map((n) => {
                      const notePalette = noteColors[n.color ?? "default"];
                      const isFav = isFavorite(favorites, "note", n.id);
                      return (
                        <Pressable
                          key={n.id}
                          onPress={() => navigation.navigate("NoteEdit", { id: n.id })}
                          style={[
                            styles.searchNoteCard,
                            { backgroundColor: notePalette.bg, borderColor: notePalette.line },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Open note ${n.title}`}
                        >
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              {n.isSecret ? (
                                <Feather name="lock" size={13} color={colors.primary} />
                              ) : null}
                              <Text
                                style={[styles.searchNoteTitle, { color: notePalette.text }]}
                                numberOfLines={1}
                              >
                                {n.title || "Untitled Note"}
                              </Text>
                            </View>
                            <Text
                              style={[styles.searchNoteContent, { color: colors.muted }]}
                              numberOfLines={2}
                            >
                              {n.isSecret ? "••••••••" : n.content || "Empty note"}
                            </Text>
                          </View>
                          <FavStar
                            on={isFav}
                            onPress={() => toggleFavorite("note", n.id)}
                            label={n.title || "Untitled"}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {searchResults.files.length > 0 ? (
                  <View style={styles.searchGroup}>
                    <Text style={styles.searchGroupTitle}>
                      Documents ({searchResults.files.length})
                    </Text>
                    {searchResults.files.map((f) => (
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
                  </View>
                ) : null}

                {searchResults.folders.length > 0 ? (
                  <View style={styles.searchGroup}>
                    <Text style={styles.searchGroupTitle}>
                      Folders ({searchResults.folders.length})
                    </Text>
                    {searchResults.folders.map((f) => (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        detail={folderPath(folders, f.id)}
                        onPress={() => navigation.navigate("Folder", { id: f.id })}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : (
          /* Normal Dashboard Content */
          <View style={{ paddingHorizontal: 16, gap: 18, paddingTop: 4 }}>
            {/* Quick Overview Summary Row */}
            <View style={styles.statsRow}>
              <Pressable
                onPress={() => onSwitchTab?.("documents")}
                style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Go to Documents"
              >
                <View style={[styles.statIconBox, { backgroundColor: colors.primary + "16" }]}>
                  <Feather name="folder" size={18} color={colors.primary} />
                </View>
                <Text style={styles.statNumber}>{files.length}</Text>
                <Text style={styles.statLabel}>Documents</Text>
              </Pressable>

              <Pressable
                onPress={() => onSwitchTab?.("notes")}
                style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Go to Notes"
              >
                <View style={[styles.statIconBox, { backgroundColor: colors.accent + "18" }]}>
                  <Feather name="edit-3" size={18} color={colors.accent} />
                </View>
                <Text style={styles.statNumber}>{notes.length}</Text>
                <Text style={styles.statLabel}>Notes</Text>
              </Pressable>

              <Pressable
                onPress={() => onSwitchTab?.("reminders")}
                style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Go to Reminders"
              >
                <View style={[styles.statIconBox, { backgroundColor: colors.primary + "16" }]}>
                  <Feather name="bell" size={18} color={colors.primary} />
                </View>
                <Text style={styles.statNumber}>{reminders.length}</Text>
                <Text style={styles.statLabel}>Reminders</Text>
              </Pressable>
            </View>

            {/* Quick Compressor Tool */}
            <Pressable
              onPress={pickAndCompress}
              style={({ pressed }) => [styles.compressBanner, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel="Compress PDF or Photos"
            >
              <View style={styles.compressIconBox}>
                <Feather name="minimize-2" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.compressTitle}>Compress PDF & Photos</Text>
                  <View style={styles.compressBadge}>
                    <Text style={styles.compressBadgeText}>Under 50-500 KB</Text>
                  </View>
                </View>
                <Text style={styles.compressSub} numberOfLines={1}>
                  Fit photo & doc size limits for UPSC, SSC & portal uploads
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>

            {/* Favorites Section */}
            <View>
              <View style={styles.sectionHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Feather name="star" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate("Favorites")}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Edit favorites"
                >
                  <Text style={styles.sectionAction}>Edit</Text>
                </Pressable>
              </View>

              {favItems.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                >
                  {favItems.map((it) =>
                    it.kind === "file" ? (
                      <Pressable
                        key={it.file.id}
                        onPress={() => openFile(it.file)}
                        onLongPress={() => fileActions.open(it.file)}
                        style={({ pressed }) => [styles.favCard, pressed && { opacity: 0.85 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${it.file.name}`}
                      >
                        <View style={styles.favTop}>
                          <FileThumb
                            name={it.file.name}
                            mime={it.file.mime}
                            uri={fileUri(it.file)}
                            size={40}
                          />
                          <Pressable
                            onPress={() =>
                              shareFile(it.file).catch(() =>
                                Alert.alert("Couldn't share this file")
                              )
                            }
                            hitSlop={10}
                            style={styles.favShare}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${it.file.name}`}
                          >
                            <Feather name="share-2" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>
                          {it.file.name}
                        </Text>
                        <Text style={styles.favSub} numberOfLines={1}>
                          {folderPath(folders, it.file.folderId)}
                        </Text>
                      </Pressable>
                    ) : it.kind === "folder" ? (
                      <Pressable
                        key={it.folder.id}
                        onPress={() => navigation.navigate("Folder", { id: it.folder.id })}
                        onLongPress={() => folderActions.open(it.folder)}
                        style={({ pressed }) => [
                          styles.favCard,
                          { borderColor: it.folder.color },
                          pressed && { opacity: 0.85 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open folder ${it.folder.name}`}
                      >
                        <View
                          style={[
                            styles.favFolderIcon,
                            { backgroundColor: it.folder.color + "26" },
                          ]}
                        >
                          <Feather name="folder" size={20} color={it.folder.color} />
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>
                          {it.folder.name}
                        </Text>
                        <Text style={styles.favSub} numberOfLines={1}>
                          {detail(it.folder.id)}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        key={it.note.id}
                        onPress={() => navigation.navigate("NoteEdit", { id: it.note.id })}
                        style={({ pressed }) => [styles.favCard, pressed && { opacity: 0.85 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open note ${it.note.title}`}
                      >
                        <View style={styles.favTop}>
                          <View
                            style={[
                              styles.favFolderIcon,
                              {
                                backgroundColor: colors.primary + "18",
                                width: 36,
                                height: 36,
                                marginBottom: 0,
                              },
                            ]}
                          >
                            <Feather
                              name={it.note.isSecret ? "lock" : "edit-3"}
                              size={18}
                              color={colors.primary}
                            />
                          </View>
                          <Pressable
                            onPress={() =>
                              Share.share({
                                title: it.note.title,
                                message: it.note.content,
                              }).catch(() => Alert.alert("Couldn't share this note"))
                            }
                            hitSlop={10}
                            style={styles.favShare}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${it.note.title}`}
                          >
                            <Feather name="share-2" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>
                          {it.note.title || "Untitled Note"}
                        </Text>
                        <Text style={styles.favSub} numberOfLines={1}>
                          {it.note.isSecret ? "Secure note" : "Note"}
                        </Text>
                      </Pressable>
                    )
                  )}
                </ScrollView>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>
                    Star your most important documents, folders, or notes to keep them right here on the dashboard.
                  </Text>
                </View>
              )}
            </View>

            {/* Needs Attention & Reminders Section (With Star/Favorite Option) */}
            <View>
              <View style={styles.sectionHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Feather name="bell" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Reminders & Expiries</Text>
                </View>
                <Pressable
                  onPress={() => onSwitchTab?.("reminders")}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="View all reminders"
                >
                  <Text style={styles.sectionAction}>View all</Text>
                </Pressable>
              </View>

              {dueSoon.length > 0 || expiringFiles.length > 0 ? (
                <View style={styles.attentionBox}>
                  {dueSoon.slice(0, 4).map(({ r, due }) => (
                    <Pressable
                      key={r.id}
                      onPress={() => onSwitchTab?.("reminders")}
                      style={styles.attentionRow}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.title} reminder`}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.attentionName} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={styles.attentionSub} numberOfLines={1}>
                          {[r.amount?.trim(), "Reminder"].filter(Boolean).join("  •  ")}
                        </Text>
                      </View>
                      <DueBadge iso={due as string} />
                    </Pressable>
                  ))}

                  {expiringFiles.slice(0, 4).map((f) => {
                    const e = expiryInfo(f.expiresOn as string);
                    const isFav = isFavorite(favorites, "file", f.id);
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => navigation.navigate("FileDetails", { fileId: f.id })}
                        style={styles.attentionRow}
                        accessibilityRole="button"
                        accessibilityLabel={`${f.name}. ${e.label}`}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.attentionName} numberOfLines={1}>
                            {f.name}
                          </Text>
                          <Text style={styles.attentionSub} numberOfLines={1}>
                            {folderPath(folders, f.folderId)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <ExpiryBadge iso={f.expiresOn as string} />
                          <FavStar
                            on={isFav}
                            onPress={() => toggleFavorite("file", f.id)}
                            label={f.name}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>
                    No upcoming reminders or expiring documents. You're all caught up!
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
      {fileActions.element}
      {folderActions.element}
      <CompressModal
        visible={!!compressTarget}
        target={compressTarget}
        onClose={() => setCompressTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  warn: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.warnSoft,
    borderColor: colors.warnLine,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  warnText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warnInk,
    flex: 1,
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
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    gap: 4,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statNumber: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  compressBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  compressIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  compressTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
  },
  compressBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  compressBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.onPrimary,
  },
  compressSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.ink,
  },
  sectionAction: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyCardText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  favCard: {
    width: 130,
    height: 124,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    justifyContent: "space-between",
  },
  favTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  favFolderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  favShare: {
    padding: 4,
  },
  favName: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 17,
  },
  favSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
  attentionBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  attentionName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  attentionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  searchGroup: {
    marginBottom: 16,
  },
  searchGroupTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 8,
    marginLeft: 2,
  },
  searchNoteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  searchNoteTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  searchNoteContent: {
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
});

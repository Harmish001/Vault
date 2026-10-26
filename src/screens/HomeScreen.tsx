import React, { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { colors, folderColors, fonts, radius } from "../theme";
import { countInside, daysUntil, expiryInfo, fileSearchText, folderPath, plural } from "../utils";
import { nextDue } from "../reminders-plan";
import { DueBadge, ExpiryBadge, FileRow, FileThumb, FolderRow, FolderTile } from "../components/Rows";
import { isFavorite } from "../favorites";
import type { Folder, Note, VaultFile } from "../types";
import { useFileActions, useFolderActions } from "../components/actions";
import { Button, EmptyState, FabBar, IconButton, Pill, PromptModal, ScreenHeader } from "../components/ui";
import BottomNavBar from "../components/BottomNavBar";

export default function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Home">) {
  const { folders, files, reminders, notes, createFolder, fileUri, openFile, favorites, toggleFavorite, shareFile } = useVault();
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
  // Reminders due within a week (or overdue)
  const dueSoon = useMemo(() => {
    const now = new Date();
    return reminders
      .map((r) => ({ r, due: nextDue(r, now) }))
      .filter((x) => x.due && daysUntil(x.due) <= 7)
      .sort((a, b) => (a.due as string).localeCompare(b.due as string));
  }, [reminders]);
  const favItems = useMemo(
    () =>
      favorites.flatMap((fav): ({ kind: "file"; file: VaultFile } | { kind: "folder"; folder: Folder } | { kind: "note"; note: Note })[] => {
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
      }),
    [favorites, files, folders, notes]
  );
  const q = query.trim().toLowerCase();
  const folderHits = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : [];
  const fileHits = q ? files.filter((f) => fileSearchText(f).includes(q)) : [];

  // Documents that are expired or expire within 60 days, soonest first.
  const attention = useMemo(
    () =>
      files
        .filter((f) => f.expiresOn && daysUntil(f.expiresOn) <= 60)
        .sort((a, b) => (a.expiresOn as string).localeCompare(b.expiresOn as string)),
    [files]
  );

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
        right={
          <IconButton icon="settings" label="Settings" onPress={() => navigation.navigate("Settings")} />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 160 }}
      >
        {noDeviceLock ? (
          <View style={styles.warn}>
            <Feather name="alert-triangle" size={18} color={colors.warnInk} />
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
            placeholder="Search names, tags, notes and details"
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
                onPress={() => openFile(f)}
                onMenu={() => fileActions.open(f)}
                favorite={isFavorite(favorites, "file", f.id)}
                onToggleFavorite={() => toggleFavorite("file", f.id)}
              />
            ))}
            {!folderHits.length && !fileHits.length ? (
              <EmptyState title="Nothing found" body={`Nothing matches “${query.trim()}”. Search covers names, tags, notes and saved details.`} />
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
            {favItems.length ? (
              <View>
                <View style={styles.favHead}>
                  <Text style={styles.favTitle}>Favorites</Text>
                  <Pressable onPress={() => navigation.navigate("Favorites")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit favorites">
                    <Text style={styles.favEdit}>Edit</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
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
                          <FileThumb name={it.file.name} mime={it.file.mime} uri={fileUri(it.file)} size={40} />
                          <Pressable
                            onPress={() => shareFile(it.file).catch(() => Alert.alert("Couldn't share this file"))}
                            hitSlop={10}
                            style={styles.favShare}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${it.file.name}`}
                          >
                            <Feather name="share-2" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>{it.file.name}</Text>
                        <Text style={styles.favSub} numberOfLines={1}>{folderPath(folders, it.file.folderId)}</Text>
                      </Pressable>
                    ) : it.kind === "folder" ? (
                      <Pressable
                        key={it.folder.id}
                        onPress={() => navigation.navigate("Folder", { id: it.folder.id })}
                        onLongPress={() => folderActions.open(it.folder)}
                        style={({ pressed }) => [styles.favCard, { borderColor: it.folder.color }, pressed && { opacity: 0.85 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open folder ${it.folder.name}`}
                      >
                        <View style={[styles.favFolderIcon, { backgroundColor: it.folder.color + "26" }]}>
                          <Feather name="folder" size={20} color={it.folder.color} />
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>{it.folder.name}</Text>
                        <Text style={styles.favSub} numberOfLines={1}>{detail(it.folder.id)}</Text>
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
                          <View style={[styles.favFolderIcon, { backgroundColor: colors.primary + "18", width: 36, height: 36, marginBottom: 0 }]}>
                            <Feather name={it.note.isSecret ? "lock" : "edit-3"} size={18} color={colors.primary} />
                          </View>
                          <Pressable
                            onPress={() => Share.share({ title: it.note.title, message: it.note.content }).catch(() => Alert.alert("Couldn't share this note"))}
                            hitSlop={10}
                            style={styles.favShare}
                            accessibilityRole="button"
                            accessibilityLabel={`Share ${it.note.title}`}
                          >
                            <Feather name="share-2" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.favName} numberOfLines={2}>{it.note.title || "Untitled Note"}</Text>
                        <Text style={styles.favSub} numberOfLines={1}>{it.note.isSecret ? "Secure note" : "Note"}</Text>
                      </Pressable>
                    )
                  )}
                </ScrollView>
              </View>
            ) : files.length ? (
              <Text style={styles.tip}>Tap the star on any file or folder to pin it here.</Text>
            ) : null}
            {attention.length || dueSoon.length ? (
              <View style={styles.attention}>
                <Text style={styles.attentionTitle}>Needs attention</Text>
                {dueSoon.slice(0, 3).map(({ r, due }) => (
                  <Pressable
                    key={r.id}
                    onPress={() => navigation.navigate("Reminders")}
                    style={styles.attentionRow}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.title} reminder`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attentionName} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.attentionSub} numberOfLines={1}>{[r.amount?.trim(), "Reminder"].filter(Boolean).join("  •  ")}</Text>
                    </View>
                    <DueBadge iso={due as string} />
                  </Pressable>
                ))}
                {attention.slice(0, 5).map((f) => {
                  const e = expiryInfo(f.expiresOn as string);
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => navigation.navigate("FileDetails", { fileId: f.id })}
                      style={styles.attentionRow}
                      accessibilityRole="button"
                      accessibilityLabel={`${f.name}. ${e.label}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attentionName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.attentionSub} numberOfLines={1}>{folderPath(folders, f.folderId)}</Text>
                      </View>
                      <ExpiryBadge iso={f.expiresOn as string} />
                    </Pressable>
                  );
                })}
                {attention.length > 5 ? <Text style={styles.attentionSub}>and {attention.length - 5} more. Search to find them.</Text> : null}
              </View>
            ) : null}
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
      <BottomNavBar active="documents" />
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
  attention: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 4, borderWidth: 1.5, borderColor: colors.warnLine },
  attentionTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink, marginBottom: 4 },
  attentionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  attentionName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  attentionSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  tip: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 6 },
  favHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  favTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  favEdit: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  favCard: {
    width: 136,
    padding: 12,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  favTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  favShare: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary + "14" },
  favFolderIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  favName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  favSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  warn: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.warnSoft,
  },
  warnText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.warnInk },
});

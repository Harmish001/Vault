import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { colors, fonts, noteColors, radius } from "../theme";
import { Note } from "../types";
import { ActionMenu, EmptyState, FabBar, IconButton, MenuItem, Pill, ScreenHeader } from "../components/ui";
import { FavStar } from "../components/Rows";
import { isFavorite } from "../favorites";
import BottomNavBar from "../components/BottomNavBar";

type TabMode = "all" | "secure";

export default function NotesScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Notes">) {
  const { notes, togglePinNote, deleteNote, favorites, toggleFavorite } = useVault();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabMode>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [menuNote, setMenuNote] = useState<Note | null>(null);

  const tabsEnabled = settings.notesTabsEnabled ?? true;

  const q = query.trim().toLowerCase();

  // Filter by query and active tab
  const filtered = useMemo(() => {
    let list = notes;
    if (tabsEnabled && tab === "secure") {
      list = list.filter((n) => n.isSecret);
    }
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [notes, tabsEnabled, tab, q]);

  // Separate pinned vs others
  const { pinnedNotes, otherNotes } = useMemo(() => {
    const pinned: Note[] = [];
    const others: Note[] = [];
    for (const note of filtered) {
      if (note.pinned) pinned.push(note);
      else others.push(note);
    }
    return { pinnedNotes: pinned, otherNotes: others };
  }, [filtered]);

  const secureCount = useMemo(() => notes.filter((n) => n.isSecret).length, [notes]);

  async function handleCopy(note: Note, e?: unknown) {
    if (!note.content) {
      ToastAndroid.show("Note is empty", ToastAndroid.SHORT);
      return;
    }
    await Clipboard.setStringAsync(note.content);
    setCopiedId(note.id);
    ToastAndroid.show(
      note.isSecret ? "Secret copied to clipboard" : "Copied to clipboard",
      ToastAndroid.SHORT
    );
    setTimeout(() => {
      setCopiedId((cur) => (cur === note.id ? null : cur));
    }, 1600);
  }

  function confirmDelete(note: Note) {
    Alert.alert("Delete note?", `“${note.title || "Untitled"}” will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteNote(note.id),
      },
    ]);
  }

  const menuItems: MenuItem[] = menuNote
    ? [
        {
          label: menuNote.pinned ? "Unpin note" : "Pin note",
          icon: "bookmark",
          onPress: () => togglePinNote(menuNote.id),
        },
        {
          label: isFavorite(favorites, "note", menuNote.id) ? "Remove from favorites" : "Add to favorites / widget",
          icon: "star",
          onPress: () => toggleFavorite("note", menuNote.id),
        },
        {
          label: "Copy content",
          icon: "copy",
          onPress: () => handleCopy(menuNote),
        },
        {
          label: "Delete note",
          icon: "trash-2",
          danger: true,
          onPress: () => confirmDelete(menuNote),
        },
      ]
    : [];

  function renderNoteCard(note: Note) {
    const theme = noteColors[note.color ?? "default"] ?? noteColors.default;
    const isCopied = copiedId === note.id;

    return (
      <Pressable
        key={note.id}
        onPress={() => navigation.navigate("NoteEdit", { id: note.id })}
        onLongPress={() => setMenuNote(note)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.bg,
            borderColor: theme.line,
          },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={note.title || "Note"}
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerBadges}>
            {note.isSecret ? (
              <View style={styles.secureBadge}>
                <Feather name="lock" size={11} color={colors.primary} />
                <Text style={styles.secureBadgeText}>Secure</Text>
              </View>
            ) : null}
            {note.pinned ? (
              <View style={styles.pinnedBadge}>
                <Feather name="bookmark" size={12} color={colors.primary} />
              </View>
            ) : null}
          </View>
          <View style={styles.cardActions}>
            <FavStar
              on={isFavorite(favorites, "note", note.id)}
              onPress={() => toggleFavorite("note", note.id)}
              label={note.title || "Note"}
              size={18}
            />
            <Pressable
              hitSlop={8}
              onPress={() => togglePinNote(note.id)}
              style={styles.pinBtn}
              accessibilityRole="button"
              accessibilityLabel={note.pinned ? "Unpin note" : "Pin note"}
            >
              <Feather
                name="bookmark"
                size={16}
                color={note.pinned ? colors.primary : colors.muted}
              />
            </Pressable>
          </View>
        </View>

        {note.title ? (
          <Text
            style={[styles.cardTitle, { color: theme.text }]}
            numberOfLines={2}
          >
            {note.title}
          </Text>
        ) : null}

        {note.isSecret ? (
          <View style={styles.maskedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.maskedDots}>••••••••••••</Text>
              <Text style={styles.maskedHint}>Tap to view & edit</Text>
            </View>
            <Pressable
              onPress={() => handleCopy(note)}
              style={({ pressed }) => [
                styles.copyPill,
                isCopied && styles.copyPillSuccess,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Copy secret"
            >
              <Feather
                name={isCopied ? "check" : "copy"}
                size={13}
                color={isCopied ? colors.success : colors.primary}
              />
              <Text
                style={[
                  styles.copyPillText,
                  isCopied && { color: colors.success },
                ]}
              >
                {isCopied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text
            style={[styles.cardBody, { color: theme.text }]}
            numberOfLines={4}
          >
            {note.content || "Empty note"}
          </Text>
        )}
      </Pressable>
    );
  }

  const hasNotes = notes.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Notes"
        left={
          <Image
            source={require("../../assets/logo-mark.png")}
            style={{ width: 40, height: 40, borderRadius: 10 }}
          />
        }
        right={
          <IconButton
            icon="settings"
            label="Settings"
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />

      {/* Search Bar */}
      {hasNotes ? (
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes or passwords..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            clearButtonMode="while-editing"
          />
          {query ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Category Tabs (if enabled in settings) */}
      {tabsEnabled && hasNotes && !q ? (
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setTab("all")}
            style={[styles.tabChip, tab === "all" && styles.tabChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "all" }}
          >
            <Text
              style={[
                styles.tabChipText,
                tab === "all" && styles.tabChipTextActive,
              ]}
            >
              All Notes ({notes.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("secure")}
            style={[styles.tabChip, tab === "secure" && styles.tabChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "secure" }}
          >
            <Feather
              name="lock"
              size={13}
              color={tab === "secure" ? colors.onPrimary : colors.muted}
            />
            <Text
              style={[
                styles.tabChipText,
                tab === "secure" && styles.tabChipTextActive,
              ]}
            >
              Secure / Passwords ({secureCount})
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Notes List */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 160,
          gap: 12,
        }}
      >
        {!hasNotes ? (
          <EmptyState
            title="Keep notes and passwords safe"
            body="Jot down notes, copy important passwords and numbers with 1 tap, and keep them completely encrypted on your device."
            action={
              <Pill
                icon="plus"
                label="Create your first note"
                tone="dark"
                onPress={() => navigation.navigate("NoteEdit")}
              />
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No notes found"
            body={
              q
                ? `No notes match “${query}”. Try a different keyword.`
                : "No secure notes saved yet."
            }
          />
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedNotes.length > 0 ? (
              <View style={{ gap: 10 }}>
                {otherNotes.length > 0 ? (
                  <Text style={styles.sectionHeader}>PINNED</Text>
                ) : null}
                {pinnedNotes.map(renderNoteCard)}
              </View>
            ) : null}

            {/* Others Section */}
            {otherNotes.length > 0 ? (
              <View style={{ gap: 10, marginTop: pinnedNotes.length > 0 ? 8 : 0 }}>
                {pinnedNotes.length > 0 ? (
                  <Text style={styles.sectionHeader}>OTHERS</Text>
                ) : null}
                {otherNotes.map(renderNoteCard)}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      {hasNotes ? (
        <FabBar bottomOffset={84}>
          <Pill
            icon="plus"
            label="New note"
            tone="dark"
            onPress={() => navigation.navigate("NoteEdit")}
          />
        </FabBar>
      ) : null}

      {/* Bottom Nav */}
      <BottomNavBar active="notes" />

      {/* Long-press Action Menu */}
      <ActionMenu
        visible={menuNote !== null}
        title={menuNote?.title || "Note options"}
        items={menuItems}
        onClose={() => setMenuNote(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  tabChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  tabChipTextActive: {
    color: colors.onPrimary,
  },
  sectionHeader: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 2,
    marginLeft: 4,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary + "14",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  secureBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  pinnedBadge: {
    paddingHorizontal: 2,
  },
  pinBtn: {
    padding: 4,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    lineHeight: 22,
  },
  cardBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  maskedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line + "60",
  },
  maskedDots: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    letterSpacing: 3,
    color: colors.muted,
  },
  maskedHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  copyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.primary + "14",
    borderWidth: 1,
    borderColor: colors.primary + "26",
  },
  copyPillSuccess: {
    backgroundColor: colors.success + "14",
    borderColor: colors.success + "30",
  },
  copyPillText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
});

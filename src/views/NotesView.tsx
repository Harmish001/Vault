import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  useWindowDimensions,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { colors, fonts, noteColors, radius } from "../theme";
import { Note } from "../types";
import { ActionMenu, EmptyState, FabBar, MenuItem, Pill } from "../components/ui";
import { FavStar } from "../components/Rows";
import { isFavorite } from "../favorites";

type TabMode = "all" | "secure";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function NotesView({ navigation }: Props) {
  const { notes, togglePinNote, deleteNote, favorites, toggleFavorite } = useVault();
  const { settings } = useSettings();
  const { width: windowWidth } = useWindowDimensions();

  // 2 notes per row: screen width minus 32 (padding 16 on each side) minus 10 (gap between cards)
  const cardWidth = Math.floor((windowWidth - 32 - 10) / 2);

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

  async function handleCopy(note: Note) {
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

  function renderNoteCard(note: Note) {
    const palette = noteColors[note.color ?? "default"];
    const isCopied = copiedId === note.id;
    const isFav = isFavorite(favorites, "note", note.id);

    return (
      <Pressable
        key={note.id}
        onPress={() => navigation.navigate("NoteEdit", { id: note.id })}
        onLongPress={() => setMenuNote(note)}
        style={({ pressed }) => [
          styles.noteCard,
          {
            width: cardWidth,
            backgroundColor: palette.bg,
            borderColor: palette.line,
          },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Note: ${note.title || "Untitled"}`}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, marginRight: 4 }}>
            {note.title ? (
              <Text
                style={[styles.noteTitle, { color: palette.text }]}
                numberOfLines={2}
              >
                {note.title}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {note.pinned ? (
              <Feather name="bookmark" size={15} color={colors.primary} />
            ) : null}
            <FavStar
              on={isFav}
              onPress={() => toggleFavorite("note", note.id)}
              label={note.title || "Untitled"}
            />
          </View>
        </View>

        {note.isSecret ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
            <View style={styles.lockBadge}>
              <Feather name="lock" size={11} color={colors.primary} />
              <Text style={styles.lockText}>Secret</Text>
            </View>
          </View>
        ) : null}

        {note.content ? (
          <Text
            style={[styles.noteContent, { color: palette.text }]}
            numberOfLines={5}
          >
            {note.isSecret ? "••••••••••••" : note.content}
          </Text>
        ) : (
          <Text style={[styles.noteContent, { color: colors.muted, fontStyle: "italic" }]}>
            Empty note
          </Text>
        )}

        {note.isSecret && note.content ? (
          <View style={styles.copyBar}>
            <Pressable
              onPress={() => handleCopy(note)}
              style={({ pressed }) => [
                styles.copyButton,
                isCopied && styles.copyButtonActive,
                pressed && { opacity: 0.8 },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Copy secret content"
            >
              <Feather
                name={isCopied ? "check" : "copy"}
                size={12}
                color={isCopied ? colors.onPrimary : colors.primary}
              />
              <Text
                style={[
                  styles.copyButtonText,
                  isCopied && { color: colors.onPrimary },
                ]}
              >
                {isCopied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Search input */}
        <View style={styles.search}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
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

        {/* Tabs: All Notes vs Secure / Passwords */}
        {tabsEnabled && !q ? (
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setTab("all")}
              style={[styles.tabItem, tab === "all" && styles.tabItemActive]}
            >
              <Text style={[styles.tabLabel, tab === "all" && styles.tabLabelActive]}>
                All Notes ({notes.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("secure")}
              style={[styles.tabItem, tab === "secure" && styles.tabItemActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather
                  name="lock"
                  size={14}
                  color={tab === "secure" ? colors.primary : colors.muted}
                />
                <Text style={[styles.tabLabel, tab === "secure" && styles.tabLabelActive]}>
                  Passwords & PINs ({secureCount})
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 40 }}>
            <EmptyState
              title={q ? "No matching notes" : tab === "secure" ? "No secret notes yet" : "No notes yet"}
              body={
                q
                  ? `Nothing matched “${query}”.`
                  : tab === "secure"
                  ? "Tap + Note to write a password, PIN, or secure code."
                  : "Keep ideas, codes, passwords and notes safely stored."
              }
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 8 }}>
            {pinnedNotes.length > 0 ? (
              <View>
                <Text style={styles.sectionHeading}>PINNED</Text>
                <View style={styles.notesGrid}>{pinnedNotes.map(renderNoteCard)}</View>
              </View>
            ) : null}

            {otherNotes.length > 0 ? (
              <View>
                {pinnedNotes.length > 0 ? (
                  <Text style={styles.sectionHeading}>OTHERS</Text>
                ) : null}
                <View style={styles.notesGrid}>{otherNotes.map(renderNoteCard)}</View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* FAB to add a note */}
      <FabBar bottomOffset={84}>
        <Pill
          icon="plus"
          label="New note"
          tone="dark"
          onPress={() => navigation.navigate("NoteEdit")}
        />
      </FabBar>

      {/* Context Menu Modal */}
      {menuNote ? (
        <ActionMenu
          title={menuNote.title || "Note"}
          visible={Boolean(menuNote)}
          onClose={() => setMenuNote(null)}
          items={[
            {
              icon: "edit-3",
              label: "Edit note",
              onPress: () => {
                const id = menuNote.id;
                navigation.navigate("NoteEdit", { id });
              },
            },
            {
              icon: "bookmark",
              label: menuNote.pinned ? "Unpin note" : "Pin to top",
              onPress: () => togglePinNote(menuNote.id),
            },
            {
              icon: "star",
              label: isFavorite(favorites, "note", menuNote.id) ? "Remove from Favorites" : "Add to Favorites",
              onPress: () => toggleFavorite("note", menuNote.id),
            },
            ...(menuNote.content
              ? [
                  {
                    icon: "copy" as const,
                    label: "Copy content",
                    onPress: () => handleCopy(menuNote),
                  },
                ]
              : []),
            {
              icon: "trash-2",
              label: "Delete",
              danger: true,
              onPress: () => confirmDelete(menuNote),
            },
          ]}
        />
      ) : null}
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
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 30,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  tabLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  tabLabelActive: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  sectionHeading: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  notesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  noteCard: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: 12,
    gap: 6,
    minHeight: 110,
    justifyContent: "space-between",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  lockText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  noteTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  noteContent: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  copyBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 4,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  copyButtonActive: {
    backgroundColor: colors.primary,
  },
  copyButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
});

import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { Bookmark, getBookStatus, Quote, QuoteColor } from "../types";
import { ActionMenu, EmptyState, IconButton, MenuItem, ScreenHeader } from "../components/ui";
import { QUOTE_COLORS } from "./BookReaderScreen";

type Props = NativeStackScreenProps<RootStackParamList, "BookDetail">;

export default function BookDetailScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const {
    books,
    quotes,
    bookmarks,
    updateBook,
    deleteBook,
    toggleFavoriteBook,
    updateQuote,
    deleteQuote,
    deleteBookmark,
  } = useVault();

  const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  const [activeTab, setActiveTab] = useState<"notes" | "bookmarks">("notes");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState(false);

  // Edit Quote modal state
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState("");
  const [editUserNote, setEditUserNote] = useState("");
  const [editColor, setEditColor] = useState<QuoteColor>("yellow");

  const handleOpenEditQuote = (q: Quote) => {
    setEditingQuote(q);
    setEditText(q.text);
    setEditUserNote(q.userNote || "");
    setEditColor(q.color || "yellow");
    setEditModalVisible(true);
  };

  const handleSaveEditQuote = async () => {
    if (!editingQuote) return;
    const cleanText = editText.trim();
    const cleanNote = editUserNote.trim();
    if (!cleanText && !cleanNote) {
      Alert.alert("Empty note", "Please enter quote text or your reflection note.");
      return;
    }
    try {
      await updateQuote(editingQuote.id, {
        text: cleanText || cleanNote,
        userNote: cleanNote || null,
        color: editColor,
      });
      ToastAndroid.show("Note updated", ToastAndroid.SHORT);
      setEditModalVisible(false);
      setEditingQuote(null);
    } catch (err: any) {
      Alert.alert("Update error", err.message || "Failed to update note.");
    }
  };

  // Quotes for this book
  const bookQuotes = useMemo(() => {
    let list = quotes.filter((q) => q.bookId === bookId);
    const qText = query.trim().toLowerCase();
    if (qText) {
      list = list.filter(
        (q) =>
          q.text.toLowerCase().includes(qText) ||
          (q.userNote && q.userNote.toLowerCase().includes(qText))
      );
    }
    return list.sort((a, b) => {
      if (sortNewest) return b.createdAt - a.createdAt;
      return a.createdAt - b.createdAt;
    });
  }, [quotes, bookId, query, sortNewest]);

  // Bookmarks for this book
  const bookBookmarks = useMemo(() => {
    return bookmarks
      .filter((bm) => bm.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [bookmarks, bookId]);

  if (!book) {
    return (
      <View style={styles.centerContainer}>
        <Feather name="alert-circle" size={40} color={colors.danger} />
        <Text style={styles.notFoundText}>Book not found.</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const status = getBookStatus(book);
  const pct = Math.round(book.progress.percentage * 100);

  // Export notes to Markdown (Section 9)
  async function handleExportNotes() {
    if (!book) return;
    let md = `# ${book.title}\n`;
    if (book.author) md += `*by ${book.author}*\n\n`;
    md += `\n---\n\n## Quotes & Highlights\n\n`;

    if (bookQuotes.length === 0) {
      md += `*No quotes saved for this book.*\n\n`;
    } else {
      bookQuotes.forEach((q) => {
        md += `> ${q.text}\n`;
        if (q.pageLabel) md += `*— ${q.pageLabel}*\n`;
        if (q.userNote) md += `\n**Note:** ${q.userNote}\n`;
        md += `\n`;
      });
    }

    if (bookBookmarks.length > 0) {
      md += `\n## Bookmarks\n\n`;
      bookBookmarks.forEach((bm) => {
        md += `- ${bm.label} (${Math.round(bm.percentage * 100)}%)\n`;
      });
    }

    try {
      const cacheFile = `${FileSystem.cacheDirectory}${book.title.replace(/[^\w\s-]/g, "")}-notes.md`;
      await FileSystem.writeAsStringAsync(cacheFile, md, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(cacheFile, { mimeType: "text/markdown", dialogTitle: `Export Notes: ${book.title}` });
    } catch (err: any) {
      Alert.alert("Export error", err.message || "Failed to export notes.");
    }
  }

  function confirmDeleteBook() {
    if (!book) return;
    Alert.alert(
      "Delete book?",
      `“${book.title}” will be removed from your library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Keep notes in Inbox",
          onPress: () => {
            deleteBook(book.id, false);
            navigation.goBack();
          },
        },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            deleteBook(book.id, true);
            navigation.goBack();
          },
        },
      ]
    );
  }

  const menuItems: MenuItem[] = [
    {
      label: "Export notes as Markdown",
      icon: "share",
      onPress: () => {
        setMenuOpen(false);
        handleExportNotes();
      },
    },
    {
      label: status === "finished" ? "Mark as reading" : "Mark as finished",
      icon: "check-circle",
      onPress: () => {
        setMenuOpen(false);
        updateBook(book.id, {
          progress: {
            ...book.progress,
            percentage: status === "finished" ? 0.5 : 1,
            updatedAt: Date.now(),
          },
        });
      },
    },
    {
      label: book.isFavorite ? "Unfavorite" : "Favorite",
      icon: "heart",
      onPress: () => {
        setMenuOpen(false);
        toggleFavoriteBook(book.id);
      },
    },
    {
      label: "Delete book",
      icon: "trash-2",
      danger: true,
      onPress: () => {
        setMenuOpen(false);
        confirmDeleteBook();
      },
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Book Details"
        left={<IconButton icon="arrow-left" label="Back" onPress={() => navigation.goBack()} />}
        right={<IconButton icon="more-vertical" label="Menu" onPress={() => setMenuOpen(true)} />}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Book Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.coverWrapper}>
            {book.coverPath ? (
              <Image source={{ uri: book.coverPath }} style={styles.coverImage} />
            ) : (
              <View style={styles.coverFallback}>
                <Feather name={book.type === "pdf" ? "file-text" : "book"} size={32} color={colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.headerInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.bookTitle} numberOfLines={2}>
                {book.title}
              </Text>
              <Pressable
                onPress={() => toggleFavoriteBook(book.id)}
                hitSlop={8}
                style={styles.favBtn}
              >
                <Feather
                  name="heart"
                  size={20}
                  color={book.isFavorite ? colors.primary : colors.muted}
                />
              </Pressable>
            </View>

            {book.author ? <Text style={styles.bookAuthor}>{book.author}</Text> : null}

            <View style={styles.progressRow}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {status === "finished" ? "Finished" : `${pct}% read`}
              </Text>
            </View>

            {book.filePath && (book.type === "epub" || book.type === "pdf") && (
              <Pressable
                onPress={() => navigation.navigate("BookReader", { bookId: book.id })}
                style={styles.continueBtn}
                accessibilityRole="button"
              >
                <Feather name="book-open" size={15} color={colors.onPrimary} style={{ marginRight: 6 }} />
                <Text style={styles.continueBtnText}>
                  {pct > 0 ? "Continue reading" : "Start reading"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Tabs: Notes (Quotes) | Bookmarks */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab("notes")}
            style={[styles.tabItem, activeTab === "notes" && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === "notes" && styles.tabTextActive]}>
              Notes ({bookQuotes.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("bookmarks")}
            style={[styles.tabItem, activeTab === "bookmarks" && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === "bookmarks" && styles.tabTextActive]}>
              Bookmarks ({bookBookmarks.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab Content */}
        {activeTab === "notes" ? (
          <View style={styles.tabContent}>
            {bookQuotes.length > 0 && (
              <View style={styles.searchRow}>
                <Feather name="search" size={16} color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Filter notes…"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                />
                <Pressable
                  onPress={() => setSortNewest((prev) => !prev)}
                  style={styles.sortToggle}
                >
                  <Feather name="bar-chart-2" size={14} color={colors.primary} />
                  <Text style={styles.sortToggleText}>{sortNewest ? "Newest" : "Position"}</Text>
                </Pressable>
              </View>
            )}

            {bookQuotes.length === 0 ? (
              <EmptyState
                title="No quotes or highlights"
                body="Highlights and quotes made while reading will appear here."
              />
            ) : (
              bookQuotes.map((q) => (
                <View key={q.id} style={styles.quoteCard}>
                  <View style={styles.quoteTopRow}>
                    <View style={[styles.colorDot, { backgroundColor: q.color || "#FFD700" }]} />
                    <Text style={styles.quotePageLabel}>{q.pageLabel || "Highlight"}</Text>
                    <Pressable
                      onPress={() => {
                        Clipboard.setStringAsync(q.text);
                        ToastAndroid.show("Quote copied", ToastAndroid.SHORT);
                      }}
                      hitSlop={8}
                      style={{ marginLeft: "auto", marginRight: 10 }}
                    >
                      <Feather name="copy" size={15} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleOpenEditQuote(q)}
                      hitSlop={8}
                      style={{ marginRight: 10 }}
                    >
                      <Feather name="edit-2" size={15} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Alert.alert("Delete quote?", "Remove this quote from the book.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteQuote(q.id) },
                        ]);
                      }}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={15} color={colors.danger} />
                    </Pressable>
                  </View>

                  <Text style={styles.quoteText}>{q.text}</Text>

                  {q.userNote ? (
                    <View style={styles.userNoteBox}>
                      <Text style={styles.userNoteText}>{q.userNote}</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            {bookBookmarks.length === 0 ? (
              <EmptyState
                title="No bookmarks"
                body="Add bookmarks from the reader bar to jump back anytime."
              />
            ) : (
              bookBookmarks.map((bm) => (
                <View key={bm.id} style={styles.bookmarkRow}>
                  <Feather name="bookmark" size={18} color={colors.primary} />
                  <View style={styles.bmInfo}>
                    <Text style={styles.bmLabel}>{bm.label}</Text>
                    <Text style={styles.bmPct}>{Math.round(bm.percentage * 100)}% through</Text>
                  </View>
                  <Pressable
                    onPress={() => deleteBookmark(bm.id)}
                    hitSlop={8}
                    style={{ padding: 4 }}
                  >
                    <Feather name="trash-2" size={16} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <ActionMenu
        visible={menuOpen}
        title={book.title}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      {/* Edit Note Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditModalVisible(false)}>
          <Pressable style={styles.editSheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.editSheetHeader}>
              <Text style={styles.editSheetTitle}>Edit Note / Highlight</Text>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.editSheetScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.editLabel}>HIGHLIGHTED TEXT</Text>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                placeholder="Quote or highlighted text..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={styles.editTextInput}
              />

              <Text style={[styles.editLabel, { marginTop: 14 }]}>COLOR</Text>
              <View style={styles.colorPillsRow}>
                {(["yellow", "green", "blue", "pink"] as QuoteColor[]).map((c) => {
                  const active = editColor === c;
                  const col = QUOTE_COLORS[c];
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setEditColor(c)}
                      style={[
                        styles.colorPill,
                        { backgroundColor: col.bg, borderColor: active ? col.hex : colors.line },
                        active && { borderWidth: 2 },
                      ]}
                    >
                      <View style={[styles.colorDotInner, { backgroundColor: col.hex }]} />
                      <Text style={[styles.colorPillText, { color: col.hex, fontWeight: active ? "700" : "500" }]}>
                        {col.name}
                      </Text>
                      {active && <Feather name="check" size={14} color={col.hex} />}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.editLabel, { marginTop: 14 }]}>YOUR NOTE / THOUGHTS</Text>
              <TextInput
                value={editUserNote}
                onChangeText={setEditUserNote}
                placeholder="Add reflections, commentary, keywords..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                style={styles.editCommentInput}
              />

              <View style={styles.editActionRow}>
                <Pressable
                  onPress={() => setEditModalVisible(false)}
                  style={styles.editCancelBtn}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </Pressable>

                <Pressable onPress={handleSaveEditQuote} style={styles.editSaveBtn}>
                  <Feather name="check" size={16} color={colors.onPrimary} style={{ marginRight: 6 }} />
                  <Text style={styles.editSaveText}>Save Changes</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  notFoundText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    marginTop: 12,
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  backBtnText: {
    fontFamily: fonts.semibold,
    color: colors.onPrimary,
    fontSize: 14,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 14,
    marginBottom: 16,
  },
  coverWrapper: {
    width: 84,
    height: 122,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  headerInfo: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  bookTitle: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 20,
    marginRight: 6,
  },
  favBtn: {
    padding: 2,
  },
  bookAuthor: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 3,
  },
  progressRow: {
    marginTop: 10,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  progressText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 4,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.sm,
    marginTop: 10,
  },
  continueBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.onPrimary,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 14,
  },
  tabItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  tabContent: {
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
    padding: 0,
  },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sortToggleText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.primary,
  },
  quoteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  quoteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  quotePageLabel: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.muted,
  },
  quoteText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 19,
    fontStyle: "italic",
  },
  userNoteBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  userNoteText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  bookmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  bmInfo: {
    flex: 1,
  },
  bmLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  bmPct: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  editSheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    maxHeight: "85%",
  },
  editSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  editSheetTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  editSheetScroll: {
    padding: 18,
    paddingBottom: 36,
  },
  editLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  editTextInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 80,
    maxHeight: 140,
    textAlignVertical: "top",
  },
  editCommentInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  colorPillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  colorPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  colorDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorPillText: {
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  editActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  editCancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  editSaveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  editSaveText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.onPrimary,
  },
});

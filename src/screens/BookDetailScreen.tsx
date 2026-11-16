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
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { Bookmark, getBookStatus, Quote } from "../types";
import { ActionMenu, EmptyState, IconButton, MenuItem, ScreenHeader } from "../components/ui";

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
    deleteQuote,
    deleteBookmark,
  } = useVault();

  const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  const [activeTab, setActiveTab] = useState<"notes" | "bookmarks">("notes");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState(false);

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

            {book.filePath && book.type === "epub" && (
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
});

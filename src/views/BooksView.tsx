import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault, COVERS_DIR } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { Book, getBookStatus } from "../types";
import { ActionMenu, EmptyState, FabBar, MenuItem, Pill } from "../components/ui";
import { DRM_ERROR_MESSAGE, parseEpub } from "../reader/epubMetadata";
import { readRawBytes } from "../security/fileStorage";
import { uid } from "../utils";

type FilterMode = "all" | "favorites" | "reading" | "finished";
type SortMode = "recent" | "title" | "date";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function BooksView({ navigation }: Props) {
  const {
    books,
    createBook,
    updateBook,
    deleteBook,
    toggleFavoriteBook,
    importBookFile,
  } = useVault();

  const { width: windowWidth } = useWindowDimensions();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [menuBook, setMenuBook] = useState<Book | null>(null);

  // 2 book columns: (width - 32 padding - 12 gap) / 2
  const cardWidth = Math.floor((windowWidth - 32 - 12) / 2);
  const coverHeight = Math.floor(cardWidth * 1.42);

  // Most recently opened / reading book for "Continue reading" card
  const continueBook = useMemo(() => {
    const readable = books.filter((b) => b.type !== "external" && b.filePath);
    if (!readable.length) return null;
    return [...readable].sort((a, b) => {
      const aTime = a.lastOpenedAt ?? a.addedAt;
      const bTime = b.lastOpenedAt ?? b.addedAt;
      return bTime - aTime;
    })[0];
  }, [books]);

  // Filtered & sorted book list
  const filteredBooks = useMemo(() => {
    let list = books;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q))
      );
    }

    if (filter === "favorites") {
      list = list.filter((b) => b.isFavorite);
    } else if (filter === "reading") {
      list = list.filter((b) => getBookStatus(b) === "reading");
    } else if (filter === "finished") {
      list = list.filter((b) => getBookStatus(b) === "finished");
    }

    return [...list].sort((a, b) => {
      if (sort === "recent") {
        const aTime = a.lastOpenedAt ?? a.addedAt;
        const bTime = b.lastOpenedAt ?? b.addedAt;
        return bTime - aTime;
      }
      if (sort === "title") {
        return a.title.localeCompare(b.title);
      }
      return b.addedAt - a.addedAt;
    });
  }, [books, filter, sort, query]);

  async function handlePickBook() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/epub+zip", "application/pdf", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.name || "Untitled";
      const isEpub = name.toLowerCase().endsWith(".epub") || asset.mimeType?.includes("epub");
      const isPdf = name.toLowerCase().endsWith(".pdf") || asset.mimeType?.includes("pdf");

      if (!isEpub && !isPdf) {
        Alert.alert(
          "Unsupported format",
          "Only DRM-free EPUB and PDF books can be opened in DocVault."
        );
        return;
      }

      // Check duplicates
      const existing = books.find(
        (b) => b.title.trim().toLowerCase() === name.replace(/\.(epub|pdf)$/i, "").trim().toLowerCase()
      );
      if (existing) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert("Already imported", `"${existing.title}" is already in your library. Import again?`, [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Import again", onPress: () => resolve(true) },
          ]);
        });
        if (!proceed) return;
      }

      setImporting(true);

      let title = name.replace(/\.(epub|pdf)$/i, "");
      let author: string | null = null;
      let coverPath: string | null = null;

      if (isEpub) {
        try {
          const rawBytes = await readRawBytes(asset.uri);
          const meta = await parseEpub(rawBytes, title);
          title = meta.title || title;
          author = meta.author || null;

          if (meta.coverBase64) {
            await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
            const savedCoverPath = `${COVERS_DIR}cover_${uid()}.jpg`;
            await FileSystem.writeAsStringAsync(savedCoverPath, meta.coverBase64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            coverPath = savedCoverPath;
          }
        } catch (err: any) {
          setImporting(false);
          Alert.alert("Could not open book", err.message || DRM_ERROR_MESSAGE);
          return;
        }
      }

      // Store file encrypted into vault
      const stored = await importBookFile(asset.uri, name);

      const created = await createBook({
        title,
        author,
        type: isEpub ? "epub" : "pdf",
        filePath: stored.filePath,
        coverPath,
        isFavorite: false,
        favoritedAt: null,
        lastOpenedAt: null,
        progress: {
          percentage: 0,
          updatedAt: Date.now(),
        },
      });

      setImporting(false);
      ToastAndroid.show(`"${title}" added to Books`, ToastAndroid.SHORT);

      // Open reader directly for EPUB
      if (isEpub) {
        navigation.navigate("BookReader", { bookId: created.id });
      }
    } catch (err: any) {
      setImporting(false);
      Alert.alert("Import error", err.message || "Failed to import book.");
    }
  }

  function handleBookPress(book: Book) {
    if (book.type === "epub") {
      navigation.navigate("BookReader", { bookId: book.id });
    } else {
      // PDF or external: navigate to BookDetail or Reader
      navigation.navigate("BookDetail", { bookId: book.id });
    }
  }

  function confirmDeleteBook(book: Book) {
    Alert.alert(
      "Delete book?",
      `“${book.title}” will be removed from your library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Keep notes in Inbox",
          onPress: () => deleteBook(book.id, false),
        },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => deleteBook(book.id, true),
        },
      ]
    );
  }

  const menuItems: MenuItem[] = menuBook
    ? [
        {
          label: "Read now",
          icon: "book-open",
          onPress: () => {
            const b = menuBook;
            setMenuBook(null);
            handleBookPress(b);
          },
        },
        {
          label: "Book details & notes",
          icon: "file-text",
          onPress: () => {
            const b = menuBook;
            setMenuBook(null);
            navigation.navigate("BookDetail", { bookId: b.id });
          },
        },
        {
          label: menuBook.isFavorite ? "Unfavorite" : "Favorite",
          icon: "heart",
          onPress: () => {
            toggleFavoriteBook(menuBook.id);
            setMenuBook(null);
          },
        },
        {
          label:
            getBookStatus(menuBook) === "finished"
              ? "Mark as reading"
              : "Mark as finished",
          icon: "check-circle",
          onPress: () => {
            const isFin = getBookStatus(menuBook) === "finished";
            updateBook(menuBook.id, {
              progress: {
                ...menuBook.progress,
                percentage: isFin ? 0.5 : 1,
                updatedAt: Date.now(),
              },
            });
            setMenuBook(null);
          },
        },
        {
          label: "Rename",
          icon: "edit-2",
          onPress: () => {
            const b = menuBook;
            setMenuBook(null);
            Alert.prompt
              ? Alert.prompt("Rename book", undefined, (text) => {
                  if (text && text.trim()) updateBook(b.id, { title: text.trim() });
                }, "plain-text", b.title)
              : undefined;
          },
        },
        {
          label: "Delete book",
          icon: "trash-2",
          danger: true,
          onPress: () => {
            const b = menuBook;
            setMenuBook(null);
            confirmDeleteBook(b);
          },
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <Feather name="search" size={17} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search books & authors…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Filter & Sort Chips */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(["all", "favorites", "reading", "finished"] as FilterMode[]).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f === "all" ? "All" : f === "favorites" ? "Favorites" : f === "reading" ? "Reading" : "Finished"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Continue Reading Hero Card */}
        {continueBook && filter === "all" && !query && (
          <Pressable
            onPress={() => handleBookPress(continueBook)}
            style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.heroCover}>
              {continueBook.coverPath ? (
                <Image source={{ uri: continueBook.coverPath }} style={styles.heroCoverImage} />
              ) : (
                <View style={styles.heroCoverFallback}>
                  <Feather name="book-open" size={26} color={colors.primary} />
                </View>
              )}
            </View>

            <View style={styles.heroInfo}>
              <Text style={styles.heroLabel}>CONTINUE READING</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {continueBook.title}
              </Text>
              {continueBook.author ? (
                <Text style={styles.heroAuthor} numberOfLines={1}>
                  {continueBook.author}
                </Text>
              ) : null}

              <View style={styles.heroProgress}>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.round(continueBook.progress.percentage * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.heroProgressText}>
                  {Math.round(continueBook.progress.percentage * 100)}%
                  {continueBook.progress.chapterLabel ? ` · ${continueBook.progress.chapterLabel}` : ""}
                </Text>
              </View>

              <View style={styles.resumeButton}>
                <Feather name="play" size={13} color={colors.onPrimary} style={{ marginRight: 4 }} />
                <Text style={styles.resumeButtonText}>Resume</Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Books Grid */}
        {filteredBooks.length === 0 ? (
          <EmptyState
            title={query ? "No books found" : "Your Library is Empty"}
            body={
              query
                ? `No books matching "${query}".`
                : "Import DRM-free EPUB or PDF books to start reading offline."
            }
          />
        ) : (
          <View style={styles.grid}>
            {filteredBooks.map((book) => {
              const status = getBookStatus(book);
              const pct = Math.round(book.progress.percentage * 100);

              return (
                <Pressable
                  key={book.id}
                  onPress={() => handleBookPress(book)}
                  onLongPress={() => setMenuBook(book)}
                  style={({ pressed }) => [
                    styles.bookCard,
                    { width: cardWidth },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={[styles.bookCover, { height: coverHeight }]}>
                    {book.coverPath ? (
                      <Image source={{ uri: book.coverPath }} style={styles.bookCoverImage} />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <Feather
                          name={book.type === "pdf" ? "file-text" : "book"}
                          size={32}
                          color={colors.primary}
                        />
                        <Text style={styles.coverPlaceholderTitle} numberOfLines={3}>
                          {book.title}
                        </Text>
                      </View>
                    )}

                    {/* Favorite Heart Toggle */}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleFavoriteBook(book.id);
                      }}
                      hitSlop={10}
                      style={styles.heartButton}
                    >
                      <Feather
                        name="heart"
                        size={17}
                        color={book.isFavorite ? colors.primary : "rgba(255,255,255,0.85)"}
                        style={book.isFavorite ? styles.heartFilled : undefined}
                      />
                    </Pressable>

                    {/* Format Badge */}
                    <View style={styles.formatBadge}>
                      <Text style={styles.formatBadgeText}>{book.type.toUpperCase()}</Text>
                    </View>

                    {/* Progress Bar at bottom of cover */}
                    <View style={styles.cardProgressBarBg}>
                      <View
                        style={[
                          styles.cardProgressBarFill,
                          { width: `${pct}%` },
                          status === "finished" && { backgroundColor: colors.success },
                        ]}
                      />
                    </View>
                  </View>

                  <View style={styles.bookMeta}>
                    <Text style={styles.bookTitle} numberOfLines={2}>
                      {book.title}
                    </Text>
                    {book.author ? (
                      <Text style={styles.bookAuthor} numberOfLines={1}>
                        {book.author}
                      </Text>
                    ) : null}
                    <Text style={styles.bookStatusText}>
                      {status === "finished" ? "Finished" : pct > 0 ? `${pct}% read` : "Unread"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <FabBar bottomOffset={18} withNavBar>
        <Pill
          icon="plus"
          label={importing ? "Importing…" : "Import Book"}
          onPress={handlePickBook}
          disabled={importing}
        />
      </FabBar>

      {/* Long-press Action Menu */}
      <ActionMenu
        visible={menuBook !== null}
        title={menuBook?.title}
        items={menuItems}
        onClose={() => setMenuBook(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.ink,
    padding: 0,
  },
  filterBar: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.onPrimary,
    fontFamily: fonts.semibold,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  heroCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 16,
    gap: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  heroCover: {
    width: 74,
    height: 106,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  heroCoverImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  heroCoverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  heroInfo: {
    flex: 1,
    justifyContent: "center",
  },
  heroLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    color: colors.primary,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 20,
  },
  heroAuthor: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  heroProgress: {
    marginTop: 8,
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
  heroProgressText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 4,
  },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginTop: 8,
  },
  resumeButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: colors.onPrimary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  bookCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    marginBottom: 4,
  },
  bookCover: {
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    position: "relative",
  },
  bookCoverImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  coverPlaceholder: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderTitle: {
    fontFamily: fonts.heading,
    fontSize: 13.5,
    color: colors.ink,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 17,
  },
  heartButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 15,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heartFilled: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 2,
  },
  formatBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 9.5,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  cardProgressBarBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  cardProgressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  bookMeta: {
    padding: 10,
  },
  bookTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 18,
  },
  bookAuthor: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  bookStatusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
  },
});

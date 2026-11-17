import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { useKeepAwake } from "expo-keep-awake";
import * as Brightness from "expo-brightness";

const RNWebView = WebView as unknown as React.ComponentType<any>;
import { RootStackParamList } from "../navigation";
import * as FileSystem from "expo-file-system/legacy";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { BookProgress, QuoteColor, ReaderMargin, ReaderSettings, ReaderTextAlign, ReaderTheme } from "../types";
import { getReaderHtml, THEME_PALETTES } from "../reader/readerHtml";
import { getPdfReaderHtml } from "../reader/pdfHtml";
import { ocrSupported, readPageText } from "../ocr/read";

type Props = NativeStackScreenProps<RootStackParamList, "BookReader">;

type TocItem = {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
};

export const QUOTE_COLORS: Record<QuoteColor, { name: string; hex: string; bg: string }> = {
  yellow: { name: "Yellow", hex: "#E5A800", bg: "#FEF7D6" },
  green: { name: "Green", hex: "#1EA755", bg: "#E2F7E9" },
  blue: { name: "Blue", hex: "#2678D0", bg: "#E5F0FC" },
  pink: { name: "Pink", hex: "#D83E7F", bg: "#FCE7F1" },
};

export default function BookReaderScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const {
    books,
    updateBookProgress,
    readerSettings,
    updateReaderSettings,
    getBookDecryptedUri,
    loadBookLocations,
    saveBookLocations,
    createQuote,
  } = useVault();

  const insets = useSafeAreaInsets();
  const webviewRef = useRef<any>(null);

  // Active book
  const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  // Keep screen awake if setting enabled
  if (readerSettings.keepScreenOn) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useKeepAwake();
  }

  // State
  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [cachedLocations, setCachedLocations] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uiVisible, setUiVisible] = useState(false);
  const [tocVisible, setTocVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [tocList, setTocList] = useState<TocItem[]>([]);
  const [brightnessVal, setBrightnessVal] = useState<number | null>(readerSettings.brightness ?? null);

  // Note / Quote capture state
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteUserComment, setNoteUserComment] = useState("");
  const [noteColor, setNoteColor] = useState<QuoteColor>("yellow");
  const [ocrRunning, setOcrRunning] = useState(false);
  const lastPageImageDataRef = useRef<string | null>(null);
  const selectedCfiRangeRef = useRef<string | null>(null);

  // Highlighter mode state
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState<QuoteColor>("yellow");

  // Current reading position
  const [currentCfi, setCurrentCfi] = useState<string | null>(book?.progress.epubCfi ?? null);
  const [percentage, setPercentage] = useState<number>(book?.progress.percentage ?? 0);
  const [chapterLabel, setChapterLabel] = useState<string | null>(book?.progress.chapterLabel ?? null);
  const [pageInfo, setPageInfo] = useState<{ page: number | null; total: number | null }>({
    page: book?.progress.pdfPage ?? null,
    total: book?.progress.pdfTotalPages ?? null,
  });

  // Undo accidental jump
  const [previousCfi, setPreviousCfi] = useState<string | null>(null);
  const [undoJumpVisible, setUndoJumpVisible] = useState(false);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Active theme
  const theme = THEME_PALETTES[readerSettings.theme] || THEME_PALETTES.light;

  // Track latest progress for immediate save
  const latestProgressRef = useRef<{
    epubCfi: string | null;
    percentage: number;
    chapterLabel: string | null;
    pdfPage: number | null;
    pdfTotalPages: number | null;
  }>({
    epubCfi: book?.progress.epubCfi ?? null,
    percentage: book?.progress.percentage ?? 0,
    chapterLabel: book?.progress.chapterLabel ?? null,
    pdfPage: book?.progress.pdfPage ?? null,
    pdfTotalPages: book?.progress.pdfTotalPages ?? null,
  });

  // ─── Bulletproof Progress Save Engine (Section 6) ──────────────────────────

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const current = latestProgressRef.current;
    if (current.epubCfi || current.pdfPage || current.percentage > 0) {
      updateBookProgress(bookId, {
        epubCfi: current.epubCfi,
        percentage: current.percentage,
        chapterLabel: current.chapterLabel,
        pdfPage: current.pdfPage,
        pdfTotalPages: current.pdfTotalPages,
      }).catch((e) => console.warn("[reader] progress save error:", e));
    }
  }, [bookId, updateBookProgress]);

  const scheduleDebouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      flushSave();
    }, 500);
  }, [flushSave]);

  // Decrypt file and load cached locations on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!book || !book.filePath) {
        setLoadError("Book file not found.");
        setLoading(false);
        return;
      }

      try {
        const [decUri, locations] = await Promise.all([
          getBookDecryptedUri(book.filePath),
          loadBookLocations(bookId),
        ]);

        if (cancelled) return;
        setDecryptedUri(decUri);
        setCachedLocations(locations);
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err.message || "Failed to prepare book.");
        setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [book, bookId, getBookDecryptedUri, loadBookLocations]);

  // Periodic safety save every 20 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      flushSave();
    }, 20000);
    return () => clearInterval(timer);
  }, [flushSave]);

  // Immediate save on AppState change (background / inactive)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        flushSave();
      }
    });
    return () => sub.remove();
  }, [flushSave]);

  // Immediate save on Android hardware back press
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      flushSave();
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [flushSave, navigation]);

  // Immediate save on unmount
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  // In-reader brightness
  useEffect(() => {
    if (brightnessVal != null) {
      Brightness.setBrightnessAsync(brightnessVal).catch(() => undefined);
    } else {
      Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
    }
  }, [brightnessVal]);

  // Send message to WebView
  const sendToWebview = useCallback((action: string, payload: Record<string, any> = {}) => {
    if (webviewRef.current) {
      const msg = JSON.stringify({ action, ...payload });
      webviewRef.current.postMessage(msg);
    }
  }, []);

  // Handle messages from WebView
  const handleWebMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case "ready":
          case "loaded":
            setLoading(false);
            if (typeof data.pages === "number") {
              setPageInfo((prev) => ({ ...prev, total: data.pages }));
              latestProgressRef.current = {
                ...latestProgressRef.current,
                pdfTotalPages: data.pages,
              };
            }
            break;

          case "toggle_ui":
            setUiVisible((prev) => !prev);
            break;

          case "page_changed": {
            setLoading(false);
            const curP = typeof data.page === "number" ? data.page : 1;
            const totalP = typeof data.total === "number" ? data.total : (pageInfo.total || null);
            const nextPct = typeof data.percentage === "number" ? data.percentage : (totalP ? curP / totalP : 0);

            setPercentage(nextPct);
            setPageInfo({ page: curP, total: totalP });

            latestProgressRef.current = {
              ...latestProgressRef.current,
              pdfPage: curP,
              pdfTotalPages: totalP,
              percentage: nextPct,
            };
            scheduleDebouncedSave();
            break;
          }

          case "relocated": {
            const nextCfi = data.cfi || null;
            const nextPct = typeof data.percentage === "number" ? data.percentage : 0;
            const nextChapter = data.chapterLabel || null;

            setCurrentCfi(nextCfi);
            setPercentage(nextPct);
            if (nextChapter) setChapterLabel(nextChapter);
            if (data.page != null && data.total != null) {
              setPageInfo({ page: data.page, total: data.total });
            }

            latestProgressRef.current = {
              ...latestProgressRef.current,
              epubCfi: nextCfi,
              percentage: nextPct,
              chapterLabel: nextChapter || latestProgressRef.current.chapterLabel,
            };

            scheduleDebouncedSave();
            break;
          }

          case "toc":
            if (Array.isArray(data.toc)) {
              setTocList(data.toc);
            }
            break;

          case "locations_ready":
            if (data.locations) {
              saveBookLocations(bookId, data.locations);
              if (data.total) {
                setPageInfo((prev) => ({ ...prev, total: data.total }));
              }
            }
            break;

          case "page_text_extracted":
            lastPageImageDataRef.current = data.imageData || null;
            if (data.text) {
              setNoteText((prev) => (prev ? prev : data.text));
            }
            break;

          case "highlight_captured": {
            const capText = data.text ? data.text.trim() : "";
            const capColor = data.color || highlightColor;
            setNoteColor(capColor);

            if (data.cfiRange) {
              selectedCfiRangeRef.current = data.cfiRange;
            }

            if (capText) {
              setNoteText(capText);
              setNoteModalVisible(true);
            } else if (data.imageData) {
              lastPageImageDataRef.current = data.imageData;
              handleRunOcrOnSnippet(data.imageData);
            } else {
              setNoteText("");
              setNoteModalVisible(true);
            }
            break;
          }

          case "text_selected":
            selectedCfiRangeRef.current = data.cfiRange || null;
            if (data.text) {
              setNoteText(data.text);
              setNoteModalVisible(true);
            }
            break;

          case "error":
            setLoadError(data.message || "Reader error");
            setLoading(false);
            break;
        }
      } catch (e) {
        console.warn("Reader message parse error", e);
      }
    },
    [bookId, saveBookLocations, scheduleDebouncedSave]
  );

  // Jump to TOC chapter
  const handleSelectChapter = (href: string) => {
    if (currentCfi) {
      setPreviousCfi(currentCfi);
      setUndoJumpVisible(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoJumpVisible(false), 6000);
    }

    sendToWebview("jump_href", { href });
    setTocVisible(false);
  };

  // Undo accidental jump
  const handleUndoJump = () => {
    if (previousCfi) {
      sendToWebview("jump_cfi", { cfi: previousCfi });
      setUndoJumpVisible(false);
      setPreviousCfi(null);
    }
  };

  // Update typography or theme settings
  const handleUpdateSettings = (patch: Partial<ReaderSettings>) => {
    const updated = { ...readerSettings, ...patch };
    updateReaderSettings(patch);
    sendToWebview("update_settings", { settings: updated });
  };

  // Toggle highlighter mode
  const handleToggleHighlightMode = useCallback(() => {
    setHighlightMode((prev) => {
      const next = !prev;
      sendToWebview("set_highlight_mode", {
        enabled: next,
        color: highlightColor,
        colorHex: QUOTE_COLORS[highlightColor].hex,
      });
      ToastAndroid.show(
        next ? "Highlighter on: drag or select text on page" : "Highlighter off",
        ToastAndroid.SHORT
      );
      return next;
    });
  }, [highlightColor, sendToWebview]);

  // Change active highlight color
  const handleChangeHighlightColor = useCallback(
    (c: QuoteColor) => {
      setHighlightColor(c);
      setNoteColor(c);
      sendToWebview("set_highlight_color", {
        color: c,
        colorHex: QUOTE_COLORS[c].hex,
      });
    },
    [sendToWebview]
  );

  // Run on-device OCR on a cropped highlight slice
  const handleRunOcrOnSnippet = useCallback(
    async (b64Data: string) => {
      if (!ocrSupported) {
        setNoteText("");
        setNoteModalVisible(true);
        return;
      }
      ToastAndroid.show("Reading highlighted section…", ToastAndroid.SHORT);
      setOcrRunning(true);
      try {
        const tempUri = `${FileSystem.cacheDirectory}ocr_hl_${Date.now()}.jpg`;
        const cleanB64 = b64Data.replace(/^data:image\/\w+;base64,/, "");
        await FileSystem.writeAsStringAsync(tempUri, cleanB64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const recognized = await readPageText(tempUri);
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        if (recognized && recognized.trim()) {
          setNoteText(recognized.trim());
          ToastAndroid.show("Highlighted text recognized via OCR", ToastAndroid.SHORT);
        } else {
          setNoteText("");
        }
      } catch (e) {
        setNoteText("");
      } finally {
        setOcrRunning(false);
        setNoteModalVisible(true);
      }
    },
    []
  );

  // Open Note / Quote capture
  const handleOpenNoteCapture = () => {
    setNoteModalVisible(true);
    sendToWebview("extract_page_text");
  };

  // Run on-device OCR on page image
  const handleRunOcr = async () => {
    if (!lastPageImageDataRef.current) {
      Alert.alert("No page image", "Current page image is not available for OCR.");
      return;
    }
    if (!ocrSupported) {
      Alert.alert("OCR unavailable", "On-device OCR is not supported on this device.");
      return;
    }
    setOcrRunning(true);
    try {
      const tempUri = `${FileSystem.cacheDirectory}ocr_page_${Date.now()}.jpg`;
      const b64 = lastPageImageDataRef.current.replace(/^data:image\/\w+;base64,/, "");
      await FileSystem.writeAsStringAsync(tempUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const recognized = await readPageText(tempUri);
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      if (recognized && recognized.trim()) {
        setNoteText(recognized.trim());
        ToastAndroid.show("Text extracted via OCR", ToastAndroid.SHORT);
      } else {
        Alert.alert("No text found", "Could not detect clear text on this page.");
      }
    } catch (err: any) {
      Alert.alert("OCR error", err.message || "Failed to run OCR on page image.");
    } finally {
      setOcrRunning(false);
    }
  };

  // Save Note / Quote
  const handleSaveNote = async () => {
    const cleanText = noteText.trim();
    const cleanComment = noteUserComment.trim();
    if (!cleanText && !cleanComment) {
      Alert.alert("Empty note", "Please highlight, extract, or type text to save.");
      return;
    }
    try {
      const isPdf = book?.type === "pdf";
      const pageLabel = isPdf
        ? `Page ${pageInfo.page || 1}`
        : (chapterLabel || (book?.title ? `${book.title}` : "Note"));

      await createQuote({
        bookId,
        text: cleanText || cleanComment,
        color: noteColor,
        userNote: cleanComment || null,
        pdfPage: isPdf ? (pageInfo.page || 1) : null,
        epubCfiRange: !isPdf ? selectedCfiRangeRef.current : null,
        pageLabel,
        source: "reader",
      });

      if (!isPdf && selectedCfiRangeRef.current) {
        sendToWebview("highlight", {
          cfiRange: selectedCfiRangeRef.current,
          color: QUOTE_COLORS[noteColor].hex,
        });
      }

      ToastAndroid.show("Note saved to book", ToastAndroid.SHORT);
      setNoteModalVisible(false);
      setNoteText("");
      setNoteUserComment("");
      selectedCfiRangeRef.current = null;
    } catch (err: any) {
      Alert.alert("Could not save note", err.message || "Failed to save note.");
    }
  };

  // Initial values stored at mount time so progress updates never recreate htmlSource
  const initialPdfPage = useRef(book?.progress.pdfPage || 1);
  const initialEpubCfi = useRef(book?.progress.epubCfi ?? null);
  const initialSettings = useRef(readerSettings);

  // HTML source for WebView
  const htmlSource = useMemo(() => {
    if (!decryptedUri) return null;
    if (book?.type === "pdf") {
      return getPdfReaderHtml(
        decryptedUri,
        false,
        initialPdfPage.current,
        initialSettings.current.theme
      );
    }
    return getReaderHtml(
      decryptedUri,
      false,
      initialEpubCfi.current,
      initialSettings.current,
      cachedLocations
    );
  }, [
    decryptedUri,
    book?.type,
    cachedLocations,
  ]);

  if (loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Feather name="alert-circle" size={42} color={colors.danger} />
        <Text style={[styles.errorText, { color: theme.text }]}>{loadError}</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.errorBackBtn}
          accessibilityRole="button"
        >
          <Text style={styles.errorBackBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={!uiVisible} style={readerSettings.theme === "light" || readerSettings.theme === "sepia" ? "dark" : "light"} />

      {/* EPUB WebView */}
      {htmlSource ? (
        <RNWebView
          ref={webviewRef}
          source={{ html: htmlSource, baseUrl: "file://" }}
          style={styles.webview}
          originWhitelist={["*"]}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={handleWebMessage}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      ) : null}

      {/* Loading Overlay */}
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.activeIcon} />
          <Text style={[styles.loadingLabel, { color: theme.text }]}>Opening book…</Text>
        </View>
      )}

      {/* Reader Header (Immersive toggle) */}
      {uiVisible && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.headerBg,
              borderBottomColor: theme.border,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
        >
          <Pressable
            onPress={() => {
              flushSave();
              navigation.goBack();
            }}
            hitSlop={10}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close reader"
          >
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {book?.title || "Reading"}
          </Text>

          <View style={styles.headerRight}>
            <Pressable
              onPress={handleToggleHighlightMode}
              hitSlop={8}
              style={[
                styles.iconBtn,
                highlightMode && {
                  backgroundColor: theme.activeIcon,
                  borderRadius: 20,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Highlighter mode"
            >
              <Feather
                name="edit-3"
                size={20}
                color={
                  highlightMode
                    ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                      ? "#121212"
                      : colors.onPrimary
                    : theme.text
                }
              />
            </Pressable>

            {book?.type === "epub" && (
              <Pressable
                onPress={() => setTocVisible(true)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Table of contents"
              >
                <Feather name="list" size={20} color={theme.text} />
              </Pressable>
            )}

            <Pressable
              onPress={() => setSettingsVisible(true)}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Reader settings"
            >
              <Feather name="type" size={20} color={theme.text} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Highlighter Toolbar (active when highlightMode is ON) */}
      {highlightMode && (
        <View
          style={[
            styles.highlighterBar,
            {
              backgroundColor: theme.headerBg,
              borderColor: theme.border,
              top: uiVisible ? Math.max(insets.top, 12) + 54 : Math.max(insets.top, 12) + 8,
            },
          ]}
        >
          <View style={styles.hlInfoRow}>
            <View style={[styles.hlPencilBadge, { backgroundColor: QUOTE_COLORS[highlightColor].hex }]}>
              <Feather name="edit-3" size={13} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.hlTitle, { color: theme.text }]}>Highlighter Active</Text>
              <Text style={[styles.hlSubtitle, { color: theme.text }]}>Drag over text on page to highlight & quote</Text>
            </View>
            <Pressable
              onPress={handleToggleHighlightMode}
              style={[styles.hlDoneBtn, { borderColor: theme.border, backgroundColor: theme.bg }]}
            >
              <Text style={[styles.hlDoneText, { color: theme.text }]}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.hlColors}>
            {(["yellow", "green", "blue", "pink"] as QuoteColor[]).map((c) => {
              const col = QUOTE_COLORS[c];
              const active = highlightColor === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => handleChangeHighlightColor(c)}
                  style={[
                    styles.hlColorDot,
                    { backgroundColor: col.hex, borderColor: active ? theme.text : "transparent" },
                    active && styles.hlColorDotActive,
                  ]}
                >
                  {active && <Feather name="check" size={11} color="#FFF" />}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Accidental Jump Undo Chip */}
      {undoJumpVisible && (
        <View style={[styles.undoChipWrapper, { top: insets.top + 60 }]}>
          <Pressable onPress={handleUndoJump} style={styles.undoChip}>
            <Feather name="rotate-ccw" size={14} color={colors.onPrimary} style={{ marginRight: 6 }} />
            <Text style={styles.undoChipText}>Back to where you were</Text>
          </Pressable>
        </View>
      )}

      {/* Reader Footer (Immersive toggle) */}
      {uiVisible && (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.headerBg,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* Chapter / Page Info */}
          <View style={styles.footerInfoRow}>
            <Text style={[styles.footerChapter, { color: theme.text }]} numberOfLines={1}>
              {chapterLabel || book?.title || ""}
            </Text>
            <Text style={[styles.footerPage, { color: theme.text }]}>
              {pageInfo.page && pageInfo.total
                ? `Page ${pageInfo.page} of ${pageInfo.total}`
                : `${Math.round(percentage * 100)}%`}
            </Text>
          </View>

          {/* Scrubbing Slider / Navigation Bar */}
          <View style={styles.footerControlsRow}>
            <Pressable
              onPress={() => sendToWebview("prev")}
              hitSlop={8}
              style={styles.pageTurnBtn}
              accessibilityLabel="Previous page"
            >
              <Feather name="chevron-left" size={22} color={theme.text} />
            </Pressable>

            <View style={styles.sliderTrack}>
              <View
                style={[
                  styles.sliderFill,
                  { width: `${Math.round(percentage * 100)}%`, backgroundColor: theme.activeIcon },
                ]}
              />
            </View>

            <Pressable
              onPress={() => sendToWebview("next")}
              hitSlop={8}
              style={styles.pageTurnBtn}
              accessibilityLabel="Next page"
            >
              <Feather name="chevron-right" size={22} color={theme.text} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Table of Contents Modal */}
      <Modal visible={tocVisible} transparent animationType="slide" onRequestClose={() => setTocVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTocVisible(false)}>
          <Pressable
            style={[styles.sheetContainer, { backgroundColor: theme.headerBg, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Table of Contents</Text>
              <Pressable onPress={() => setTocVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetScroll}>
              {tocList.length === 0 ? (
                <Text style={[styles.emptyTocText, { color: theme.text }]}>No table of contents available.</Text>
              ) : (
                tocList.map((item, index) => {
                  const isCurrent = chapterLabel && item.label.trim() === chapterLabel.trim();
                  const isDarkReader = readerSettings.theme === "dark" || readerSettings.theme === "black";
                  return (
                    <Pressable
                      key={item.id || item.href || String(index)}
                      onPress={() => handleSelectChapter(item.href)}
                      style={[
                        styles.tocRow,
                        isCurrent && {
                          backgroundColor: isDarkReader ? "#2D2228" : colors.primarySoft,
                          borderRadius: radius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tocLabel,
                          { color: isCurrent ? theme.activeIcon : theme.text },
                          isCurrent && { fontFamily: fonts.semibold },
                        ]}
                        numberOfLines={2}
                      >
                        {item.label ? item.label.trim() : `Chapter ${index + 1}`}
                      </Text>
                      {isCurrent && <Feather name="check" size={16} color={theme.activeIcon} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings Bottom Sheet */}
      <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSettingsVisible(false)}>
          <Pressable
            style={[styles.sheetContainer, { backgroundColor: theme.headerBg, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Reader Appearance</Text>
              <Pressable onPress={() => setSettingsVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.settingsScroll}>
              {/* Themes: Light, Sepia, Dark, Black */}
              <Text style={[styles.settingSectionLabel, { color: theme.text }]}>THEME</Text>
              <View style={styles.themeSelectorRow}>
                {(["light", "sepia", "dark", "black"] as ReaderTheme[]).map((t) => {
                  const pal = THEME_PALETTES[t];
                  const active = readerSettings.theme === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => handleUpdateSettings({ theme: t })}
                      style={[
                        styles.themeButton,
                        {
                          backgroundColor: pal.bg,
                          borderColor: active ? pal.activeIcon : pal.border,
                          borderWidth: active ? 2 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.themeButtonText, { color: pal.text }]}>
                        {t === "light" ? "Light" : t === "sepia" ? "Sepia" : t === "dark" ? "Dark" : "Black"}
                      </Text>
                      {active && (
                        <Feather name="check" size={12} color={pal.activeIcon} style={{ marginLeft: 3 }} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {book?.type === "epub" ? (
                <>
                  {/* Font Size */}
                  <Text style={[styles.settingSectionLabel, { color: theme.text }]}>FONT SIZE</Text>
                  <View style={styles.fontSizeRow}>
                    <Pressable
                      onPress={() => handleUpdateSettings({ fontSize: Math.max(12, readerSettings.fontSize - 1) })}
                      style={[styles.stepperBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
                    >
                      <Text style={[styles.stepperText, { color: theme.text }]}>A−</Text>
                    </Pressable>
                    <Text style={[styles.fontSizeDisplay, { color: theme.text }]}>{readerSettings.fontSize} pt</Text>
                    <Pressable
                      onPress={() => handleUpdateSettings({ fontSize: Math.min(32, readerSettings.fontSize + 1) })}
                      style={[styles.stepperBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
                    >
                      <Text style={[styles.stepperText, { color: theme.text }]}>A+</Text>
                    </Pressable>
                  </View>

                  {/* Font Family */}
                  <Text style={[styles.settingSectionLabel, { color: theme.text }]}>FONT FAMILY</Text>
                  <View style={styles.fontFamilyRow}>
                    {[
                      { label: "System", value: "system" },
                      { label: "Serif", value: "Georgia, serif" },
                      { label: "Sans", value: "Figtree, sans-serif" },
                    ].map((f) => {
                      const active = readerSettings.fontFamily === f.value;
                      const isDark = readerSettings.theme === "dark" || readerSettings.theme === "black";
                      return (
                        <Pressable
                          key={f.value}
                          onPress={() => handleUpdateSettings({ fontFamily: f.value })}
                          style={[
                            styles.chipOption,
                            {
                              backgroundColor: active ? theme.activeIcon : theme.bg,
                              borderColor: active ? theme.activeIcon : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipOptionText,
                              { color: active ? (isDark ? "#121212" : colors.onPrimary) : theme.text },
                            ]}
                          >
                            {f.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Margins */}
                  <Text style={[styles.settingSectionLabel, { color: theme.text }]}>MARGINS</Text>
                  <View style={styles.fontFamilyRow}>
                    {(["small", "medium", "large"] as ReaderMargin[]).map((m) => {
                      const active = readerSettings.margin === m;
                      const isDark = readerSettings.theme === "dark" || readerSettings.theme === "black";
                      return (
                        <Pressable
                          key={m}
                          onPress={() => handleUpdateSettings({ margin: m })}
                          style={[
                            styles.chipOption,
                            {
                              backgroundColor: active ? theme.activeIcon : theme.bg,
                              borderColor: active ? theme.activeIcon : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipOptionText,
                              { color: active ? (isDark ? "#121212" : colors.onPrimary) : theme.text },
                            ]}
                          >
                            {m === "small" ? "Small" : m === "medium" ? "Medium" : "Large"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Text Alignment */}
                  <Text style={[styles.settingSectionLabel, { color: theme.text }]}>ALIGNMENT</Text>
                  <View style={styles.fontFamilyRow}>
                    {(["left", "justify"] as ReaderTextAlign[]).map((a) => {
                      const active = readerSettings.textAlign === a;
                      const isDark = readerSettings.theme === "dark" || readerSettings.theme === "black";
                      return (
                        <Pressable
                          key={a}
                          onPress={() => handleUpdateSettings({ textAlign: a })}
                          style={[
                            styles.chipOption,
                            {
                              backgroundColor: active ? theme.activeIcon : theme.bg,
                              borderColor: active ? theme.activeIcon : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipOptionText,
                              { color: active ? (isDark ? "#121212" : colors.onPrimary) : theme.text },
                            ]}
                          >
                            {a === "left" ? "Left Align" : "Justify"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <View style={[styles.pdfNoteBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Feather name="info" size={15} color={theme.activeIcon} />
                  <Text style={[styles.pdfNoteText, { color: theme.text }]}>
                    Fixed-layout PDF document. Theme and brightness adjustments apply.
                  </Text>
                </View>
              )}

              {/* Brightness Controls */}
              <Text style={[styles.settingSectionLabel, { color: theme.text }]}>SCREEN BRIGHTNESS</Text>
              <View style={styles.brightnessRow}>
                <Pressable
                  onPress={() => {
                    setBrightnessVal(0.2);
                    handleUpdateSettings({ brightness: 0.2 });
                  }}
                  style={[
                    styles.chipOption,
                    {
                      backgroundColor: brightnessVal === 0.2 ? theme.activeIcon : theme.bg,
                      borderColor: brightnessVal === 0.2 ? theme.activeIcon : theme.border,
                    },
                  ]}
                >
                  <Feather
                    name="moon"
                    size={14}
                    color={
                      brightnessVal === 0.2
                        ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                          ? "#121212"
                          : colors.onPrimary
                        : theme.text
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.chipOptionText,
                      {
                        color:
                          brightnessVal === 0.2
                            ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                              ? "#121212"
                              : colors.onPrimary
                            : theme.text,
                      },
                    ]}
                  >
                    Low
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setBrightnessVal(0.6);
                    handleUpdateSettings({ brightness: 0.6 });
                  }}
                  style={[
                    styles.chipOption,
                    {
                      backgroundColor: brightnessVal === 0.6 ? theme.activeIcon : theme.bg,
                      borderColor: brightnessVal === 0.6 ? theme.activeIcon : theme.border,
                    },
                  ]}
                >
                  <Feather
                    name="sun"
                    size={14}
                    color={
                      brightnessVal === 0.6
                        ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                          ? "#121212"
                          : colors.onPrimary
                        : theme.text
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.chipOptionText,
                      {
                        color:
                          brightnessVal === 0.6
                            ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                              ? "#121212"
                              : colors.onPrimary
                            : theme.text,
                      },
                    ]}
                  >
                    Mid
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setBrightnessVal(null);
                    handleUpdateSettings({ brightness: null });
                  }}
                  style={[
                    styles.chipOption,
                    {
                      backgroundColor: brightnessVal === null ? theme.activeIcon : theme.bg,
                      borderColor: brightnessVal === null ? theme.activeIcon : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipOptionText,
                      {
                        color:
                          brightnessVal === null
                            ? readerSettings.theme === "dark" || readerSettings.theme === "black"
                              ? "#121212"
                              : colors.onPrimary
                            : theme.text,
                      },
                    ]}
                  >
                    System
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note / Quote Capture Sheet */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNoteModalVisible(false)}>
          <Pressable
            style={[styles.noteSheetContainer, { backgroundColor: theme.headerBg, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Add Note / Quote</Text>
                <Text style={[styles.noteSubLabel, { color: theme.text }]} numberOfLines={1}>
                  {book?.type === "pdf"
                    ? `Page ${pageInfo.page || 1}`
                    : (chapterLabel || book?.title || "Note")}
                </Text>
              </View>
              <Pressable onPress={() => setNoteModalVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.noteSheetScroll} keyboardShouldPersistTaps="handled">
              {/* Highlight / Quote Text Section */}
              <View style={styles.noteSectionHeaderRow}>
                <Text style={[styles.settingSectionLabel, { color: theme.text }]}>QUOTE / EXTRACTED TEXT</Text>
                {book?.type === "pdf" && (
                  <Pressable
                    onPress={handleRunOcr}
                    disabled={ocrRunning}
                    style={[
                      styles.ocrBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor:
                          readerSettings.theme === "dark" || readerSettings.theme === "black"
                            ? "#2D2228"
                            : colors.primarySoft,
                      },
                    ]}
                  >
                    {ocrRunning ? (
                      <ActivityIndicator size="small" color={theme.activeIcon} />
                    ) : (
                      <>
                        <Feather name="camera" size={13} color={theme.activeIcon} />
                        <Text style={[styles.ocrBtnText, { color: theme.activeIcon }]}>Run OCR</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder={book?.type === "pdf" ? "Extracted page text or enter quote..." : "Enter or paste quote text..."}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                style={[
                  styles.noteTextInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                  },
                ]}
              />

              {/* Color Selector */}
              <Text style={[styles.settingSectionLabel, { color: theme.text, marginTop: 14 }]}>
                HIGHLIGHT COLOR
              </Text>
              <View style={styles.colorPillsRow}>
                {(["yellow", "green", "blue", "pink"] as QuoteColor[]).map((c) => {
                  const active = noteColor === c;
                  const col = QUOTE_COLORS[c];
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setNoteColor(c)}
                      style={[
                        styles.colorPill,
                        { backgroundColor: col.bg, borderColor: active ? col.hex : theme.border },
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

              {/* Personal Reflection Note */}
              <Text style={[styles.settingSectionLabel, { color: theme.text, marginTop: 14 }]}>
                YOUR NOTE (OPTIONAL)
              </Text>
              <TextInput
                value={noteUserComment}
                onChangeText={setNoteUserComment}
                placeholder="Add thoughts, reflections, or keywords..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                style={[
                  styles.commentInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                  },
                ]}
              />

              {/* Action Buttons */}
              <View style={styles.noteActionRow}>
                <Pressable
                  onPress={() => setNoteModalVisible(false)}
                  style={[styles.noteCancelBtn, { borderColor: theme.border, backgroundColor: theme.bg }]}
                >
                  <Text style={[styles.noteCancelText, { color: theme.text }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleSaveNote}
                  style={[
                    styles.noteSaveBtn,
                    {
                      backgroundColor: theme.activeIcon,
                    },
                  ]}
                >
                  <Feather
                    name="check"
                    size={16}
                    color={
                      readerSettings.theme === "dark" || readerSettings.theme === "black"
                        ? "#121212"
                        : colors.onPrimary
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.noteSaveText,
                      {
                        color:
                          readerSettings.theme === "dark" || readerSettings.theme === "black"
                            ? "#121212"
                            : colors.onPrimary,
                      },
                    ]}
                  >
                    Save Note
                  </Text>
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
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
  },
  errorBackBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  errorBackBtnText: {
    fontFamily: fonts.semibold,
    color: colors.onPrimary,
    fontSize: 14,
  },
  loadingOverlay: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  loadingLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 12,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 20,
    elevation: 4,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 15,
    marginHorizontal: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    zIndex: 20,
    elevation: 4,
  },
  footerInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  footerChapter: {
    fontFamily: fonts.body,
    fontSize: 12,
    flex: 1,
    marginRight: 12,
  },
  footerPage: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  footerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pageTurnBtn: {
    padding: 4,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
  },
  undoChipWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },
  undoChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    elevation: 5,
  },
  undoChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: colors.onPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
  },
  sheetScroll: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyTocText: {
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: "center",
    marginVertical: 20,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  tocLabel: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    flex: 1,
  },
  settingsScroll: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  settingSectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 8,
  },
  themeSelectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  themeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  themeButtonActive: {
    borderWidth: 2,
  },
  themeButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
  },
  fontSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperBtn: {
    width: 60,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  fontSizeDisplay: {
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  fontFamilyRow: {
    flexDirection: "row",
    gap: 8,
  },
  chipOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  chipOptionText: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  brightnessRow: {
    flexDirection: "row",
    gap: 8,
  },
  pdfNoteBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginVertical: 12,
  },
  pdfNoteText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  noteSheetContainer: {
    maxHeight: "85%",
    width: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  noteSubLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  noteSheetScroll: {
    padding: 18,
    paddingBottom: 36,
  },
  noteSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  ocrBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.primarySoft,
  },
  ocrBtnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
  noteTextInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 88,
    maxHeight: 150,
    textAlignVertical: "top",
  },
  colorPillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
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
  commentInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 56,
    textAlignVertical: "top",
    marginTop: 6,
  },
  noteActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  noteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noteCancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  noteSaveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  noteSaveText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.onPrimary,
  },
  highlighterBar: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 100,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 8,
  },
  hlInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  hlPencilBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  hlTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  hlSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    opacity: 0.7,
  },
  hlDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  hlDoneText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  hlColors: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  hlColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  hlColorDotActive: {
    borderWidth: 2.5,
    transform: [{ scale: 1.15 }],
  },
});

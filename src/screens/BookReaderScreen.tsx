import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { BookProgress, ReaderMargin, ReaderSettings, ReaderTextAlign, ReaderTheme } from "../types";
import { getReaderHtml, THEME_PALETTES } from "../reader/readerHtml";
import { getPdfReaderHtml } from "../reader/pdfHtml";

type Props = NativeStackScreenProps<RootStackParamList, "BookReader">;

type TocItem = {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
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

  // HTML source for WebView
  const htmlSource = useMemo(() => {
    if (!decryptedUri) return null;
    if (book?.type === "pdf") {
      return getPdfReaderHtml(
        decryptedUri,
        false,
        book.progress.pdfPage || 1,
        readerSettings.theme
      );
    }
    return getReaderHtml(
      decryptedUri,
      false,
      book?.progress.epubCfi ?? null,
      readerSettings,
      cachedLocations
    );
  }, [
    decryptedUri,
    book?.type,
    book?.progress.pdfPage,
    book?.progress.epubCfi,
    readerSettings,
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
          <ActivityIndicator size="large" color={colors.primary} />
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
            style={[styles.sheetContainer, { backgroundColor: theme.bg }]}
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
                  return (
                    <Pressable
                      key={item.id || item.href || String(index)}
                      onPress={() => handleSelectChapter(item.href)}
                      style={[styles.tocRow, isCurrent && { backgroundColor: colors.primarySoft }]}
                    >
                      <Text
                        style={[
                          styles.tocLabel,
                          { color: isCurrent ? colors.primary : theme.text },
                          isCurrent && { fontFamily: fonts.semibold },
                        ]}
                        numberOfLines={2}
                      >
                        {item.label ? item.label.trim() : `Chapter ${index + 1}`}
                      </Text>
                      {isCurrent && <Feather name="check" size={16} color={colors.primary} />}
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
            style={[styles.sheetContainer, { backgroundColor: theme.headerBg }]}
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
                        { backgroundColor: pal.bg, borderColor: active ? colors.primary : pal.border },
                        active && styles.themeButtonActive,
                      ]}
                    >
                      <Text style={[styles.themeButtonText, { color: pal.text }]}>
                        {t === "light" ? "Light" : t === "sepia" ? "Sepia" : t === "dark" ? "Dark" : "Black"}
                      </Text>
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
                      return (
                        <Pressable
                          key={f.value}
                          onPress={() => handleUpdateSettings({ fontFamily: f.value })}
                          style={[
                            styles.chipOption,
                            { backgroundColor: active ? colors.primary : theme.bg, borderColor: theme.border },
                          ]}
                        >
                          <Text style={[styles.chipOptionText, { color: active ? colors.onPrimary : theme.text }]}>
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
                      return (
                        <Pressable
                          key={m}
                          onPress={() => handleUpdateSettings({ margin: m })}
                          style={[
                            styles.chipOption,
                            { backgroundColor: active ? colors.primary : theme.bg, borderColor: theme.border },
                          ]}
                        >
                          <Text style={[styles.chipOptionText, { color: active ? colors.onPrimary : theme.text }]}>
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
                      return (
                        <Pressable
                          key={a}
                          onPress={() => handleUpdateSettings({ textAlign: a })}
                          style={[
                            styles.chipOption,
                            { backgroundColor: active ? colors.primary : theme.bg, borderColor: theme.border },
                          ]}
                        >
                          <Text style={[styles.chipOptionText, { color: active ? colors.onPrimary : theme.text }]}>
                            {a === "left" ? "Left Align" : "Justify"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <View style={[styles.pdfNoteBox, { backgroundColor: theme.headerBg, borderColor: theme.border }]}>
                  <Feather name="info" size={15} color={colors.primary} />
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
                  style={[styles.chipOption, { backgroundColor: theme.bg, borderColor: theme.border }]}
                >
                  <Feather name="moon" size={14} color={theme.text} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipOptionText, { color: theme.text }]}>Low</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setBrightnessVal(0.6);
                    handleUpdateSettings({ brightness: 0.6 });
                  }}
                  style={[styles.chipOption, { backgroundColor: theme.bg, borderColor: theme.border }]}
                >
                  <Feather name="sun" size={14} color={theme.text} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipOptionText, { color: theme.text }]}>Mid</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setBrightnessVal(null);
                    handleUpdateSettings({ brightness: null });
                  }}
                  style={[
                    styles.chipOption,
                    {
                      backgroundColor: brightnessVal === null ? colors.primary : theme.bg,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipOptionText, { color: brightnessVal === null ? colors.onPrimary : theme.text }]}>
                    System
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
});

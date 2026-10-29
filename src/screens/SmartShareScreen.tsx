import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as FileSystem from "expo-file-system/legacy";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { VaultFile, Note } from "../types";
import { colors, fonts, radius } from "../theme";
import { ScreenHeader } from "../components/ui";
import { formatBytes } from "../utils";
import {
  ShareableItem,
  createShareSession,
  warmShareKeys,
  PayloadTooLargeError,
} from "../sharing/sharing";
import { compressDocument } from "../compress/compressor";
import { base64ToBytes } from "../scan/base64";

const TTL_OPTIONS = [
  { label: "5 min", sec: 300 },
  { label: "15 min", sec: 900 },
  { label: "1 hour", sec: 3600 },
];

const RELAY_MAX_RAW_BYTES = 3.5 * 1024 * 1024; // 3.5 MB uncompressed raw limit before base64 blowup

export default function SmartShareScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "SmartShare">) {
  const vault = useVault();
  const { files, folders, notes, getDecryptedUri } = vault;
  const insets = useSafeAreaInsets();

  const preselected = route.params?.preselectedFileIds;
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    () => new Set(preselected ?? [])
  );
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [ttlSec, setTtlSec] = useState(300);
  const [tab, setTab] = useState<"files" | "notes">("files");
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");

  // Warm up PBKDF2 keys in the background as soon as screen mounts
  useEffect(() => {
    warmShareKeys();
  }, []);

  const totalSelected = selectedFiles.size + selectedNotes.size;

  const toggleFile = useCallback((id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleNote = useCallback((id: string) => {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Public notes only — never share secret (password) notes
  const publicNotes = useMemo(() => notes.filter((n) => !n.isSecret), [notes]);

  // Calculate selected total bytes
  const selectedTotalBytes = useMemo(() => {
    let bytes = 0;
    for (const f of files) {
      if (selectedFiles.has(f.id)) bytes += f.size || 0;
    }
    for (const n of publicNotes) {
      if (selectedNotes.has(n.id)) bytes += (n.content?.length || 0) + (n.title?.length || 0);
    }
    return bytes;
  }, [files, selectedFiles, publicNotes, selectedNotes]);

  const isOversized = selectedTotalBytes > RELAY_MAX_RAW_BYTES;

  const toggleSelectAll = useCallback(() => {
    if (tab === "files") {
      if (selectedFiles.size === files.length) {
        setSelectedFiles(new Set());
      } else {
        setSelectedFiles(new Set(files.map((f) => f.id)));
      }
    } else {
      if (selectedNotes.size === publicNotes.length) {
        setSelectedNotes(new Set());
      } else {
        setSelectedNotes(new Set(publicNotes.map((n) => n.id)));
      }
    }
  }, [tab, selectedFiles.size, files, selectedNotes.size, publicNotes]);

  async function handleDirectShare() {
    const chosenFiles = files.filter((f) => selectedFiles.has(f.id));
    if (chosenFiles.length === 0) {
      Alert.alert("No files selected", "Please select at least one file to share.");
      return;
    }
    try {
      if (chosenFiles.length === 1) {
        await vault.shareFile(chosenFiles[0]);
      } else {
        await vault.shareFilesZip(chosenFiles);
      }
    } catch (e) {
      Alert.alert("Direct Share failed", e instanceof Error ? e.message : "Could not open share sheet.");
    }
  }

  async function handleSmartCompressAndShare() {
    if (totalSelected === 0) return;
    setLoading(true);
    setProgressMsg("Preparing documents for Smart Compress...");
    try {
      const chosenFiles = files.filter((f) => selectedFiles.has(f.id));
      const chosenNotes = publicNotes.filter((n) => selectedNotes.has(n.id));
      const items: ShareableItem[] = [];

      // Budget per file targeting ~2 MB total so it fits comfortably within the relay limit
      const perFileBudget = Math.max(
        60 * 1024,
        Math.floor((2.0 * 1024 * 1024) / Math.max(1, chosenFiles.length))
      );

      for (let i = 0; i < chosenFiles.length; i++) {
        const f = chosenFiles[i];
        const isCompressible =
          f.mime === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf") ||
          f.mime.startsWith("image/") ||
          /\.(jpe?g|png|webp|heic)$/i.test(f.name);

        if (isCompressible && f.size > perFileBudget) {
          setProgressMsg(`Optimizing ${i + 1}/${chosenFiles.length}: ${f.name}...`);
          try {
            const decUri = await getDecryptedUri(f);
            const comp = await compressDocument(decUri, f.mime, perFileBudget);
            const compB64 = await FileSystem.readAsStringAsync(comp.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            items.push({
              kind: "file",
              file: f,
              customBytes: base64ToBytes(compB64),
              customName: f.name,
              customMime: f.mime,
            });
            await FileSystem.deleteAsync(comp.uri, { idempotent: true }).catch(() => undefined);
            continue;
          } catch {
            // Keep original if compression failed
          }
        }
        items.push({ kind: "file", file: f });
      }

      for (const note of chosenNotes) {
        items.push({ kind: "note", note });
      }

      setProgressMsg("Securing and uploading to relay...");
      const session = await createShareSession(items, ttlSec, (_stage, _pct, msg) => {
        setProgressMsg(msg);
      });

      navigation.replace("ShareQR", {
        url: session.url,
        expiresAt: session.expiresAt,
        token: session.token,
        itemCount: items.length,
        code: session.code,
        words: session.words,
      });
    } catch (e) {
      Alert.alert(
        "Couldn't create share link",
        e instanceof Error ? e.message : "Please check your connection and try again."
      );
    } finally {
      setLoading(false);
      setProgressMsg("");
    }
  }

  async function handleShare() {
    if (totalSelected === 0) {
      Alert.alert("Nothing selected", "Pick at least one file or note to share.");
      return;
    }

    if (isOversized) {
      Alert.alert(
        "Files Exceed Web QR Limit",
        `Selected files total ${formatBytes(selectedTotalBytes)}, exceeding the 4 MB web relay limit.\n\nChoose an option:`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "📲 Direct Share (Quick Share)", onPress: handleDirectShare },
          { text: "⚡ Smart Compress & Share QR", onPress: handleSmartCompressAndShare },
        ]
      );
      return;
    }

    setLoading(true);
    setProgressMsg("Securing files...");
    try {
      const items: ShareableItem[] = [
        ...files
          .filter((f) => selectedFiles.has(f.id))
          .map((file): ShareableItem => ({ kind: "file", file })),
        ...publicNotes
          .filter((n) => selectedNotes.has(n.id))
          .map((note): ShareableItem => ({ kind: "note", note })),
      ];

      const session = await createShareSession(items, ttlSec, (_stage, _pct, msg) => {
        setProgressMsg(msg);
      });

      navigation.replace("ShareQR", {
        url: session.url,
        expiresAt: session.expiresAt,
        token: session.token,
        itemCount: items.length,
        code: session.code,
        words: session.words,
      });
    } catch (e) {
      if (e instanceof PayloadTooLargeError) {
        Alert.alert(
          "Files Too Large for Web Relay",
          `${e.message}\n\nWould you like to Smart Compress them to ~2 MB for instant QR sharing, or send original files via Quick Share?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "📲 Direct Share", onPress: handleDirectShare },
            { text: "⚡ Smart Compress", onPress: handleSmartCompressAndShare },
          ]
        );
      } else {
        Alert.alert(
          "Couldn't create share link",
          e instanceof Error ? e.message : "Please check your connection and try again."
        );
      }
    } finally {
      setLoading(false);
      setProgressMsg("");
    }
  }

  function renderFileItem({ item }: { item: VaultFile }) {
    const checked = selectedFiles.has(item.id);
    const folder = folders.find((f) => f.id === item.folderId);
    return (
      <Pressable
        onPress={() => toggleFile(item.id)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.check, checked && styles.checkOn]}>
          {checked && <Feather name="check" size={14} color={colors.onPrimary} />}
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {folder?.name ?? "Root"} · {formatBytes(item.size)}
          </Text>
        </View>
        <Feather name="file" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  function renderNoteItem({ item }: { item: Note }) {
    const checked = selectedNotes.has(item.id);
    return (
      <Pressable
        onPress={() => toggleNote(item.id)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.check, checked && styles.checkOn]}>
          {checked && <Feather name="check" size={14} color={colors.onPrimary} />}
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.title || "Untitled Note"}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.content?.slice(0, 60) || "No content"}
          </Text>
        </View>
        <Feather name="file-text" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  const isAllCurrentTabSelected =
    tab === "files"
      ? files.length > 0 && selectedFiles.size === files.length
      : publicNotes.length > 0 && selectedNotes.size === publicNotes.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Send to PC / Device"
        subtitle="End-to-end encrypted · zero setup"
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={toggleSelectAll}
            hitSlop={8}
            style={styles.selectAllBtn}
          >
            <Text style={styles.selectAllText}>
              {isAllCurrentTabSelected ? "Deselect All" : "Select All"}
            </Text>
          </Pressable>
        }
      />

      {/* Tab bar */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "files" && styles.tabActive]}
          onPress={() => setTab("files")}
        >
          <Feather
            name="folder"
            size={15}
            color={tab === "files" ? colors.primary : colors.muted}
          />
          <Text style={[styles.tabText, tab === "files" && styles.tabTextActive]}>
            Files ({files.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "notes" && styles.tabActive]}
          onPress={() => setTab("notes")}
        >
          <Feather
            name="file-text"
            size={15}
            color={tab === "notes" ? colors.primary : colors.muted}
          />
          <Text style={[styles.tabText, tab === "notes" && styles.tabTextActive]}>
            Notes ({publicNotes.length})
          </Text>
        </Pressable>
      </View>

      {/* List */}
      {tab === "files" ? (
        <FlatList
          data={files}
          keyExtractor={(f) => f.id}
          renderItem={renderFileItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No files in your vault yet.</Text>
          }
        />
      ) : (
        <FlatList
          data={publicNotes}
          keyExtractor={(n) => n.id}
          renderItem={renderNoteItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No shareable notes. Secret notes are excluded.</Text>
          }
        />
      )}

      {/* Footer: Oversize warning + TTL + Share buttons */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {/* If files exceed 3.5MB, display Smart-Compress / Direct-Share assistant */}
        {isOversized && (
          <View style={styles.oversizeCard}>
            <View style={styles.oversizeHeader}>
              <Feather name="zap" size={16} color="#D97706" />
              <Text style={styles.oversizeTitle}>
                Large Transfer: {formatBytes(selectedTotalBytes)} (Max 4 MB for Web QR)
              </Text>
            </View>
            <Text style={styles.oversizeSub}>
              Web QR relay supports up to 4 MB. Smart Compress to ~2 MB for instant QR, or send original full-size files directly via Quick Share / Wi-Fi Direct.
            </Text>
            <View style={styles.oversizeBtns}>
              <Pressable
                onPress={handleSmartCompressAndShare}
                disabled={loading}
                style={({ pressed }) => [
                  styles.compressBtn,
                  pressed && { opacity: 0.8 },
                  loading && { opacity: 0.5 },
                ]}
              >
                <Feather name="minimize-2" size={14} color="#B45309" />
                <Text style={styles.compressBtnText}>⚡ Smart Compress & QR</Text>
              </Pressable>
              <Pressable
                onPress={handleDirectShare}
                disabled={loading}
                style={({ pressed }) => [
                  styles.directBtn,
                  pressed && { opacity: 0.8 },
                  loading && { opacity: 0.5 },
                ]}
              >
                <Feather name="share" size={14} color={colors.primary} />
                <Text style={styles.directBtnText}>📲 Direct Quick Share</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* TTL picker */}
        <View style={styles.ttlRow}>
          <Text style={styles.ttlLabel}>Link expires in</Text>
          <View style={styles.ttlOptions}>
            {TTL_OPTIONS.map((opt) => (
              <Pressable
                key={opt.sec}
                style={[styles.ttlChip, ttlSec === opt.sec && styles.ttlChipOn]}
                onPress={() => setTtlSec(opt.sec)}
              >
                <Text
                  style={[styles.ttlChipText, ttlSec === opt.sec && styles.ttlChipTextOn]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Security badge / Live progress status */}
        {loading ? (
          <View style={styles.progressBadge}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressText}>{progressMsg || "Securing files..."}</Text>
          </View>
        ) : (
          <View style={styles.secBadge}>
            <Feather name="shield" size={13} color={colors.accent} />
            <Text style={styles.secText}>
              End-to-end encrypted with AES-256-GCM. Decryption key stays on this device.
            </Text>
          </View>
        )}

        {/* Share button */}
        <Pressable
          onPress={handleShare}
          disabled={loading || totalSelected === 0}
          style={({ pressed }) => [
            styles.shareBtn,
            (loading || totalSelected === 0) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Feather name="maximize" size={18} color={colors.onPrimary} />
              <Text style={styles.shareBtnText}>
                {totalSelected === 0
                  ? "Select items to share"
                  : `Generate QR · ${totalSelected} item${totalSelected !== 1 ? "s" : ""} (${formatBytes(selectedTotalBytes)})`}
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
    paddingVertical: 5,
  },
  selectAllText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primary,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
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
  },
  rowName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  sep: {
    height: 8,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginTop: 40,
  },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: 16,
    gap: 12,
  },
  oversizeCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    gap: 8,
  },
  oversizeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  oversizeTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: "#92400E",
  },
  oversizeSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#78350F",
    lineHeight: 16,
  },
  oversizeBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  compressBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  compressBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: "#92400E",
  },
  directBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  directBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
  ttlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  ttlLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  ttlOptions: {
    flexDirection: "row",
    gap: 6,
  },
  ttlChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ttlChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLine,
  },
  ttlChipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  ttlChipTextOn: {
    color: colors.primary,
  },
  progressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  progressText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primary,
    flex: 1,
  },
  secBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E6F4EA",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accent,
    flex: 1,
  },
  shareBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.onPrimary,
  },
});

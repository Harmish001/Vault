import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { VaultFile, Note } from "../types";
import { colors, fonts, radius } from "../theme";
import { ScreenHeader } from "../components/ui";
import { formatBytes } from "../utils";
import { ShareableItem, createShareSession } from "../sharing/sharing";

const TTL_OPTIONS = [
  { label: "5 min", sec: 300 },
  { label: "15 min", sec: 900 },
  { label: "1 hour", sec: 3600 },
];

export default function SmartShareScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "SmartShare">) {
  const { files, folders, notes } = useVault();
  const insets = useSafeAreaInsets();

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [ttlSec, setTtlSec] = useState(300);
  const [tab, setTab] = useState<"files" | "notes">("files");
  const [loading, setLoading] = useState(false);

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

  async function handleShare() {
    if (totalSelected === 0) {
      Alert.alert("Nothing selected", "Pick at least one file or note to share.");
      return;
    }
    setLoading(true);
    try {
      const items: ShareableItem[] = [
        ...files
          .filter((f) => selectedFiles.has(f.id))
          .map((file): ShareableItem => ({ kind: "file", file })),
        ...publicNotes
          .filter((n) => selectedNotes.has(n.id))
          .map((note): ShareableItem => ({ kind: "note", note })),
      ];

      const session = await createShareSession(items, ttlSec);
      navigation.replace("ShareQR", {
        url: session.url,
        expiresAt: session.expiresAt,
        token: session.token,
        itemCount: items.length,
      });
    } catch (e) {
      Alert.alert(
        "Couldn't create share link",
        e instanceof Error ? e.message : "Please check your connection and try again."
      );
    } finally {
      setLoading(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Smart Share"
        subtitle="Share via QR code — works anywhere"
        onBack={() => navigation.goBack()}
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

      {/* Footer: TTL + Share button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
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

        {/* Security note */}
        <View style={styles.secBadge}>
          <Feather name="lock" size={13} color={colors.accent} />
          <Text style={styles.secText}>
            End-to-end encrypted. Decryption key never leaves your device.
          </Text>
        </View>

        {/* Share button */}
        <Pressable
          onPress={handleShare}
          disabled={loading}
          style={({ pressed }) => [
            styles.shareBtn,
            loading && { opacity: 0.6 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Feather name="share-2" size={18} color={colors.onPrimary} />
              <Text style={styles.shareBtnText}>
                {totalSelected === 0
                  ? "Select items to share"
                  : `Generate QR · ${totalSelected} item${totalSelected !== 1 ? "s" : ""}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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

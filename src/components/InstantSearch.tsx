/**
 * Instant Search: Global search overlay accessible from anywhere.
 * Shows files, notes, folders with inline copy for field values.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
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
import { colors, fonts, radius } from "../theme";
import { useVault } from "../storage/vault";
import { fileSearchText, folderPath, maskValue } from "../utils";
import { FileThumb } from "./Rows";
import { useQuickCopy } from "../hooks/useQuickCopy";

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenFile: (fileId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onOpenNote: (noteId: string) => void;
};

export default function InstantSearch({
  visible,
  onClose,
  onOpenFile,
  onOpenFolder,
  onOpenNote,
}: Props) {
  const insets = useSafeAreaInsets();
  const { files, folders, notes, fileUri } = useVault();
  const { copyValue } = useQuickCopy();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Focus input when modal opens
  const handleShow = () => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q || q.length < 2) return null;

    // Search files with field values
    const matchedFiles = files.filter((f) => {
      const text = fileSearchText(f);
      return text.includes(q);
    });

    // Search folders
    const matchedFolders = folders.filter((f) => f.name.toLowerCase().includes(q));

    // Search notes
    const matchedNotes = notes.filter(
      (n) => n.title.toLowerCase().includes(q) || (!n.isSecret && n.content.toLowerCase().includes(q))
    );

    return {
      files: matchedFiles.slice(0, 8),
      folders: matchedFolders.slice(0, 4),
      notes: matchedNotes.slice(0, 4),
      total: matchedFiles.length + matchedFolders.length + matchedNotes.length,
    };
  }, [q, files, folders, notes]);

  function handleCopyField(label: string, value: string, fileId: string) {
    copyValue(label, value, fileId, "file");
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleShow}
    >
      <View style={[styles.overlay, { paddingTop: insets.top + 40 }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.container}>
          {/* Search input */}
          <View style={styles.searchBox}>
            <Feather name="search" size={20} color={colors.muted} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search documents, numbers, notes..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Feather name="x" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* Results */}
          <ScrollView
            style={styles.results}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {!results && q.length < 2 && (
              <View style={styles.hint}>
                <Feather name="search" size={32} color={colors.line} />
                <Text style={styles.hintText}>Type to search across all documents and notes</Text>
                <Text style={styles.hintSub}>
                  Find Aadhaar, PAN, policy numbers — tap to copy instantly
                </Text>
              </View>
            )}

            {results && results.total === 0 && (
              <View style={styles.hint}>
                <Feather name="file-minus" size={32} color={colors.line} />
                <Text style={styles.hintText}>No results for "{query}"</Text>
              </View>
            )}

            {results && results.files.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Documents ({results.files.length})</Text>
                {results.files.map((f) => (
                  <View key={f.id} style={styles.resultCard}>
                    <Pressable
                      onPress={() => {
                        onClose();
                        onOpenFile(f.id);
                      }}
                      style={styles.resultRow}
                    >
                      <FileThumb name={f.name} mime={f.mime} uri={fileUri(f)} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={styles.resultSub} numberOfLines={1}>
                          {folderPath(folders, f.folderId)}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>

                    {/* Inline copy buttons for fields */}
                    {f.fields && f.fields.length > 0 && (
                      <View style={styles.fieldsRow}>
                        {f.fields.map((field) => (
                          <Pressable
                            key={field.id}
                            onPress={() => handleCopyField(field.label, field.value, f.id)}
                            style={({ pressed }) => [
                              styles.fieldBtn,
                              pressed && { backgroundColor: colors.primary },
                            ]}
                          >
                            {({ pressed }) => (
                              <>
                                <Feather
                                  name="copy"
                                  size={11}
                                  color={pressed ? colors.onPrimary : colors.primary}
                                />
                                <Text
                                  style={[
                                    styles.fieldLabel,
                                    pressed && { color: colors.onPrimary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {field.label}
                                </Text>
                                <Text
                                  style={[
                                    styles.fieldValue,
                                    pressed && { color: colors.onPrimary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {maskValue(field.value)}
                                </Text>
                              </>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {results && results.folders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Folders ({results.folders.length})</Text>
                {results.folders.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => {
                      onClose();
                      onOpenFolder(f.id);
                    }}
                    style={({ pressed }) => [
                      styles.resultRow,
                      styles.resultCard,
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <View
                      style={[styles.folderIcon, { backgroundColor: f.color + "22" }]}
                    >
                      <Feather name="folder" size={18} color={f.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {f.name}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}

            {results && results.notes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes ({results.notes.length})</Text>
                {results.notes.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => {
                      onClose();
                      onOpenNote(n.id);
                    }}
                    style={({ pressed }) => [
                      styles.resultRow,
                      styles.resultCard,
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <View style={styles.noteIcon}>
                      <Feather name={n.isSecret ? "lock" : "edit-3"} size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {n.title || "Untitled Note"}
                      </Text>
                      <Text style={styles.resultSub} numberOfLines={1}>
                        {n.isSecret ? "Secure note" : n.content.slice(0, 50)}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Close button */}
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    maxHeight: "85%",
    marginHorizontal: 12,
    backgroundColor: colors.bg,
    borderRadius: 20,
    overflow: "hidden",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.ink,
    padding: 0,
  },
  results: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  hint: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  hintText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
  },
  hintSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    marginLeft: 4,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 8,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  resultName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  resultSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  fieldsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  fieldBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  fieldValue: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  closeBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.primary,
  },
});

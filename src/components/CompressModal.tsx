import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { VaultFile } from "../types";
import { extOf, formatBytes, kindOf } from "../utils";
import { FileThumb } from "./Rows";
import { Button, IconButton } from "./ui";
import { FolderPicker } from "./FolderPicker";
import {
  COMPRESS_PRESETS,
  CompressPreset,
  CompressResult,
  compressDocument,
} from "../compress/compressor";

export type CompressTarget = {
  uri: string;
  name: string;
  mime: string;
  size?: number;
  vaultFile?: VaultFile;
};

type Props = {
  visible: boolean;
  target: CompressTarget | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function CompressModal({ visible, target, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const vault = useVault();

  const [selectedPreset, setSelectedPreset] = useState<string>("200kb");
  const [customKb, setCustomKb] = useState<string>("");
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [savePicker, setSavePicker] = useState<boolean>(false);
  const [savingAction, setSavingAction] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setSelectedPreset("200kb");
      setIsCustom(false);
      setCustomKb("");
      setCompressing(false);
      setResult(null);
      setSavePicker(false);
      setSavingAction(false);
    }
  }, [visible, target]);

  if (!target) return null;

  const isPdf =
    target.mime === "application/pdf" ||
    target.name.toLowerCase().endsWith(".pdf");
  const isImage = !isPdf && (kindOf(target.mime, target.name) === "image" || target.mime.startsWith("image/"));

  const targetLimitBytes = isCustom
    ? Math.max(10, parseInt(customKb, 10) || 50) * 1024
    : COMPRESS_PRESETS.find((p) => p.id === selectedPreset)?.maxBytes ?? 200 * 1024;

  const currentSize = target.size ?? target.vaultFile?.size ?? 0;

  async function handleCompress() {
    if (!target) return;
    try {
      setCompressing(true);
      const res = await compressDocument(target.uri, target.mime, targetLimitBytes);
      setResult(res);
    } catch (err: any) {
      Alert.alert(
        "Compression failed",
        err?.message || "Could not compress this file under the requested limit. Please try a higher limit."
      );
    } finally {
      setCompressing(false);
    }
  }

  async function handleSaveAsCopy(folderId?: string) {
    if (!target || !result) return;
    try {
      setSavingAction(true);
      const destFolderId = folderId ?? target.vaultFile?.folderId ?? vault.folders[0]?.id;
      if (!destFolderId) {
        Alert.alert("No destination folder", "Please create a folder first.");
        return;
      }

      const dotIdx = target.name.lastIndexOf(".");
      const baseName = dotIdx !== -1 ? target.name.slice(0, dotIdx) : target.name;
      const extension = extOf(target.name) || (isPdf ? ".pdf" : ".jpg");
      const targetLabel = isCustom ? `${Math.round(targetLimitBytes / 1024)}kb` : selectedPreset;
      const newName = `${baseName}_${targetLabel}${extension}`;

      await vault.addFiles(destFolderId, [
        {
          uri: result.uri,
          name: newName,
          mime: target.mime,
          meta: target.vaultFile
            ? {
                fields: target.vaultFile.fields,
                tags: target.vaultFile.tags,
                expiresOn: target.vaultFile.expiresOn,
                notes: target.vaultFile.notes,
              }
            : undefined,
        },
      ]);

      ToastAndroid.show(`Saved as ${newName}`, ToastAndroid.SHORT);
      onSaved?.();
      onClose();
    } catch {
      Alert.alert("Error", "Could not save compressed file.");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleReplaceOriginal() {
    if (!target?.vaultFile || !result) return;
    Alert.alert(
      "Replace original file?",
      `This will overwrite "${target.name}" with the compressed version (${formatBytes(result.size)}). This frees up space and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: async () => {
            try {
              setSavingAction(true);
              const destPath = vault.fileUri(target.vaultFile!);
              await FileSystem.copyAsync({ from: result.uri, to: destPath });
              await vault.updateFile(target.vaultFile!.id, { size: result.size });
              ToastAndroid.show("Original replaced with compressed file", ToastAndroid.SHORT);
              onSaved?.();
              onClose();
            } catch {
              Alert.alert("Error", "Could not replace original file.");
            } finally {
              setSavingAction(false);
            }
          },
        },
      ]
    );
  }

  async function handleShare() {
    if (!result) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Sharing unavailable", "Sharing is not supported on this device.");
        return;
      }
      await Sharing.shareAsync(result.uri, {
        mimeType: isPdf ? "application/pdf" : "image/jpeg",
        dialogTitle: `Share compressed ${target?.name ?? "file"}`,
      });
    } catch {
      Alert.alert("Sharing failed", "Could not share the compressed file.");
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconButton icon="x" label="Close" onPress={onClose} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Compress File Size</Text>
            <Text style={styles.subtitle}>
              {isPdf ? "PDF Document Compressor" : "Photo / Image Compressor"}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* File Card */}
          <View style={styles.fileCard}>
            <FileThumb
              name={target.name}
              mime={target.mime}
              uri={target.uri}
              size={48}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {target.name}
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {isPdf ? "PDF" : "IMAGE"}
                  </Text>
                </View>
                {currentSize > 0 ? (
                  <Text style={styles.fileSizeText}>
                    Original: {formatBytes(currentSize)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Result Banner if already compressed */}
          {result ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={styles.checkCircle}>
                  <Feather name="check" size={20} color={colors.surface} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>Compressed Successfully</Text>
                  <Text style={styles.resultSubtitle}>
                    Meets portal limit (under {formatBytes(targetLimitBytes)})
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Original</Text>
                  <Text style={styles.statValue}>
                    {formatBytes(result.originalSize || currentSize)}
                  </Text>
                </View>

                <Feather name="arrow-right" size={18} color={colors.muted} />

                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Compressed</Text>
                  <Text style={[styles.statValue, { color: colors.accent }]}>
                    {formatBytes(result.size)}
                  </Text>
                </View>

                {result.reductionPercent > 0 ? (
                  <View style={styles.reductionBadge}>
                    <Text style={styles.reductionBadgeText}>
                      -{result.reductionPercent}%
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.resultActions}>
                {target.vaultFile ? (
                  <>
                    <Button
                      label="Save as Copy"
                      onPress={() => handleSaveAsCopy()}
                      loading={savingAction}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Replace Original"
                      kind="secondary"
                      onPress={handleReplaceOriginal}
                      disabled={savingAction}
                      style={{ flex: 1 }}
                    />
                  </>
                ) : (
                  <Button
                    label="Save to Vault"
                    onPress={() => setSavePicker(true)}
                    loading={savingAction}
                    style={{ flex: 1 }}
                  />
                )}
                <Pressable
                  onPress={handleShare}
                  style={styles.shareBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Share compressed file"
                >
                  <Feather name="share-2" size={20} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Preset Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Target Maximum Size</Text>
            <Text style={styles.sectionSubtitle}>
              Official platforms strictly reject uploads exceeding these caps.
            </Text>

            <View style={styles.presetsList}>
              {COMPRESS_PRESETS.map((preset: CompressPreset) => {
                const active = !isCustom && selectedPreset === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      setIsCustom(false);
                      setSelectedPreset(preset.id);
                      setResult(null);
                    }}
                    style={[styles.presetCard, active && styles.presetCardActive]}
                    accessibilityRole="button"
                  >
                    <View style={styles.presetTop}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.radioDot, active && styles.radioDotActive]}>
                          {active ? <View style={styles.radioDotInner} /> : null}
                        </View>
                        <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                          {preset.label}
                        </Text>
                      </View>
                      <View style={[styles.presetBadge, active && styles.presetBadgeActive]}>
                        <Text style={[styles.presetBadgeText, active && styles.presetBadgeTextActive]}>
                          {preset.badge}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.presetDesc}>{preset.description}</Text>
                  </Pressable>
                );
              })}

              {/* Custom Size Option */}
              <Pressable
                onPress={() => {
                  setIsCustom(true);
                  setResult(null);
                }}
                style={[styles.presetCard, isCustom && styles.presetCardActive]}
                accessibilityRole="button"
              >
                <View style={styles.presetTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.radioDot, isCustom && styles.radioDotActive]}>
                      {isCustom ? <View style={styles.radioDotInner} /> : null}
                    </View>
                    <Text style={[styles.presetLabel, isCustom && styles.presetLabelActive]}>
                      Custom Size
                    </Text>
                  </View>
                  <View style={[styles.presetBadge, isCustom && styles.presetBadgeActive]}>
                    <Text style={[styles.presetBadgeText, isCustom && styles.presetBadgeTextActive]}>
                      Exact KB
                    </Text>
                  </View>
                </View>
                <Text style={styles.presetDesc}>
                  Enter an exact KB limit required by your specific portal
                </Text>

                {isCustom ? (
                  <View style={styles.customInputRow}>
                    <TextInput
                      value={customKb}
                      onChangeText={(t) => {
                        setCustomKb(t.replace(/[^0-9]/g, ""));
                        setResult(null);
                      }}
                      placeholder="e.g. 50, 100, 300"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      maxLength={5}
                      style={styles.customInput}
                    />
                    <Text style={styles.customInputUnit}>KB</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* Compress Action Button */}
          <View style={{ marginTop: 12 }}>
            <Button
              label={
                compressing
                  ? "Compressing & optimizing..."
                  : `Compress to under ${
                      isCustom
                        ? `${customKb || "50"} KB`
                        : COMPRESS_PRESETS.find((p) => p.id === selectedPreset)?.label ?? "< 200 KB"
                    }`
              }
              onPress={handleCompress}
              loading={compressing}
              disabled={compressing || (isCustom && !customKb.trim())}
            />
          </View>
        </ScrollView>

        {/* Folder Picker for Saving Raw Files */}
        <FolderPicker
          visible={savePicker}
          title="Save Compressed File To"
          confirmLabel="Save Here"
          onClose={() => setSavePicker(false)}
          onPick={(folderId) => {
            setSavePicker(false);
            handleSaveAsCopy(folderId);
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 10,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  fileName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  typeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  fileSizeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
  },
  sectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  presetsList: {
    gap: 10,
  },
  presetCard: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    gap: 4,
  },
  presetCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + "30",
  },
  presetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDotActive: {
    borderColor: colors.primary,
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  presetLabel: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
  },
  presetLabelActive: {
    color: colors.primary,
  },
  presetBadge: {
    backgroundColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  presetBadgeActive: {
    backgroundColor: colors.primary,
  },
  presetBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  presetBadgeTextActive: {
    color: colors.onPrimary,
  },
  presetDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginLeft: 26,
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginLeft: 26,
    gap: 8,
  },
  customInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    width: 120,
  },
  customInputUnit: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  resultCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
  },
  resultSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accent,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.md,
  },
  statBox: {
    alignItems: "center",
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
  },
  reductionBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reductionBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: colors.onPrimary,
  },
  resultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});

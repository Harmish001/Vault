/**
 * Share Bundles: Create and manage document bundles for one-tap sharing.
 * KYC docs, Rental docs, Insurance claim docs, etc.
 */
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { plural } from "../utils";
import { Button, PromptModal, ScreenHeader, SheetModal } from "../components/ui";
import { useShareBundles } from "../hooks/useShareBundles";
import { FileThumb } from "../components/Rows";

type Props = NativeStackScreenProps<RootStackParamList, "ShareBundles">;

export default function ShareBundlesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { files } = useVault();
  const {
    bundles,
    presets,
    createBundle,
    deleteBundle,
    shareBundle,
    getBundleFiles,
    suggestFilesForPreset,
  } = useShareBundles();

  const [createMode, setCreateMode] = useState(false);
  const [namePrompt, setNamePrompt] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pendingName, setPendingName] = useState("");
  const [pendingDesc, setPendingDesc] = useState("");

  function toggleFile(id: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateBundle(name: string) {
    if (!name.trim()) return;
    await createBundle(name.trim(), pendingDesc, Array.from(selectedFiles));
    ToastAndroid.show(`"${name}" bundle created`, ToastAndroid.SHORT);
    setCreateMode(false);
    setNamePrompt(false);
    setSelectedFiles(new Set());
    setPendingName("");
    setPendingDesc("");
  }

  function startFromPreset(index: number) {
    const preset = presets[index];
    const suggested = suggestFilesForPreset(index);
    setPendingName(preset.name);
    setPendingDesc(preset.description);
    setSelectedFiles(new Set(suggested.map((f) => f.id)));
    setCreateMode(true);
  }

  async function handleShare(bundleId: string) {
    try {
      await shareBundle(bundleId);
    } catch (e) {
      Alert.alert("Share failed", e instanceof Error ? e.message : "Could not share bundle.");
    }
  }

  function handleDelete(bundleId: string, name: string) {
    Alert.alert(`Delete "${name}"?`, "This bundle will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteBundle(bundleId),
      },
    ]);
  }

  if (createMode) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader
          title="Create Bundle"
          onBack={() => {
            setCreateMode(false);
            setSelectedFiles(new Set());
          }}
        />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
          <Text style={styles.label}>Select documents for this bundle</Text>
          <Text style={styles.hint}>
            {pendingName ? `Creating "${pendingName}"` : "Pick files to include"}
          </Text>

          <View style={styles.filesGrid}>
            {files.map((f) => {
              const selected = selectedFiles.has(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => toggleFile(f.id)}
                  style={[styles.fileCard, selected && styles.fileCardSelected]}
                >
                  <FileThumb name={f.name} mime={f.mime} size={36} />
                  <Text style={styles.fileName} numberOfLines={2}>
                    {f.name}
                  </Text>
                  {selected && (
                    <View style={styles.checkBadge}>
                      <Feather name="check" size={12} color={colors.onPrimary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            label={`Continue with ${selectedFiles.size} files`}
            disabled={selectedFiles.size === 0}
            onPress={() => setNamePrompt(true)}
          />
        </View>

        <PromptModal
          visible={namePrompt}
          title="Name this bundle"
          placeholder="e.g. KYC Documents"
          initial={pendingName}
          confirmLabel="Create"
          onCancel={() => setNamePrompt(false)}
          onSubmit={handleCreateBundle}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Share Bundles" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20, gap: 20 }}>
        {/* Existing bundles */}
        {bundles.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Your Bundles</Text>
            <View style={styles.bundlesList}>
              {bundles.map((bundle) => {
                const bundleFiles = getBundleFiles(bundle.id);
                return (
                  <View key={bundle.id} style={styles.bundleCard}>
                    <View style={styles.bundleHeader}>
                      <View style={styles.bundleIconBox}>
                        <Feather name="package" size={20} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bundleName}>{bundle.name}</Text>
                        <Text style={styles.bundleSub}>
                          {plural(bundleFiles.length, "file")}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleDelete(bundle.id, bundle.name)}
                        hitSlop={10}
                        style={{ padding: 4 }}
                      >
                        <Feather name="trash-2" size={18} color={colors.muted} />
                      </Pressable>
                    </View>

                    {/* File thumbnails */}
                    <View style={styles.thumbRow}>
                      {bundleFiles.slice(0, 4).map((f) => (
                        <FileThumb key={f.id} name={f.name} mime={f.mime} size={32} />
                      ))}
                      {bundleFiles.length > 4 && (
                        <View style={styles.moreThumb}>
                          <Text style={styles.moreThumbText}>+{bundleFiles.length - 4}</Text>
                        </View>
                      )}
                    </View>

                    <Pressable
                      onPress={() => handleShare(bundle.id)}
                      style={styles.shareBtn}
                    >
                      <Feather name="share-2" size={16} color={colors.onPrimary} />
                      <Text style={styles.shareBtnText}>Share All</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Quick create from presets */}
        <View>
          <Text style={styles.sectionTitle}>Quick Create</Text>
          <Text style={styles.hint}>
            Start with a template. We'll suggest matching documents.
          </Text>
          <View style={styles.presetsList}>
            {presets.map((preset, i) => (
              <Pressable
                key={preset.name}
                onPress={() => startFromPreset(i)}
                style={({ pressed }) => [
                  styles.presetCard,
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <View style={styles.presetIcon}>
                  <Feather name="file-plus" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetDesc}>{preset.description}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Custom bundle */}
        <Button
          label="Create Custom Bundle"
          kind="secondary"
          onPress={() => {
            setPendingName("");
            setPendingDesc("");
            setSelectedFiles(new Set());
            setCreateMode(true);
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.ink,
    marginBottom: 10,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  filesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  fileCard: {
    width: "30%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  fileCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  fileName: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.ink,
    textAlign: "center",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  bundlesList: {
    gap: 12,
  },
  bundleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  bundleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bundleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bundleName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  bundleSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  thumbRow: {
    flexDirection: "row",
    gap: 8,
  },
  moreThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  moreThumbText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
  },
  shareBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.onPrimary,
  },
  presetsList: {
    gap: 10,
  },
  presetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  presetName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  presetDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});

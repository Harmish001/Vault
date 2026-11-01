import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useVault } from "../storage/vault";
import { colors, folderColors, fonts, radius } from "../theme";
import { Button, SheetModal } from "./ui";

const QUICK_ROLES = ["Me", "Dad", "Mom", "Spouse", "Child"];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FamilySetupModal({ visible, onClose }: Props) {
  const { folders, createFolder } = useVault();
  const [selectedNames, setSelectedNames] = useState<string[]>(["Me", "Dad", "Mom"]);
  const [customInput, setCustomInput] = useState("");
  const [creating, setCreating] = useState(false);

  function addName(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (selectedNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      ToastAndroid.show(`"${name}" is already in the list`, ToastAndroid.SHORT);
      return;
    }
    setSelectedNames((prev) => [...prev, name]);
    setCustomInput("");
  }

  function removeName(name: string) {
    setSelectedNames((prev) => prev.filter((n) => n !== name));
  }

  async function handleCreate() {
    if (!selectedNames.length) {
      onClose();
      return;
    }
    setCreating(true);
    try {
      const existingNames = new Set(folders.filter((f) => f.parentId === null).map((f) => f.name.toLowerCase()));
      let count = 0;
      for (let i = 0; i < selectedNames.length; i++) {
        const name = selectedNames[i];
        if (!existingNames.has(name.toLowerCase())) {
          const color = folderColors[(folders.length + count) % folderColors.length];
          await createFolder(name, null, color);
          count++;
        }
      }
      if (count > 0) {
        ToastAndroid.show(
          `Created ${count} family ${count === 1 ? "folder" : "folders"}`,
          ToastAndroid.SHORT
        );
      } else {
        ToastAndroid.show("Family folders already exist", ToastAndroid.SHORT);
      }
      onClose();
    } catch {
      ToastAndroid.show("Couldn't create some folders", ToastAndroid.SHORT);
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} position="bottom">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Feather name="users" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Set Up Family Folders</Text>
              <Text style={styles.subtitle}>
                Create folders for each family member to keep Aadhaar, PAN, and health records organized.
              </Text>
            </View>
          </View>

          {/* Quick suggestions */}
          <Text style={styles.sectionLabel}>QUICK SUGGESTIONS</Text>
          <View style={styles.chipsRow}>
            {QUICK_ROLES.map((role) => {
              const active = selectedNames.some((n) => n.toLowerCase() === role.toLowerCase());
              return (
                <Pressable
                  key={role}
                  onPress={() => (active ? removeName(role) : addName(role))}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                >
                  <Feather
                    name={active ? "check" : "plus"}
                    size={14}
                    color={active ? colors.onPrimary : colors.primaryDark}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{role}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom input */}
          <View style={styles.inputRow}>
            <TextInput
              value={customInput}
              onChangeText={setCustomInput}
              placeholder="Add by name (e.g. Rahul, Priya)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              onSubmitEditing={() => addName(customInput)}
              returnKeyType="done"
            />
            <Pressable
              onPress={() => addName(customInput)}
              disabled={!customInput.trim()}
              style={[styles.addBtn, !customInput.trim() && { opacity: 0.5 }]}
              accessibilityRole="button"
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          {/* Selected folders list */}
          {selectedNames.length > 0 ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionLabel}>FOLDERS TO CREATE ({selectedNames.length})</Text>
              <ScrollView
                style={{ maxHeight: 130 }}
                contentContainerStyle={styles.selectedGrid}
                showsVerticalScrollIndicator={false}
              >
                {selectedNames.map((name, index) => {
                  const color = folderColors[index % folderColors.length];
                  return (
                    <View key={name} style={styles.nameTag}>
                      <View style={[styles.colorDot, { backgroundColor: color }]} />
                      <Text style={styles.nameTagText} numberOfLines={1}>
                        {name}
                      </Text>
                      <Pressable
                        onPress={() => removeName(name)}
                        hitSlop={6}
                        style={{ marginLeft: 6 }}
                        accessibilityLabel={`Remove ${name}`}
                      >
                        <Feather name="x" size={14} color={colors.muted} />
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={styles.emptyNotice}>Select or add at least one family member above.</Text>
          )}

          {/* Action buttons */}
          <View style={styles.btnRow}>
            <Button
              label={
                selectedNames.length > 0
                  ? `Create ${selectedNames.length} ${selectedNames.length === 1 ? "folder" : "folders"}`
                  : "Skip for now"
              }
              onPress={selectedNames.length > 0 ? handleCreate : onClose}
              loading={creating}
              style={{ flex: 1 }}
            />
            <Button
              label="Skip"
              kind="secondary"
              onPress={onClose}
              disabled={creating}
              style={{ paddingHorizontal: 18 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 18,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },
  addBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  selectedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },
  nameTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
  },
  colorDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },
  nameTagText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    maxWidth: 120,
  },
  emptyNotice: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginVertical: 12,
    textAlign: "center",
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
});

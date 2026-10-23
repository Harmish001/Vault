import React, { useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { VaultFile } from "../types";
import { cleanTag, plural } from "../utils";
import { colors, fonts, radius } from "../theme";
import { FolderPicker } from "./FolderPicker";
import { ActionMenu, IconButton, PromptModal, ScreenHeader } from "./ui";

/**
 * Pick several files (long-press one to start) and move, export, tag or delete them together.
 * While `selecting`, render `header` and `bar` instead of the screen's own, and `element` once.
 */
export function useFileSelection(visible: VaultFile[], currentFolderId?: string) {
  const vault = useVault();
  const { runExternal } = useLock();
  const insets = useSafeAreaInsets();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [move, setMove] = useState(false);
  const [tag, setTag] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  // files deleted or moved away elsewhere drop out of the selection on their own
  const selected = useMemo(() => visible.filter((f) => ids.has(f.id)), [visible, ids]);
  const selecting = selected.length > 0;
  const clear = () => setIds(new Set());

  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clear();
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  const toggle = (id: string) =>
    setIds((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const allSelected = selected.length === visible.length;
  const count = plural(selected.length, "file");
  const tagSuggestions = useMemo(
    () => Array.from(new Set(vault.files.flatMap((f) => f.tags ?? []))).slice(0, 8),
    [vault.files]
  );

  /** fn resolves a toast message, or null when the user backed out (the selection is kept) */
  async function run(label: string, fn: () => Promise<string | null | void>) {
    setBusy(true);
    try {
      const done = await fn();
      if (done === null) return;
      if (done) ToastAndroid.show(done, ToastAndroid.SHORT);
      clear();
    } catch {
      Alert.alert(`Couldn't ${label}`, "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <ScreenHeader
      title={`${selected.length} selected`}
      left={<IconButton icon="x" label="Cancel selection" onPress={clear} />}
      right={
        <IconButton
          icon={allSelected ? "minus-square" : "check-square"}
          label={allSelected ? "Select none" : "Select all"}
          onPress={() => (allSelected ? clear() : setIds(new Set(visible.map((f) => f.id))))}
        />
      }
    />
  );

  const actions: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: "corner-down-right", label: "Move", onPress: () => setMove(true) },
    { icon: "download", label: "Export", onPress: () => setExportMenu(true) },
    { icon: "tag", label: "Tag", onPress: () => setTag(true) },
    {
      icon: "trash-2",
      label: "Delete",
      danger: true,
      onPress: () =>
        Alert.alert(`Delete ${count}?`, "They're removed from DocVault. This can't be undone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => run("delete these files", async () => {
              await vault.deleteFiles(selected.map((f) => f.id));
              return `Deleted ${count}`;
            }),
          },
        ]),
    },
  ];

  const bar = (
    <View style={[styles.bar, { bottom: insets.bottom + 16 }]}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${a.label} ${count}`}
          style={({ pressed }) => [styles.barBtn, (pressed || busy) && { opacity: 0.6 }]}
        >
          <Feather name={a.icon} size={20} color={a.danger ? colors.danger : colors.primary} />
          <Text style={[styles.barLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const element = (
    <>
      <FolderPicker
        visible={move}
        title={`Move ${count} to`}
        confirmLabel="Move to"
        disabledFolderId={currentFolderId}
        onClose={() => setMove(false)}
        onPick={(folderId) => {
          setMove(false);
          run("move these files", async () => {
            await vault.moveFiles(selected.map((f) => f.id), folderId);
            return `Moved ${count}`;
          });
        }}
      />
      <PromptModal
        visible={tag}
        title={`Tag ${count}`}
        placeholder="e.g. tax, 2026, medical"
        hint="Separate tags with commas. Existing tags stay."
        suggestions={tagSuggestions}
        confirmLabel="Add tags"
        onCancel={() => setTag(false)}
        onSubmit={(raw) => {
          setTag(false);
          const tags = raw.split(",").map(cleanTag).filter(Boolean);
          if (!tags.length) return;
          run("tag these files", async () => {
            await vault.addTags(selected.map((f) => f.id), tags);
            return `Tagged ${count}`;
          });
        }}
      />
      <ActionMenu
        visible={exportMenu}
        title={`Export ${count}`}
        onClose={() => setExportMenu(false)}
        items={[
          {
            label: "Save copies to a folder on this phone",
            icon: "folder",
            onPress: () =>
              run("export these files", async () => {
                const n = await runExternal(() => vault.exportFiles(selected));
                return n ? `Saved ${plural(n, "file")}` : null;
              }),
          },
          ...(selected.length === 1
            ? [{ label: "Share", icon: "share-2" as const, onPress: () => run("share this file", () => vault.shareFile(selected[0])) }]
            : vault.canZip
              ? [{ label: "Share as one zip file", icon: "share-2" as const, onPress: () => run("share these files", () => vault.shareFilesZip(selected)) }]
              : []),
        ]}
      />
    </>
  );

  return { selecting, isSelected: (id: string) => ids.has(id), toggle, header, bar, element };
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: 6,
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  barBtn: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 8 },
  barLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
});

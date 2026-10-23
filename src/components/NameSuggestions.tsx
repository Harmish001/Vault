import React, { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { ocrSupported, readPageText } from "../ocr/read";
import { cleanFileName, personFor, suggestNameFromText } from "../ocr/name";
import { VaultFile } from "../types";
import { colors, fonts, radius } from "../theme";
import { extOf, kindOf, uniqueName } from "../utils";
import { FileThumb } from "./Rows";
import { Button, PromptModal, SheetModal } from "./ui";

type Item = { file: VaultFile; name: string; on: boolean };

const MAX_READ = 10;
const baseName = (n: string) => n.slice(0, n.length - extOf(n).length);

/**
 * After files are imported, reads the photos on the phone and offers better names to approve.
 * PDFs and other types are skipped: the on-phone text reader only handles images.
 * Render `element` once in the screen.
 */
export function useNameSuggestions() {
  const { folders, files, fileUri, renameFile } = useVault();
  const { settings } = useSettings();
  const [items, setItems] = useState<Item[] | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const done = useRef<(() => void) | undefined>(undefined);

  function finish() {
    setItems(null);
    const cb = done.current;
    done.current = undefined;
    cb?.();
  }

  /** Resolves once reading is finished; `onDone` runs after the person has answered (or right away if there's nothing to suggest). */
  async function review(added: VaultFile[], onDone?: () => void) {
    done.current = onDone;
    const images = added.filter((f) => kindOf(f.mime, f.name) === "image").slice(0, MAX_READ);
    if (!settings.ocrEnabled || !ocrSupported || !images.length) return finish();
    const out: Item[] = [];
    for (const f of images) {
      const s = suggestNameFromText(await readPageText(fileUri(f)), personFor(folders, f.folderId));
      const name = s ? cleanFileName(s) : "";
      if (name && name.toLowerCase() !== baseName(f.name).toLowerCase()) out.push({ file: f, name, on: true });
    }
    if (out.length) setItems(out);
    else finish();
  }

  async function apply() {
    const chosen = (items ?? []).filter((it) => it.on && it.name.trim());
    const taken = new Map<string, string[]>();
    for (const it of chosen) {
      const siblings =
        taken.get(it.file.folderId) ?? files.filter((f) => f.folderId === it.file.folderId && f.id !== it.file.id).map((f) => f.name);
      const name = uniqueName(siblings, cleanFileName(it.name) + extOf(it.file.name));
      siblings.push(name);
      taken.set(it.file.folderId, siblings);
      await renameFile(it.file.id, name).catch(() => undefined);
    }
    finish();
  }

  const update = (id: string, patch: Partial<Item>) =>
    setItems((cur) => cur?.map((it) => (it.file.id === id ? { ...it, ...patch } : it)) ?? null);

  const element = (
    <>
      <SheetModal visible={items !== null && editing === null} onClose={finish}>
        <Text style={styles.title}>Suggested names</Text>
        <Text style={styles.body}>Read from the text on your {items && items.length > 1 ? "photos" : "photo"}. Tap a name to change it.</Text>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
          {(items ?? []).map((it) => (
            <View key={it.file.id} style={styles.row}>
              <FileThumb name={it.file.name} mime={it.file.mime} uri={fileUri(it.file)} size={40} />
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => setEditing(it)} accessibilityRole="button" accessibilityLabel={`Suggested name ${it.name}. Tap to change`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.name, !it.on && { color: colors.muted }]} numberOfLines={1}>{it.name}</Text>
                  <Feather name="edit-2" size={13} color={colors.muted} />
                </View>
                <Text style={styles.was} numberOfLines={1}>was {it.file.name}</Text>
              </Pressable>
              <Switch
                value={it.on}
                onValueChange={(on) => update(it.file.id, { on })}
                trackColor={{ true: colors.primary }}
                accessibilityLabel={`Rename to ${it.name}`}
              />
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <Button label="Keep original" kind="secondary" onPress={finish} style={{ flex: 1 }} />
          <Button label="Rename" disabled={!items?.some((it) => it.on)} onPress={apply} style={{ flex: 1 }} />
        </View>
      </SheetModal>
      <PromptModal
        visible={editing !== null}
        title="Name this file"
        initial={editing?.name}
        confirmLabel="Use name"
        onCancel={() => setEditing(null)}
        onSubmit={(v) => {
          if (editing) update(editing.file.id, { name: v.trim(), on: true });
          setEditing(null);
        }}
      />
    </>
  );

  return { review, element };
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink, paddingHorizontal: 4 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: colors.bg },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  was: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
});

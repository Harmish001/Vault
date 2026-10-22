import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import DocumentScanner, { ScanDocumentResponseStatus } from "react-native-document-scanner-plugin";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { colors, fonts, radius } from "../theme";
import { IncomingFile } from "../types";
import { folderPath, plural, uid } from "../utils";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { buildPdf, PdfPage } from "../scan/pdf";
import { SCAN_OUT } from "../scan/paths";
import { FolderPicker } from "../components/FolderPicker";
import { Button, EmptyState, PromptModal, ScreenHeader } from "../components/ui";

type Rot = 0 | 90 | 180 | 270;
type Page = { id: string; uri: string; rotate: Rot };
type Format = "pdf" | "images";

const MAX_PAGES = 30;

function defaultName() {
  const d = new Date();
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `Scan ${date} ${time}`.replace(/[\\/:*?"<>|]/g, ".");
}

const cleanName = (n: string) => n.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

export default function ScanScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Scan">) {
  const { addFiles, folders } = useVault();
  const { runExternal } = useLock();
  const insets = useSafeAreaInsets();

  const [pages, setPages] = useState<Page[]>([]);
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<Format>("pdf");
  const [dest, setDest] = useState<string | null>(route.params?.folderId ?? null);
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const pagesRef = useRef<Page[]>(pages);
  pagesRef.current = pages;
  const started = useRef(false);
  const allowLeave = useRef(false);

  const scan = useCallback(async () => {
    const remaining = MAX_PAGES - pagesRef.current.length;
    if (remaining <= 0) {
      Alert.alert("Page limit reached", `A scan can have up to ${MAX_PAGES} pages. Save this one, then start another.`);
      return;
    }
    setScanning(true);
    try {
      const res = await runExternal(() => DocumentScanner.scanDocument({ maxNumDocuments: remaining }));
      if (res.status === ScanDocumentResponseStatus.Success && res.scannedImages?.length) {
        const added: Page[] = res.scannedImages.map((uri) => ({ id: uid(), uri, rotate: 0 }));
        setPages((p) => [...p, ...added]);
      } else if (pagesRef.current.length === 0) {
        navigation.goBack(); // cancelled before scanning anything
      }
    } catch (e) {
      Alert.alert(
        "The scanner couldn't start",
        "It needs Google Play services on this phone. You can still add photos or PDFs with Add files.\n\n" +
          (e instanceof Error ? e.message : "")
      );
      if (pagesRef.current.length === 0) navigation.goBack();
    } finally {
      setScanning(false);
    }
  }, [navigation, runExternal]);

  // Open the camera straight away: Scan is one tap from a folder.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scan();
  }, [scan]);

  // Don't silently throw away scanned pages.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (allowLeave.current || saving || pagesRef.current.length === 0 || scanning) return;
        e.preventDefault();
        Alert.alert("Discard this scan?", `${plural(pagesRef.current.length, "page")} haven't been saved.`, [
          { text: "Keep scanning", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, saving, scanning]
  );

  const rotate = (i: number) =>
    setPages((p) => p.map((pg, k) => (k === i ? { ...pg, rotate: ((pg.rotate + 90) % 360) as Rot } : pg)));
  const move = (i: number, dir: -1 | 1) =>
    setPages((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setPages((p) => p.filter((_, k) => k !== i));

  async function save() {
    if (!dest) {
      setPicking(true);
      return;
    }
    setSaving(true);
    try {
      await FileSystem.makeDirectoryAsync(SCAN_OUT, { intermediates: true });
      const base = cleanName(name) || cleanName(defaultName());
      const incoming: IncomingFile[] = [];

      if (format === "pdf") {
        const built: PdfPage[] = [];
        for (const p of pages) {
          const b64 = await FileSystem.readAsStringAsync(p.uri, { encoding: FileSystem.EncodingType.Base64 });
          built.push({ jpeg: base64ToBytes(b64), rotate: p.rotate });
        }
        const out = SCAN_OUT + uid() + ".pdf";
        await FileSystem.writeAsStringAsync(out, bytesToBase64(buildPdf(built)), { encoding: FileSystem.EncodingType.Base64 });
        incoming.push({ uri: out, name: base + ".pdf", mime: "application/pdf" });
      } else {
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i];
          let uri = p.uri;
          if (p.rotate) {
            const r = await manipulateAsync(p.uri, [{ rotate: p.rotate }], { compress: 0.95, format: SaveFormat.JPEG });
            uri = r.uri;
          }
          incoming.push({ uri, name: pages.length > 1 ? `${base} ${i + 1}.jpg` : `${base}.jpg`, mime: "image/jpeg" });
        }
      }

      const out = await addFiles(dest, incoming);
      if (out.added === 0) throw new Error("nothing saved");
      await Promise.all(pages.map((p) => FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => undefined)));

      allowLeave.current = true;
      navigation.reset({ index: 1, routes: [{ name: "Home" }, { name: "Folder", params: { id: dest } }] });
    } catch {
      Alert.alert("Couldn't save the scan", "Your pages are still here. Check that the phone has free space and try again.");
      setSaving(false);
    }
  }

  const label =
    format === "pdf" ? "Save as PDF" : pages.length > 1 ? `Save ${pages.length} images` : "Save image";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Scan"
        subtitle={pages.length ? plural(pages.length, "page") : undefined}
        onBack={() => navigation.goBack()}
      />

      {pages.length === 0 ? (
        <EmptyState
          title={scanning ? "Opening the scanner…" : "No pages yet"}
          body="Point the camera at a document, or import photos from your gallery. DocVault straightens and crops each page for you."
          action={!scanning ? <Button label="Scan pages" onPress={scan} /> : undefined}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.grid}>
            {pages.map((p, i) => (
              <View key={p.id} style={styles.card}>
                <PageThumb uri={p.uri} rotate={p.rotate} />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{i + 1}</Text>
                </View>
                <View style={styles.tools}>
                  <Tool icon="rotate-cw" label="Rotate page" onPress={() => rotate(i)} />
                  <Tool icon="chevron-left" label="Move earlier" onPress={() => move(i, -1)} disabled={i === 0} />
                  <Tool icon="chevron-right" label="Move later" onPress={() => move(i, 1)} disabled={i === pages.length - 1} />
                  <Tool icon="trash-2" label="Delete page" onPress={() => remove(i)} danger />
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.panel, { paddingBottom: insets.bottom + 14 }]}>
            <Row label="Name" value={name} icon="edit-2" onPress={() => setRenaming(true)} />
            <Row label="Folder" value={dest ? folderPath(folders, dest) : "Choose a folder"} icon="folder" onPress={() => setPicking(true)} warn={!dest} />
            <View style={styles.seg}>
              {(["pdf", "images"] as Format[]).map((f) => (
                <Pressable key={f} onPress={() => setFormat(f)} style={[styles.segItem, format === f && styles.segOn]} accessibilityRole="button">
                  <Text style={[styles.segText, format === f && { color: "#fff" }]}>{f === "pdf" ? "One PDF" : "Separate images"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Add pages" kind="secondary" disabled={saving} onPress={scan} style={{ flex: 1 }} />
              <Button label={dest ? label : "Choose folder"} loading={saving} onPress={save} style={{ flex: 1.4 }} />
            </View>
          </View>
        </>
      )}

      <PromptModal
        visible={renaming}
        title="Name this scan"
        initial={name}
        confirmLabel="Save name"
        onCancel={() => setRenaming(false)}
        onSubmit={(v) => {
          setName(v);
          setRenaming(false);
        }}
      />
      <FolderPicker
        visible={picking}
        title="Save scan into"
        confirmLabel="Use"
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setDest(id);
          setPicking(false);
        }}
      />
    </View>
  );
}

/** Page preview that shows the rotation you've chosen without touching the file. */
function PageThumb({ uri, rotate }: { uri: string; rotate: Rot }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const sideways = rotate === 90 || rotate === 270;
  const w = sideways ? box.h : box.w;
  const h = sideways ? box.w : box.h;
  return (
    <View style={styles.thumb} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={{
            position: "absolute",
            width: w,
            height: h,
            left: (box.w - w) / 2,
            top: (box.h - h) / 2,
            transform: [{ rotate: `${rotate}deg` }],
          }}
        />
      ) : null}
    </View>
  );
}

function Tool(props: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={4}
      style={[styles.tool, props.disabled && { opacity: 0.3 }]}
    >
      <Feather name={props.icon} size={18} color={props.danger ? colors.danger : colors.ink} />
    </Pressable>
  );
}

function Row(props: { label: string; value: string; icon: React.ComponentProps<typeof Feather>["name"]; onPress: () => void; warn?: boolean }) {
  return (
    <Pressable onPress={props.onPress} style={styles.row} accessibilityRole="button">
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text style={[styles.rowValue, props.warn && { color: colors.danger }]} numberOfLines={1}>{props.value}</Text>
      <Feather name={props.icon} size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, paddingBottom: 24 },
  card: { width: "47.5%", backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, gap: 8 },
  thumb: { aspectRatio: 3 / 4, backgroundColor: "#E8EBF5", borderRadius: 8, overflow: "hidden" },
  badge: {
    position: "absolute",
    top: 14,
    left: 14,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13, color: "#fff" },
  tools: { flexDirection: "row", justifyContent: "space-between" },
  tool: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 16,
    gap: 10,
    elevation: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, width: 56 },
  rowValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  seg: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  segOn: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});

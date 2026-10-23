import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as FileSystem from "expo-file-system/legacy";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { useSettings } from "../storage/settings";
import { DOC_LABEL, DOC_TAG, DetectedField, DocType, Detection, detectDetails } from "../ocr/parse";
import { personFor, suggestName } from "../ocr/name";
import { ocrSupported, readPageText } from "../ocr/read";
import { requestReminderPermission } from "../reminders";
import { colors, fonts, radius } from "../theme";
import { IncomingFile } from "../types";
import { folderPath, formatDate, parseISODate, plural, toISODate, uid } from "../utils";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { buildPdf, PdfPage } from "../scan/pdf";
import { SCAN_OUT } from "../scan/paths";
import { FolderPicker } from "../components/FolderPicker";
import { Button, EmptyState, PromptModal, ScreenHeader } from "../components/ui";
import { parseBill, BillParseResult } from "../capture/parseBill";

// Safe dynamic import to allow running in Expo Go without crashing
let DocumentScanner: { scanDocument: (options?: { maxNumDocuments?: number }) => Promise<{ status?: string; scannedImages?: string[] }> } | null = null;
const ScanDocumentResponseStatus = {
  Success: "success",
  Cancel: "cancel",
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const plugin = require("react-native-document-scanner-plugin");
  DocumentScanner = plugin.default ?? plugin;
} catch {
  DocumentScanner = null;
}

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
  const { addFiles, folders, createReminder } = useVault();
  const { runExternal } = useLock();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  const [pages, setPages] = useState<Page[]>([]);
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<Format>("pdf");
  const [dest, setDest] = useState<string | null>(route.params?.folderId ?? null);
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState<"pages" | "details">("pages");
  const [det, setDet] = useState<Detection | null>(null);
  const [billParsed, setBillParsed] = useState<BillParseResult | null>(null);
  const [remindBill, setRemindBill] = useState(false);
  const [editField, setEditField] = useState<DetectedField | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);
  const ocrText = useRef("");
  const nameEdited = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const ocrCache = useRef<Record<string, string>>({});

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

    if (!DocumentScanner) {
      Alert.alert(
        "Scanner unavailable in Expo Go",
        "The camera scanner requires custom native code and Google Play Services, which are only included in a built APK.\n\nWould you like to pick image(s) from your device to test the scan & save workflow?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              if (pagesRef.current.length === 0) navigation.goBack();
            },
          },
          {
            text: "Pick Images",
            onPress: async () => {
              try {
                const res = await runExternal(() =>
                  DocumentPicker.getDocumentAsync({ type: "image/*", multiple: true })
                );
                if (!res.canceled && res.assets?.length) {
                  const added: Page[] = res.assets.slice(0, remaining).map((a) => ({ id: uid(), uri: a.uri, rotate: 0 }));
                  setPages((p) => [...p, ...added]);
                } else if (pagesRef.current.length === 0) {
                  navigation.goBack();
                }
              } catch {
                if (pagesRef.current.length === 0) navigation.goBack();
              }
            },
          },
        ]
      );
      return;
    }

    setScanning(true);
    try {
      const res = await runExternal(() => DocumentScanner!.scanDocument({ maxNumDocuments: remaining }));
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
        if (stageRef.current === "details") {
          setStage("pages");
          return;
        }
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

  async function performSave(meta?: IncomingFile["meta"]) {
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
        incoming.push({ uri: out, name: base + ".pdf", mime: "application/pdf", meta });
      } else {
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i];
          let uri = p.uri;
          if (p.rotate) {
            const r = await manipulateAsync(p.uri, [{ rotate: p.rotate }], { compress: 0.95, format: SaveFormat.JPEG });
            uri = r.uri;
          }
          incoming.push({ uri, name: pages.length > 1 ? `${base} ${i + 1}.jpg` : `${base}.jpg`, mime: "image/jpeg", meta: i === 0 ? meta : undefined });
        }
      }

      const out = await addFiles(dest, incoming);
      if (out.added === 0) throw new Error("nothing saved");
      await Promise.all(pages.map((p) => FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => undefined)));

      // If user enabled the bill reminder (§6.5)
      if (remindBill && billParsed) {
        const savedFileId = out.files?.[0]?.id;
        const due = billParsed.dueOn?.value || toISODate(new Date());
        await createReminder({
          title: billParsed.title?.value || base || "Bill",
          amount: billParsed.amount?.value?.text,
          amountValue: billParsed.amount?.value?.value,
          dueOn: due,
          time: "09:00",
          repeat: billParsed.repeat?.value || "monthly",
          offsets: billParsed.offsets || [1, 0],
          reference: billParsed.reference?.value,
          category: billParsed.category,
          source: "scan",
          fileId: savedFileId,
        });
        ToastAndroid.show(`Reminder added for ${formatDate(parseISODate(due).getTime())}`, ToastAndroid.SHORT);
      }

      allowLeave.current = true;
      navigation.reset({ index: 1, routes: [{ name: "Home" }, { name: "Folder", params: { id: dest } }] });
    } catch {
      Alert.alert("Couldn't save the scan", "Your pages are still here. Check that the phone has free space and try again.");
      setSaving(false);
    }
  }

  /** Reads the pages on the phone and, if numbers or dates are found, shows the review form. */
  async function onSavePress() {
    if (!dest) {
      setPicking(true);
      return;
    }
    if (settings.ocrEnabled && ocrSupported) {
      setReading(true);
      let failed = 0;
      let found: Detection | null = null;
      try {
        const texts: string[] = [];
        for (const p of pages.slice(0, 5)) {
          if (ocrCache.current[p.id] === undefined) {
            try {
              ocrCache.current[p.id] = await readPageText(p.uri);
            } catch {
              failed++;
              ocrCache.current[p.id] = "";
            }
          }
          texts.push(ocrCache.current[p.id]);
        }
        found = detectDetails(texts);
        const bill = parseBill(texts);
        if (bill.isBill) {
          setBillParsed(bill);
        } else {
          setBillParsed(null);
        }
        ocrText.current = texts.join("\n");
        const s = suggestName({ text: ocrText.current, det: found, bill, person: personFor(folders, dest) });
        setSuggested(s ? cleanName(s) : null);
        if (s && !nameEdited.current) setName(cleanName(s));

        if (!found && !bill.isBill && !s) {
          ToastAndroid.show(
            failed ? "Couldn't read text on this phone. Saving the scan as it is." : "No numbers or dates found. Saving the scan as it is.",
            ToastAndroid.LONG
          );
        } else if (!found) {
          found = { docType: "other", fields: [] };
        }
      } finally {
        setReading(false);
      }
      if (found) {
        setDet(found);
        setStage("details");
        return;
      }
    }
    await performSave();
  }

  async function confirmDetails() {
    if (!det) return;
    const fields = det.fields.filter((f) => f.on && f.value.trim()).map((f) => ({ id: uid(), label: f.label, value: f.value.trim() }));
    const tag = DOC_TAG[det.docType];
    if (det.expiresOn && settings.remindersEnabled) await requestReminderPermission().catch(() => false);
    await performSave({ fields, tags: tag ? [tag] : undefined, expiresOn: det.expiresOn });
  }

  const label =
    format === "pdf" ? "Save as PDF" : pages.length > 1 ? `Save ${pages.length} images` : "Save image";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Scan"
        subtitle={pages.length ? plural(pages.length, "page") : undefined}
        onBack={() => (stage === "details" ? setStage("pages") : navigation.goBack())}
      />

      {stage === "details" && det ? (
        <ReviewForm
          det={det}
          name={name}
          suggested={suggested}
          onRename={() => setRenaming(true)}
          onUseSuggested={() => {
            if (suggested) setName(suggested);
            nameEdited.current = false;
          }}
          billParsed={billParsed}
          remindBill={remindBill}
          onToggleRemindBill={setRemindBill}
          saving={saving}
          onToggle={(id) => setDet({ ...det, fields: det.fields.map((f) => (f.id === id ? { ...f, on: !f.on } : f)) })}
          onEdit={(f) => setEditField(f)}
          onType={(t) => {
            const next = { ...det, docType: t };
            setDet(next);
            const s = suggestName({ text: ocrText.current, det: next, bill: billParsed, person: personFor(folders, dest) });
            setSuggested(s ? cleanName(s) : null);
            if (s && !nameEdited.current) setName(cleanName(s));
          }}
          onExpiry={(iso) => setDet({ ...det, expiresOn: iso })}
          onBack={() => setStage("pages")}
          onSave={confirmDetails}
          onSkip={() => performSave()}
        />
      ) : pages.length === 0 ? (
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
                  <Text style={[styles.segText, format === f && { color: colors.onPrimary }]}>{f === "pdf" ? "One PDF" : "Separate images"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Add pages" kind="secondary" disabled={saving} onPress={scan} style={{ flex: 1 }} />
              <Button label={dest ? (reading ? "Reading text…" : label) : "Choose folder"} loading={saving || reading} onPress={onSavePress} style={{ flex: 1.4 }} />
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
          nameEdited.current = true;
          setRenaming(false);
        }}
      />
      <PromptModal
        visible={editField !== null}
        title={editField ? `Edit ${editField.label.toLowerCase()}` : ""}
        initial={editField?.value}
        confirmLabel="Save"
        onCancel={() => setEditField(null)}
        onSubmit={(v) => {
          if (det && editField) setDet({ ...det, fields: det.fields.map((f) => (f.id === editField.id ? { ...f, value: v.trim(), check: false } : f)) });
          setEditField(null);
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

function ReviewForm(props: {
  det: Detection;
  name: string;
  suggested: string | null;
  onRename: () => void;
  onUseSuggested: () => void;
  billParsed: BillParseResult | null;
  remindBill: boolean;
  onToggleRemindBill: (val: boolean) => void;
  saving: boolean;
  onToggle: (id: string) => void;
  onEdit: (f: DetectedField) => void;
  onType: (t: DocType) => void;
  onExpiry: (iso?: string) => void;
  onBack: () => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { det, billParsed, remindBill, onToggleRemindBill } = props;
  const types = Object.keys(DOC_LABEL) as DocType[];

  function pickExpiry() {
    DateTimePickerAndroid.open({
      value: det.expiresOn ? parseISODate(det.expiresOn) : new Date(),
      mode: "date",
      onChange: (e, d) => {
        if (e.type === "set" && d) props.onExpiry(toISODate(d));
      },
    });
  }

  const billParts = [
    billParsed?.title?.value,
    billParsed?.amount?.value?.text,
    billParsed?.dueOn?.value ? `due ${formatDate(parseISODate(billParsed.dueOn.value).getTime())}` : undefined,
  ].filter(Boolean);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 24 }}>
        <View style={styles.found}>
          <Text style={styles.foundText}>
            DocVault read this from your scan on the phone. Text recognition can make mistakes, so check each value. Tap a value to correct it.
          </Text>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Name</Text>
          <View style={styles.detCard}>
            <Pressable onPress={props.onRename} style={styles.detRow} accessibilityRole="button" accessibilityLabel={`Name: ${props.name}. Tap to change`}>
              <Text style={[styles.detValue, { flex: 1, fontSize: 17 }]}>{props.name}</Text>
              <Feather name="edit-2" size={16} color={colors.muted} />
            </Pressable>
            {props.suggested && props.suggested === props.name ? (
              <Text style={styles.cardMuted}>Suggested from the text on your scan. Tap to change it.</Text>
            ) : props.suggested ? (
              <Pressable onPress={props.onUseSuggested} style={styles.suggestChip} accessibilityRole="button">
                <Feather name="zap" size={14} color={colors.primary} />
                <Text style={styles.suggestText} numberOfLines={1}>Use suggested: {props.suggested}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Bill Banner (Flow E, §6.5) */}
        {billParsed?.isBill ? (
          <View style={styles.billBanner}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.billBannerTitle}>This looks like a bill</Text>
              <Text style={styles.billBannerBody}>{billParts.join(" • ")}</Text>
              <Text style={styles.billBannerLabel}>Remind me to pay it</Text>
            </View>
            <Switch
              value={remindBill}
              onValueChange={onToggleRemindBill}
              thumbColor={remindBill ? colors.primary : colors.surface}
              trackColor={{ false: colors.switchOff, true: colors.primaryLine }}
            />
          </View>
        ) : null}

        <View>
          <Text style={styles.sectionTitle}>Document type</Text>
          <View style={styles.chipRow}>
            {types.map((t) => (
              <Pressable key={t} onPress={() => props.onType(t)} style={[styles.chip, det.docType === t && styles.chipOn]} accessibilityRole="button">
                <Text style={[styles.chipText, det.docType === t && { color: colors.onPrimary }]}>{DOC_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Save these details</Text>
          <View style={styles.detCard}>
            {det.fields.length === 0 ? <Text style={styles.cardMuted}>No document numbers found on this scan.</Text> : null}
            {det.fields.map((f) => (
              <View key={f.id} style={styles.detRow}>
                <Pressable style={{ flex: 1 }} onPress={() => props.onEdit(f)} accessibilityRole="button" accessibilityLabel={`Edit ${f.label}`}>
                  <Text style={styles.detLabel}>{f.label}</Text>
                  <Text style={styles.detValue}>{f.value}</Text>
                  {f.check ? <Text style={styles.detCheck}>Please check this one</Text> : null}
                </Pressable>
                <Switch value={f.on} onValueChange={() => props.onToggle(f.id)} trackColor={{ true: colors.primary }} />
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Expiry date</Text>
          <View style={styles.detCard}>
            <Text style={styles.detValue}>{det.expiresOn ? formatDate(parseISODate(det.expiresOn).getTime()) : "None found"}</Text>
            <Text style={styles.cardMuted}>
              {det.expiresOn ? "You'll get a reminder before this date." : "Add one to get a reminder before it expires."}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Button label={det.expiresOn ? "Change date" : "Set date"} kind="secondary" onPress={pickExpiry} style={{ flex: 1 }} />
              {det.expiresOn ? <Button label="Clear" kind="secondary" onPress={() => props.onExpiry(undefined)} /> : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 14 }]}>
        <Button label="Save with these details" loading={props.saving} onPress={props.onSave} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Back to pages" kind="secondary" disabled={props.saving} onPress={props.onBack} style={{ flex: 1 }} />
          <Button label="Save without" kind="secondary" disabled={props.saving} onPress={props.onSkip} style={{ flex: 1 }} />
        </View>
      </View>
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
  found: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 14 },
  foundText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.primaryDark },
  billBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.primaryLine,
    gap: 12,
  },
  billBannerTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
  },
  billBannerBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.primary,
  },
  billBannerLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    marginTop: 4,
  },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink, marginBottom: 8, marginLeft: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  detCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 6 },
  cardMuted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  detRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  detLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  detValue: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, letterSpacing: 0.4 },
  detCheck: { fontFamily: fonts.medium, fontSize: 12, color: colors.warnInk, marginTop: 2 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.primary + "14",
  },
  suggestText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary, flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, paddingBottom: 24 },
  card: { width: "47.5%", backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, gap: 8 },
  thumb: { aspectRatio: 3 / 4, backgroundColor: colors.surfaceAlt, borderRadius: 8, overflow: "hidden" },
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
  badgeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onPrimary },
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

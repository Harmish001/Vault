import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useShareIntentContext } from "expo-share-intent";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { useSettings } from "../storage/settings";
import { requestReminderPermission } from "../reminders";
import { colors, fonts, radius } from "../theme";
import { Reminder, ReminderCategory, Repeat } from "../types";
import { formatDate, maskValue, parseISODate, stripFileScheme, toISODate } from "../utils";
import { Button, PromptModal, ScreenHeader, SheetModal } from "../components/ui";
import { ConfidenceTag } from "../components/ConfidenceTag";
import { SourceCard } from "../components/SourceCard";
import { FolderPicker } from "../components/FolderPicker";
import { parseBill, BillParseResult } from "../capture/parseBill";
import { CATEGORY_DEFAULTS } from "../capture/billers";
import { findMatch } from "../capture/match";
import { readPageText } from "../ocr/read";
import { buildPdf, PdfPage } from "../scan/pdf";
import * as FileSystem from "expo-file-system/legacy";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { SCAN_OUT } from "../scan/paths";
import { uid } from "../utils";

let DocumentScanner: {
  scanDocument: (options?: { maxNumDocuments?: number }) => Promise<{ status?: string; scannedImages?: string[] }>;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const plugin = require("react-native-document-scanner-plugin");
  DocumentScanner = plugin.default ?? plugin;
} catch {
  DocumentScanner = null;
}

const QUICK_TITLES = [
  "Netflix",
  "Prime Video",
  "Mobile recharge",
  "Insurance premium",
  "Rent",
  "EMI",
  "Electricity bill",
  "Credit card bill",
];

const OFFSET_OPTIONS = [
  { d: 0, label: "On the day" },
  { d: 1, label: "1 day before" },
  { d: 3, label: "3 days before" },
  { d: 7, label: "7 days before" },
];

const REPEATS: { v: Repeat; label: string }[] = [
  { v: "none", label: "Once" },
  { v: "monthly", label: "Monthly" },
  { v: "yearly", label: "Yearly" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function ReminderEditScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "ReminderEdit">) {
  const id = route.params?.id;
  const draft = route.params?.draft;
  const isCapture = !!draft;

  const {
    reminders,
    createReminder,
    updateReminder,
    deleteReminder,
    folders,
    files,
    ensureFolder,
    addFiles,
  } = useVault();
  const { settings } = useSettings();
  const { runExternal } = useLock();
  const { resetShareIntent } = useShareIntentContext();
  const insets = useSafeAreaInsets();
  const existing = id ? reminders.find((r) => r.id === id) : undefined;

  // Form State
  const [title, setTitle] = useState(existing?.title ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [amountValue, setAmountValue] = useState<number | undefined>(existing?.amountValue);
  const [note, setNote] = useState(existing?.note ?? "");
  const [dueOn, setDueOn] = useState(existing?.dueOn ?? "");
  const [time, setTime] = useState(existing?.time ?? "09:00");
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? "monthly");
  const [offsets, setOffsets] = useState<number[]>(existing?.offsets ?? [1, 0]);
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [category, setCategory] = useState<ReminderCategory | undefined>(existing?.category);
  const [attachedFileId, setAttachedFileId] = useState<string | undefined>(existing?.fileId);

  // Capture / OCR State
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState(draft?.sourceText ?? "");
  const [parseResult, setParseResult] = useState<BillParseResult | undefined>(draft?.result);
  const [chosenAmountLabel, setChosenAmountLabel] = useState<string | undefined>();
  const [showRefRow, setShowRefRow] = useState(!!existing?.reference);

  // Confidence & Tag Tracking
  const [titleChecked, setTitleChecked] = useState(false);
  const [amountChecked, setAmountChecked] = useState(false);
  const [dateChecked, setDateChecked] = useState(false);

  // Keep the bill
  const [keepBill, setKeepBill] = useState(true);
  const [keepFolderId, setKeepFolderId] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Duplicate / Match state
  const [duplicateMatch, setDuplicateMatch] = useState<{
    reminder: Reminder;
    reason: "reference" | "title";
  } | null>(null);

  // Prompts & Modals
  const [prompt, setPrompt] = useState<null | "title" | "amount" | "note" | "reference">(null);
  const [saving, setSaving] = useState(false);
  const ocrDoneRef = useRef(false);

  // Clear share intent on unmount if we came from share
  useEffect(() => {
    return () => {
      if (draft?.source === "share-text" || draft?.source === "share-image") {
        resetShareIntent();
      }
    };
  }, [draft, resetShareIntent]);

  // Initial Bills folder setup
  useEffect(() => {
    ensureFolder("Bills").then((f) => setKeepFolderId(f.id)).catch(() => undefined);
  }, [ensureFolder]);

  // Run OCR if draft has imageUris and no result yet
  useEffect(() => {
    if (!draft?.imageUris?.length || draft.result || ocrDoneRef.current) return;
    ocrDoneRef.current = true;
    let cancelled = false;

    async function runOcr() {
      setReading(true);
      setReadError(null);
      try {
        const textParts: string[] = [];
        for (const uri of draft!.imageUris!) {
          const text = await readPageText(stripFileScheme(uri));
          if (text) textParts.push(text);
        }
        if (cancelled) return;
        const joined = textParts.join("\n");
        setExtractedText(joined);
        const parsed = parseBill(joined);
        setParseResult(parsed);
        applyParsedResult(parsed);
      } catch (e) {
        if (!cancelled) {
          setReadError("Couldn't read text on this phone right now.");
        }
      } finally {
        if (!cancelled) setReading(false);
      }
    }

    runOcr();
    return () => {
      cancelled = true;
    };
  }, [draft]);

  // Apply parsed result when provided directly (e.g. from text share)
  useEffect(() => {
    if (draft?.result && !ocrDoneRef.current) {
      ocrDoneRef.current = true;
      applyParsedResult(draft.result);
    }
  }, [draft]);

  function applyParsedResult(res: BillParseResult) {
    if (res.title?.value) setTitle(res.title.value);
    if (res.amount?.value) {
      setAmount(res.amount.value.text);
      setAmountValue(res.amount.value.value);
      setChosenAmountLabel(res.amount.value.label);
    }
    if (res.dueOn?.value) setDueOn(res.dueOn.value);
    if (res.repeat?.value) setRepeat(res.repeat.value);
    if (res.offsets?.length) setOffsets(res.offsets);
    if (res.reference?.value) {
      setReference(res.reference.value);
      setShowRefRow(true);
    }
    if (res.category) setCategory(res.category);

    // Check for smart match / duplicates
    const match = findMatch(
      {
        title: res.title?.value,
        reference: res.reference?.value,
        amount: res.amount?.value.text,
        amountValue: res.amount?.value.value,
        dueOn: res.dueOn?.value,
      },
      reminders
    );
    if (match) {
      setDuplicateMatch(match);
    }
  }

  // Handle pasting from clipboard
  async function pasteFromClipboard() {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        ToastAndroid.show("Nothing to paste.", ToastAndroid.SHORT);
        return;
      }
      setExtractedText(text);
      const parsed = parseBill(text);
      setParseResult(parsed);
      applyParsedResult(parsed);
      ToastAndroid.show("Pasted and read from clipboard", ToastAndroid.SHORT);
    } catch {
      ToastAndroid.show("Couldn't read clipboard", ToastAndroid.SHORT);
    }
  }

  // Handle scanning a bill with the camera
  async function scanBill() {
    if (!DocumentScanner) {
      Alert.alert("Scanner not available", "Camera scanner plugin is not installed on this device.");
      return;
    }
    try {
      const res = await runExternal(() => DocumentScanner!.scanDocument({ maxNumDocuments: 3 }));
      if (res?.scannedImages?.length) {
        navigation.navigate("ReminderEdit", {
          draft: {
            source: "scan",
            imageUris: res.scannedImages,
            originalName: "Scanned bill",
          },
        });
      }
    } catch {
      Alert.alert("Scan failed", "Could not complete document scan.");
    }
  }

  function pickDate() {
    DateTimePickerAndroid.open({
      value: dueOn ? parseISODate(dueOn) : new Date(),
      mode: "date",
      onChange: (e, d) => {
        if (e.type === "set" && d) {
          setDueOn(toISODate(d));
          setDateChecked(true);
        }
      },
    });
  }

  function pickTime() {
    const [h, m] = time.split(":").map(Number);
    const base = new Date();
    base.setHours(h || 9, m || 0, 0, 0);
    DateTimePickerAndroid.open({
      value: base,
      mode: "time",
      is24Hour: false,
      onChange: (e, d) => {
        if (e.type === "set" && d) {
          setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      },
    });
  }

  const canSave = title.trim().length > 0 && dueOn.length > 0 && !reading;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      let savedFileId = attachedFileId;

      // Keep the bill: save image/PDF to vault
      if (keepBill && keepFolderId && draft?.imageUris?.length && !attachedFileId) {
        try {
          if (draft.imageUris.length === 1 && !draft.imageUris[0].toLowerCase().endsWith(".pdf")) {
            const uri = draft.imageUris[0];
            const name = draft.originalName || `${title.trim() || "Bill"}.jpg`;
            const addRes = await addFiles(keepFolderId, [{ uri, name }]);
            if (addRes.files.length) savedFileId = addRes.files[0].id;
          } else {
            // Multiple images or scan: create single PDF using buildPdf
            const built: PdfPage[] = [];
            for (const imgUri of draft.imageUris) {
              const b64 = await FileSystem.readAsStringAsync(imgUri, { encoding: FileSystem.EncodingType.Base64 });
              built.push({ jpeg: base64ToBytes(b64), rotate: 0 });
            }
            const stamp = toISODate(new Date()).replace(/-/g, "");
            const pdfName = `${title.trim() || "Bill"}-${stamp}.pdf`;
            const outPdf = SCAN_OUT + uid() + ".pdf";
            await FileSystem.writeAsStringAsync(outPdf, bytesToBase64(buildPdf(built)), { encoding: FileSystem.EncodingType.Base64 });
            const addRes = await addFiles(keepFolderId, [
              { uri: outPdf, name: pdfName },
            ]);
            if (addRes.files.length) savedFileId = addRes.files[0].id;
          }
        } catch (e) {
          console.warn("Failed to keep bill file:", e);
        }
      }

      const data = {
        title: title.trim(),
        dueOn,
        time,
        repeat,
        offsets: offsets.length ? offsets : [0],
        amount: amount.trim() || undefined,
        amountValue,
        note: note.trim() || undefined,
        reference: reference.trim() || undefined,
        category,
        source: draft?.source ?? (existing?.source || "manual"),
        fileId: savedFileId,
      };

      if (existing) {
        const reset = existing.dueOn !== dueOn || existing.repeat !== repeat;
        await updateReminder(existing.id, {
          ...data,
          ...(reset ? { doneThrough: undefined, snoozeUntil: undefined } : {}),
        });
      } else {
        await createReminder(data);
      }

      if (settings.remindersEnabled && !(await requestReminderPermission())) {
        Alert.alert(
          "Notifications are off",
          "The reminder is saved and shown in the app. Turn on notifications for DocVault in Android settings to be notified.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings() },
          ]
        );
      }

      ToastAndroid.show(`Reminder added for ${formatDate(parseISODate(dueOn).getTime())}`, ToastAndroid.SHORT);
      navigation.navigate("Reminders");
    } catch {
      Alert.alert("Couldn't save the reminder", "Please try again.");
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (title || amount || dueOn) {
      Alert.alert("Discard this reminder?", "Your changes will be lost.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            resetShareIntent();
            navigation.goBack();
          },
        },
      ]);
    } else {
      resetShareIntent();
      navigation.goBack();
    }
  }

  function remove() {
    if (!existing) return;
    Alert.alert(`Delete “${existing.title}”?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteReminder(existing.id);
          navigation.goBack();
        },
      },
    ]);
  }

  // Handle updating an existing matched reminder (§9)
  async function applyDuplicateUpdate() {
    if (!duplicateMatch) return;
    const { reminder: matched } = duplicateMatch;
    setSaving(true);
    try {
      let savedFileId = matched.fileId;
      if (keepBill && keepFolderId && draft?.imageUris?.length) {
        try {
          const uri = draft.imageUris[0];
          const name = draft.originalName || `${title.trim() || matched.title}.jpg`;
          const addRes = await addFiles(keepFolderId, [{ uri, name }]);
          if (addRes.files.length) savedFileId = addRes.files[0].id;
        } catch (e) {
          // ignore
        }
      }

      const patch: Partial<Reminder> = {
        amount: amount.trim() || matched.amount,
        amountValue: amountValue ?? matched.amountValue,
        fileId: savedFileId,
        reference: matched.reference || reference.trim() || undefined,
      };

      // Check due date change
      if (dueOn && dueOn !== matched.dueOn) {
        patch.dueOn = dueOn;
        if (dueOn > matched.dueOn) {
          patch.doneThrough = undefined;
        }
      }

      await updateReminder(matched.id, patch);
      ToastAndroid.show(`Updated ${matched.title}`, ToastAndroid.SHORT);
      setDuplicateMatch(null);
      resetShareIntent();
      navigation.navigate("Reminders");
    } catch {
      Alert.alert("Update failed", "Could not update the existing reminder.");
      setSaving(false);
    }
  }

  // Determine field confidence tag types
  const titleTag =
    parseResult?.title && !titleChecked && parseResult.title.confidence !== "high"
      ? "check"
      : undefined;

  const amountTag =
    parseResult?.amount && !amountChecked && parseResult.amount.confidence !== "high"
      ? "check"
      : undefined;

  const dateTag = !dueOn
    ? "needed"
    : parseResult?.dueOn && !dateChecked && parseResult.dueOn.confidence !== "high"
    ? "check"
    : undefined;

  // Confidence Banner info (§6.2)
  const bannerInfo = useMemo(() => {
    if (!parseResult) return null;
    let foundCount = 0;
    if (parseResult.title) foundCount++;
    if (parseResult.amount) foundCount++;
    if (parseResult.dueOn) foundCount++;

    const allHigh =
      foundCount === 3 &&
      parseResult.title?.confidence === "high" &&
      parseResult.amount?.confidence === "high" &&
      parseResult.dueOn?.confidence === "high";

    let message = "";
    if (allHigh) {
      message = "Everything looks right. Check it, then save.";
    } else if (foundCount > 0) {
      message = `I found ${foundCount} of 3 details. Check the ones marked “Check”.`;
    } else {
      message = "I couldn't find an amount or date. You can fill them in below.";
    }

    return { message, overdue: parseResult.overdue };
  }, [parseResult]);

  const [hh, mm] = time.split(":").map(Number);
  const timeLabel = new Date(2000, 0, 1, hh || 0, mm || 0).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const keepFolderName = folders.find((f) => f.id === keepFolderId)?.name || "Bills";
  const attachedFile = attachedFileId ? files.find((f) => f.id === attachedFileId) : null;

  const categoryIcon = category ? (CATEGORY_DEFAULTS[category]?.icon as any) : "bell";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={existing ? "Edit reminder" : isCapture ? "New reminder from bill" : "New reminder"}
        onBack={handleDiscard}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90, gap: 14 }}>
        {/* Non-capture mode top chips (§6.4) */}
        {!existing && !isCapture ? (
          <View style={styles.topChips}>
            <Pressable
              style={styles.topChip}
              onPress={pasteFromClipboard}
              accessibilityRole="button"
            >
              <Feather name="clipboard" size={16} color={colors.primary} />
              <Text style={styles.topChipText}>Paste from clipboard</Text>
            </Pressable>
            <Pressable
              style={styles.topChip}
              onPress={scanBill}
              accessibilityRole="button"
            >
              <Feather name="camera" size={16} color={colors.primary} />
              <Text style={styles.topChipText}>Scan a bill</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Source card (§6.2) */}
        {isCapture || extractedText ? (
          <SourceCard
            thumbnailUri={draft?.imageUris?.[0]}
            title={draft?.originalName || (extractedText ? extractedText.slice(0, 100) : "Shared bill")}
            subline={draft?.sourceText ? "Shared message" : draft?.imageUris ? "Scanned / shared image" : undefined}
            extractedText={extractedText}
          />
        ) : null}

        {/* Reading shimmer / loading state */}
        {reading ? (
          <View style={styles.readingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.readingText}>Reading the bill on your phone…</Text>
          </View>
        ) : null}

        {/* OCR Error banner */}
        {readError ? (
          <View style={styles.banner}>
            <Feather name="alert-circle" size={18} color="#475569" />
            <Text style={styles.bannerText}>
              Couldn't read text on this phone right now. You can fill the details in below.
            </Text>
          </View>
        ) : null}

        {/* Confidence banner (§6.2) */}
        {bannerInfo && !reading ? (
          <View style={styles.banner}>
            <Feather name="info" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.bannerText}>{bannerInfo.message}</Text>
              {bannerInfo.overdue && dueOn ? (
                <View style={styles.overdueNotice}>
                  <Text style={styles.overdueNoticeText}>
                    This was due on {formatDate(parseISODate(dueOn).getTime())}. Remind me today at {timeLabel} instead?
                  </Text>
                  <Pressable
                    onPress={() => {
                      setDueOn(toISODate(new Date()));
                      setDateChecked(true);
                    }}
                    style={styles.todayBtn}
                  >
                    <Text style={styles.todayBtnText}>Use today</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Field Rows Card */}
        <View style={styles.card}>
          {/* Title Row */}
          <Row
            label="What"
            value={title || "Subscription or bill"}
            empty={!title}
            onPress={() => {
              setPrompt("title");
              setTitleChecked(true);
            }}
            icon={categoryIcon ?? "edit-2"}
            tag={titleTag}
          />

          {/* Amount Row */}
          <Row
            label="Amount"
            value={amount || "Optional (e.g. ₹749)"}
            empty={!amount}
            onPress={() => {
              setPrompt("amount");
              setAmountChecked(true);
            }}
            icon="dollar-sign"
            tag={amountTag}
          />

          {/* Amount Alternatives Chips (§6.2) */}
          {parseResult?.amountAlternatives?.length ? (
            <View style={styles.altChips}>
              <Text style={styles.altTitle}>Alternative amounts:</Text>
              <View style={styles.chipsWrap}>
                {parseResult.amountAlternatives.map((alt) => (
                  <Pressable
                    key={alt.value + alt.label}
                    onPress={() => {
                      setAmount(alt.text);
                      setAmountValue(alt.value);
                      setChosenAmountLabel(alt.label);
                      if (alt.label === "minimum") {
                        setNote("Minimum amount due");
                      }
                      setAmountChecked(true);
                    }}
                    style={[styles.altChip, amountValue === alt.value && styles.altChipActive]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.altChipText,
                        amountValue === alt.value && styles.altChipTextActive,
                      ]}
                    >
                      {alt.label === "minimum"
                        ? `Minimum ${alt.text}`
                        : alt.label === "after-due"
                        ? `After due ${alt.text}`
                        : alt.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Date Row */}
          <Row
            label="Date"
            value={dueOn ? formatDate(parseISODate(dueOn).getTime()) : "Pick a date"}
            empty={!dueOn}
            onPress={pickDate}
            icon="calendar"
            tag={dateTag}
          />

          {/* Time Row */}
          <Row label="Time" value={timeLabel} onPress={pickTime} icon="clock" last={!showRefRow} />

          {/* Reference Row (optional / labelled) */}
          {showRefRow ? (
            <Row
              label="Reference"
              value={reference ? maskValue(reference) : "Account or policy no."}
              empty={!reference}
              onPress={() => setPrompt("reference")}
              icon="hash"
              last
            />
          ) : null}
        </View>

        {/* Add Reference Button if not already showing */}
        {!showRefRow ? (
          <Pressable
            onPress={() => setShowRefRow(true)}
            style={styles.addRefBtn}
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={styles.addRefBtnText}>Add reference</Text>
          </Pressable>
        ) : null}

        {/* Repeat Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Repeat</Text>
          <View style={styles.chips}>
            {REPEATS.map((r) => (
              <Pressable
                key={r.v}
                onPress={() => setRepeat(r.v)}
                style={[styles.chip, repeat === r.v && styles.chipOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, repeat === r.v && { color: "#fff" }]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {repeat !== "none" ? (
            <Text style={styles.hint}>
              {repeat === "monthly"
                ? "Repeats on the same day each month (the last day of shorter months)."
                : "Repeats on the same date every year."}
            </Text>
          ) : (
            <Text style={styles.hint}>Repeats? Tap Monthly or Yearly.</Text>
          )}
        </View>

        {/* Notify Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notify me</Text>
          <View style={styles.chips}>
            {OFFSET_OPTIONS.map((o) => {
              const on = offsets.includes(o.d);
              return (
                <Pressable
                  key={o.d}
                  onPress={() => {
                    const next = on ? offsets.filter((x) => x !== o.d) : [...offsets, o.d];
                    if (next.length) setOffsets(next.sort((a, b) => b - a));
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, on && { color: "#fff" }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Keep the bill card (image/scan sources only, §6.2) */}
        {draft?.imageUris?.length ? (
          <View style={styles.card}>
            <View style={styles.keepRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Keep the bill</Text>
                <Text style={styles.hintNoMargin}>
                  Saved in your Bills folder, linked to this reminder.
                </Text>
              </View>
              <Switch
                value={keepBill}
                onValueChange={setKeepBill}
                thumbColor={keepBill ? colors.primary : "#ccc"}
                trackColor={{ false: "#e0e0e0", true: "#C7D5F7" }}
              />
            </View>

            {keepBill ? (
              <Pressable
                onPress={() => setShowFolderPicker(true)}
                style={styles.folderRow}
                accessibilityRole="button"
              >
                <Text style={styles.folderRowLabel}>Save to</Text>
                <Text style={styles.folderRowValue}>{keepFolderName} ›</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Attached bill card for existing reminder (§6.4) */}
        {attachedFile ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attached bill</Text>
            <View style={styles.attachedRow}>
              <Feather name="paperclip" size={18} color={colors.primary} />
              <Text style={styles.attachedName} numberOfLines={1}>
                {attachedFile.name}
              </Text>
              <Pressable
                onPress={() => navigation.navigate("FileDetails", { fileId: attachedFile.id })}
                style={styles.attachedBtn}
              >
                <Text style={styles.attachedBtnText}>Open</Text>
              </Pressable>
              <Pressable
                onPress={() => setAttachedFileId(undefined)}
                style={styles.attachedBtn}
              >
                <Text style={[styles.attachedBtnText, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Action Buttons */}
        <Button
          label={existing ? "Save changes" : "Save reminder"}
          disabled={!canSave}
          loading={saving}
          onPress={save}
        />
        <Button label="Discard" kind="secondary" onPress={handleDiscard} />
        {existing ? <Button label="Delete reminder" kind="secondary" onPress={remove} /> : null}
      </ScrollView>

      {/* Prompts for text inputs */}
      <PromptModal
        visible={prompt === "title"}
        title="What is this reminder for?"
        placeholder="e.g. Netflix, Electricity bill"
        initial={title}
        confirmLabel="Done"
        suggestions={QUICK_TITLES}
        onCancel={() => setPrompt(null)}
        onSubmit={(val) => {
          setTitle(val);
          setPrompt(null);
        }}
      />

      <PromptModal
        visible={prompt === "amount"}
        title="Amount"
        placeholder="e.g. ₹749.00"
        initial={amount}
        confirmLabel="Done"
        onCancel={() => setPrompt(null)}
        onSubmit={(val) => {
          setAmount(val);
          setPrompt(null);
        }}
      />

      <PromptModal
        visible={prompt === "reference"}
        title="Reference number"
        placeholder="e.g. Consumer no., policy no."
        initial={reference}
        confirmLabel="Done"
        onCancel={() => setPrompt(null)}
        onSubmit={(val) => {
          setReference(val);
          setPrompt(null);
        }}
      />

      {/* Folder Picker for Keep the bill */}
      <FolderPicker
        visible={showFolderPicker}
        title="Save bill to"
        confirmLabel="Choose folder"
        onClose={() => setShowFolderPicker(false)}
        onPick={(fId) => {
          setKeepFolderId(fId);
          setShowFolderPicker(false);
        }}
      />

      {/* Duplicate / Smart Match Bottom Sheet (§9) */}
      <SheetModal
        visible={!!duplicateMatch}
        onClose={() => setDuplicateMatch(null)}
      >
        <View style={styles.duplicateSheet}>
          <Text style={styles.sheetTitle}>
            {`You already have “${duplicateMatch?.reminder.title}”`}
          </Text>
          <Text style={styles.duplicateSubline}>
            {[
              duplicateMatch?.reminder.repeat === "monthly" ? "Every month" : "Every year",
              `next due ${formatDate(parseISODate(duplicateMatch?.reminder.dueOn || "").getTime())}`,
              duplicateMatch?.reminder.amount,
            ]
              .filter(Boolean)
              .join(" • ")}
          </Text>

          <Button
            label="Update it with this bill"
            onPress={applyDuplicateUpdate}
            loading={saving}
          />
          <Button
            label="Add as a separate reminder"
            kind="secondary"
            onPress={() => setDuplicateMatch(null)}
          />
          <Button
            label="Cancel"
            kind="secondary"
            onPress={() => {
              setDuplicateMatch(null);
              navigation.goBack();
            }}
          />
        </View>
      </SheetModal>
    </View>
  );
}

function Row(props: {
  label: string;
  value: string;
  empty?: boolean;
  last?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  tag?: "check" | "needed";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.row,
        !props.last && styles.rowLine,
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text
        style={[
          styles.rowValue,
          props.empty && { color: colors.muted, fontFamily: fonts.body },
        ]}
        numberOfLines={1}
      >
        {props.value}
      </Text>
      {props.tag ? <ConfidenceTag type={props.tag} /> : null}
      <Feather name={props.icon ?? "edit-2"} size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topChips: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  topChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  topChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  readingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: radius.lg,
    padding: 16,
  },
  readingText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: radius.lg,
    padding: 14,
  },
  bannerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  overdueNotice: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#A7F3D0",
    gap: 6,
  },
  overdueNoticeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#475569",
  },
  todayBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  todayBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: "#fff",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: radius.md,
    paddingHorizontal: 4,
  },
  rowLine: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    width: 60,
  },
  rowValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  altChips: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 6,
  },
  altTitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  altChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  altChipActive: {
    backgroundColor: "#ECFDF5",
    borderColor: colors.primary,
  },
  altChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.ink,
  },
  altChipTextActive: {
    color: colors.primary,
  },
  addRefBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignSelf: "flex-start",
  },
  addRefBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginBottom: 10,
  },
  hintNoMargin: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  keepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  folderRowLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  folderRowValue: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  attachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  attachedName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  attachedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attachedBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  duplicateSheet: {
    padding: 16,
    gap: 12,
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 4,
  },
  duplicateSubline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
  },
});

import React, { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { requestReminderPermission } from "../reminders";
import { colors, fonts, radius } from "../theme";
import { Repeat } from "../types";
import { formatDate, parseISODate, toISODate } from "../utils";
import { Button, PromptModal, ScreenHeader } from "../components/ui";

const QUICK_TITLES = ["Netflix", "Prime Video", "Mobile recharge", "Insurance premium", "Rent", "EMI", "Electricity bill", "Credit card bill"];
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

export default function ReminderEditScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ReminderEdit">) {
  const id = route.params?.id;
  const { reminders, createReminder, updateReminder, deleteReminder } = useVault();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const existing = id ? reminders.find((r) => r.id === id) : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [dueOn, setDueOn] = useState(existing?.dueOn ?? "");
  const [time, setTime] = useState(existing?.time ?? "09:00");
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? "monthly");
  const [offsets, setOffsets] = useState<number[]>(existing?.offsets ?? [1, 0]);
  const [prompt, setPrompt] = useState<null | "title" | "amount" | "note">(null);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && dueOn.length > 0;

  function pickDate() {
    DateTimePickerAndroid.open({
      value: dueOn ? parseISODate(dueOn) : new Date(),
      mode: "date",
      onChange: (e, d) => {
        if (e.type === "set" && d) setDueOn(toISODate(d));
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
        if (e.type === "set" && d) setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      },
    });
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        dueOn,
        time,
        repeat,
        offsets: offsets.length ? offsets : [0],
        amount: amount.trim() || undefined,
        note: note.trim() || undefined,
      };
      if (existing) {
        // changing the date or repeat starts a fresh cycle: clear done/snooze from the old schedule
        const reset = existing.dueOn !== dueOn || existing.repeat !== repeat;
        await updateReminder(existing.id, { ...data, ...(reset ? { doneThrough: undefined, snoozeUntil: undefined } : {}) });
      } else {
        await createReminder(data);
      }
      if (settings.remindersEnabled && !(await requestReminderPermission())) {
        Alert.alert(
          "Notifications are off",
          "The reminder is saved and shown in the app. Turn on notifications for DocVault in Android settings to be notified.",
          [{ text: "Not now", style: "cancel" }, { text: "Open settings", onPress: () => Linking.openSettings() }]
        );
      }
      navigation.goBack();
    } catch {
      Alert.alert("Couldn't save the reminder", "Please try again.");
      setSaving(false);
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

  const [hh, mm] = time.split(":").map(Number);
  const timeLabel = new Date(2000, 0, 1, hh || 0, mm || 0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={existing ? "Edit reminder" : "New reminder"} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={styles.card}>
          <Row label="What" value={title || "Tap to name it"} empty={!title} onPress={() => setPrompt("title")} />
          <Row label="Amount" value={amount || "Optional, e.g. ₹499"} empty={!amount} onPress={() => setPrompt("amount")} />
          <Row label="Note" value={note || "Optional, e.g. cancel before renewal"} empty={!note} onPress={() => setPrompt("note")} last />
        </View>

        <View style={styles.card}>
          <Row label="Date" value={dueOn ? formatDate(parseISODate(dueOn).getTime()) : "Pick a date"} empty={!dueOn} onPress={pickDate} icon="calendar" />
          <Row label="Time" value={timeLabel} onPress={pickTime} icon="clock" last />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Repeat</Text>
          <View style={styles.chips}>
            {REPEATS.map((r) => (
              <Pressable key={r.v} onPress={() => setRepeat(r.v)} style={[styles.chip, repeat === r.v && styles.chipOn]} accessibilityRole="button">
                <Text style={[styles.chipText, repeat === r.v && { color: "#fff" }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          {repeat !== "none" ? (
            <Text style={styles.hint}>
              {repeat === "monthly" ? "Repeats on the same day each month (the last day of shorter months)." : "Repeats on the same date every year."}
            </Text>
          ) : null}
        </View>

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
          <Text style={styles.hint}>Notifications have Snooze and Done buttons. They open DocVault, so your lock still protects it.</Text>
        </View>

        <Button label={existing ? "Save changes" : "Save reminder"} disabled={!canSave} loading={saving} onPress={save} />
        {existing ? <Button label="Delete reminder" kind="secondary" onPress={remove} /> : null}
      </ScrollView>

      <PromptModal
        visible={prompt === "title"}
        title="What is it for?"
        initial={title}
        placeholder="e.g. Netflix"
        suggestions={QUICK_TITLES}
        confirmLabel="Done"
        onCancel={() => setPrompt(null)}
        onSubmit={(v) => {
          setTitle(v.trim());
          setPrompt(null);
        }}
      />
      <PromptModal
        visible={prompt === "amount"}
        title="Amount"
        initial={amount}
        placeholder="₹499"
        allowEmpty
        confirmLabel="Done"
        onCancel={() => setPrompt(null)}
        onSubmit={(v) => {
          setAmount(v.trim());
          setPrompt(null);
        }}
      />
      <PromptModal
        visible={prompt === "note"}
        title="Note"
        initial={note}
        multiline
        allowEmpty
        confirmLabel="Done"
        onCancel={() => setPrompt(null)}
        onSubmit={(v) => {
          setNote(v.trim());
          setPrompt(null);
        }}
      />
    </View>
  );
}

function Row(props: { label: string; value: string; empty?: boolean; last?: boolean; icon?: React.ComponentProps<typeof Feather>["name"]; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.row, !props.last && styles.rowLine]} accessibilityRole="button">
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Text style={[styles.rowValue, props.empty && { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>{props.value}</Text>
      <Feather name={props.icon ?? "edit-2"} size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, width: 60 },
  rowValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
});

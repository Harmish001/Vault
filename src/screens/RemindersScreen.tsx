import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { nextDue } from "../reminders-plan";
import { colors, fonts, radius } from "../theme";
import { Reminder } from "../types";
import { formatDate, parseISODate } from "../utils";
import { DueBadge } from "../components/Rows";
import { EmptyState, FabBar, Pill, ScreenHeader } from "../components/ui";

const REPEAT_LABEL = { none: "One time", monthly: "Every month", yearly: "Every year" } as const;

export default function RemindersScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Reminders">) {
  const { reminders, updateReminder } = useVault();
  const insets = useSafeAreaInsets();

  const { upcoming, finished } = useMemo(() => {
    const now = new Date();
    const rows = reminders.map((r) => ({ r, due: nextDue(r, now) }));
    return {
      upcoming: rows.filter((x) => x.due).sort((a, b) => (a.due as string).localeCompare(b.due as string)),
      finished: rows.filter((x) => !x.due),
    };
  }, [reminders]);

  function markDone(r: Reminder, due: string) {
    const label = r.repeat === "none" ? "Mark this as done?" : "Mark this cycle as done? The next one stays scheduled.";
    Alert.alert(r.title, label, [
      { text: "Cancel", style: "cancel" },
      { text: "Done", onPress: () => updateReminder(r.id, { doneThrough: due, snoozeUntil: undefined }) },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Reminders" subtitle="Subscriptions, bills and renewals" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110, gap: 10 }}>
        {reminders.length === 0 ? (
          <EmptyState
            title="Never miss a renewal"
            body="Add a reminder for a subscription, insurance premium, rent or any bill. Set it to repeat every month or year, and add the amount so you know what's coming."
          />
        ) : null}

        {upcoming.map(({ r, due }) => (
          <Pressable key={r.id} onPress={() => navigation.navigate("ReminderEdit", { id: r.id })} style={styles.card} accessibilityRole="button" accessibilityLabel={`Edit ${r.title}`}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.title} numberOfLines={1}>{r.title}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {[r.amount?.trim(), REPEAT_LABEL[r.repeat], r.time].filter(Boolean).join("  •  ")}
              </Text>
              <DueBadge iso={due as string} />
            </View>
            <Pressable onPress={() => markDone(r, due as string)} hitSlop={8} style={styles.check} accessibilityRole="button" accessibilityLabel={`Mark ${r.title} done`}>
              <Feather name="check" size={20} color={colors.success} />
            </Pressable>
          </Pressable>
        ))}

        {finished.length ? (
          <>
            <Text style={styles.section}>Done</Text>
            {finished.map(({ r }) => (
              <Pressable key={r.id} onPress={() => navigation.navigate("ReminderEdit", { id: r.id })} style={[styles.card, { opacity: 0.65 }]} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.sub}>Was due {formatDate(parseISODate(r.dueOn).getTime())}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      <FabBar>
        <Pill icon="plus" label="New reminder" onPress={() => navigation.navigate("ReminderEdit", {})} />
      </FabBar>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  check: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: "#BFE3D2", backgroundColor: "#E2F3EA", alignItems: "center", justifyContent: "center" },
  section: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink, marginTop: 14, marginLeft: 2 },
});

import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { nextDue, repeatLabel } from "../reminders-plan";
import { colors, fonts, radius } from "../theme";
import { Reminder } from "../types";
import { formatDate, maskValue, parseISODate } from "../utils";
import { DueBadge } from "../components/Rows";
import { EmptyState, FabBar, Pill } from "../components/ui";
import { CATEGORY_DEFAULTS } from "../capture/billers";

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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function RemindersView({ navigation }: Props) {
  const { reminders, updateReminder } = useVault();
  const { runExternal } = useLock();

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

  async function handleScanBill() {
    if (!DocumentScanner) {
      Alert.alert("Scanner not available", "Camera scanner is not available on this device.");
      return;
    }
    try {
      const res = await runExternal(() => DocumentScanner!.scanDocument({ maxNumDocuments: 3 }));
      if (res?.scannedImages?.length) {
        navigation.navigate("ReminderEdit", {
          draft: {
            source: "scan",
            imageUris: res.scannedImages,
          },
        });
      }
    } catch {
      Alert.alert("Could not scan bill", "Please check camera permissions and try again.");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 18 }}>
        <Pressable
          onPress={() => navigation.navigate("ReminderEdit", { plan: "recharge" })}
          style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Add a recharge or subscription"
        >
          <View style={styles.iconBox}>
            <Feather name="smartphone" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Recharges and subscriptions</Text>
            <Text style={styles.sub}>Add once for anyone at home. Remind every 28 days, 3 months, or year.</Text>
          </View>
          <Feather name="plus" size={18} color={colors.primary} />
        </Pressable>

        {reminders.length === 0 ? (
          <EmptyState
            title="No reminders yet"
            body="Bills, rent, insurance, and household recharges or subscriptions."
          />
        ) : null}

        {upcoming.length ? (
          <View>
            <Text style={styles.sectionHeading}>UPCOMING</Text>
            <View style={styles.card}>
              {upcoming.map(({ r, due }, i) => {
                const iconName = (r.category && CATEGORY_DEFAULTS[r.category]?.icon) || "bell";
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => navigation.navigate("ReminderEdit", { id: r.id })}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && styles.rowBorder,
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.title}. Due ${formatDate(parseISODate(due as string).getTime())}`}
                  >
                    <View style={styles.iconBox}>
                      <Feather name={iconName as never} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} numberOfLines={1}>{r.title}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 }}>
                        {r.amount?.trim() ? <Text style={styles.amount}>{r.amount.trim()}</Text> : null}
                        <Text style={styles.sub}>
                          {[
                            r.who?.trim(),
                            repeatLabel(r.repeat),
                            r.reference?.trim() ? maskValue(r.reference.trim()) : null,
                            r.note?.trim(),
                          ]
                            .filter(Boolean)
                            .join("  •  ")}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      <DueBadge iso={due as string} />
                      <Pressable
                        onPress={() => markDone(r, due as string)}
                        style={styles.doneBtn}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${r.title} done`}
                      >
                        <Feather name="check" size={14} color={colors.primary} />
                        <Text style={styles.doneBtnText}>Done</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {finished.length ? (
          <View>
            <Text style={styles.sectionHeading}>ALL DONE</Text>
            <View style={styles.card}>
              {finished.map(({ r }, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => navigation.navigate("ReminderEdit", { id: r.id })}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowBorder,
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.title}, finished`}
                >
                  <View style={[styles.iconBox, { backgroundColor: colors.neutralSoft }]}>
                    <Feather name="check-circle" size={18} color={colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.muted }]} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.sub}>{r.amount?.trim() ? `${r.amount.trim()}  •  ` : ""}Finished</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* FABs */}
      <FabBar bottomOffset={84}>
        <Pill icon="camera" label="Scan bill" tone="dark" onPress={handleScanBill} />
        <Pill icon="plus" label="New reminder" onPress={() => navigation.navigate("ReminderEdit")} />
      </FabBar>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  amount: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  doneBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
});

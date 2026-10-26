import React, { useMemo } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useLock } from "../lock/LockProvider";
import { nextDue } from "../reminders-plan";
import { colors, fonts, radius } from "../theme";
import { Reminder } from "../types";
import { formatDate, maskValue, parseISODate } from "../utils";
import { DueBadge } from "../components/Rows";
import { EmptyState, FabBar, IconButton, Pill, ScreenHeader } from "../components/ui";
import BottomNavBar from "../components/BottomNavBar";
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

const REPEAT_LABEL = { none: "One time", monthly: "Every month", yearly: "Every year" } as const;

export default function RemindersScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Reminders">) {
  const { reminders, updateReminder } = useVault();
  const { runExternal } = useLock();
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
            originalName: "Scanned bill",
          },
        });
      }
    } catch {
      Alert.alert("Scan failed", "Could not complete document scan.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Reminders"
        left={
          <Image
            source={require("../../assets/logo-mark.png")}
            style={{ width: 40, height: 40, borderRadius: 10 }}
          />
        }
        right={
          <IconButton
            icon="settings"
            label="Settings"
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12) + 160, gap: 10 }}>
        {reminders.length === 0 ? (
          <View style={{ gap: 16 }}>
            <EmptyState
              title="Never miss a renewal"
              body="Add a reminder for a subscription, insurance premium, rent or any bill. Set it to repeat every month or year, and add the amount so you know what's coming."
            />
            {/* Quick onboarding steps (§6.3) */}
            <View style={styles.quickStepsCard}>
              <Text style={styles.quickStepsTitle}>Add one in seconds</Text>
              <View style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Feather name="share-2" size={16} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>Share a message or screenshot of a bill to DocVault.</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Feather name="cpu" size={16} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>DocVault reads it on your phone.</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Feather name="check" size={16} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>Check and save.</Text>
              </View>
            </View>
          </View>
        ) : null}

        {upcoming.map(({ r, due }) => {
          const categoryIcon = r.category
            ? (CATEGORY_DEFAULTS[r.category]?.icon as any)
            : "file-text";

          const subParts = [
            r.amount?.trim(),
            REPEAT_LABEL[r.repeat],
            r.time,
            r.reference ? `Ref …${r.reference.slice(-4)}` : undefined,
          ].filter(Boolean);

          return (
            <Pressable
              key={r.id}
              onPress={() => navigation.navigate("ReminderEdit", { id: r.id })}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.title}`}
            >
              {/* Category Icon */}
              <View style={styles.catIconWrap}>
                <Feather name={categoryIcon} size={18} color={colors.primary} />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {subParts.join("  •  ")}
                </Text>
                <DueBadge iso={due as string} />
              </View>

              {/* Linked bill paperclip button (§6.3) */}
              {r.fileId ? (
                <Pressable
                  onPress={() => navigation.navigate("FileDetails", { fileId: r.fileId! })}
                  hitSlop={8}
                  style={styles.clipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Open the bill"
                >
                  <Feather name="paperclip" size={18} color={colors.primary} />
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => markDone(r, due as string)}
                hitSlop={8}
                style={styles.check}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${r.title} done`}
              >
                <Feather name="check" size={20} color={colors.success} />
              </Pressable>
            </Pressable>
          );
        })}

        {finished.length ? (
          <>
            <Text style={styles.section}>Done</Text>
            {finished.map(({ r }) => (
              <Pressable
                key={r.id}
                onPress={() => navigation.navigate("ReminderEdit", { id: r.id })}
                style={[styles.card, { opacity: 0.65 }]}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.sub}>
                    Was due {formatDate(parseISODate(r.dueOn).getTime())}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Two-pill FabBar (§6.3) */}
      <FabBar bottomOffset={84}>
        <Pill
          icon="camera"
          label="Scan a bill"
          tone="dark"
          onPress={handleScanBill}
        />
        <Pill
          icon="plus"
          label="New reminder"
          onPress={() => navigation.navigate("ReminderEdit", {})}
        />
      </FabBar>
      <BottomNavBar active="reminders" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  clipBtn: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
  },
  check: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.ink,
    marginTop: 14,
    marginLeft: 2,
  },
  quickStepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickStepsTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
});

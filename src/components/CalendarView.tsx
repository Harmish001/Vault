import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors, fonts, radius } from "../theme";
import { parseISODate, toISODate, formatDate } from "../utils";
import { nextDue } from "../reminders-plan";
import { Reminder, VaultFile } from "../types";

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: "reminder" | "expiry";
  tone: "ok" | "soon" | "expired";
  icon: string;
  amount?: string;
  who?: string;
};

type Props = {
  reminders: Reminder[];
  files: VaultFile[];
  onPressReminder: (id: string) => void;
  onPressFile: (id: string) => void;
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarView({ reminders, files, onPressReminder, onPressFile }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const now = new Date();

  // Build events map
  const { events, eventsByDate } = useMemo(() => {
    const evts: CalendarEvent[] = [];
    const today = toISODate(now);

    // Add reminder events
    for (const r of reminders) {
      const due = nextDue(r, now);
      if (due) {
        const days = Math.round((parseISODate(due).getTime() - now.getTime()) / 86400000);
        evts.push({
          id: r.id,
          title: r.title,
          date: due,
          type: "reminder",
          tone: days < 0 ? "expired" : days <= 7 ? "soon" : "ok",
          icon: r.category === "telecom" ? "smartphone" : r.category === "subscription" ? "tv" : "bell",
          amount: r.amount,
          who: r.who,
        });
      }
    }

    // Add document expiry events
    for (const f of files) {
      if (f.expiresOn) {
        const days = Math.round((parseISODate(f.expiresOn).getTime() - now.getTime()) / 86400000);
        evts.push({
          id: f.id,
          title: f.name,
          date: f.expiresOn,
          type: "expiry",
          tone: days < 0 ? "expired" : days <= 30 ? "soon" : "ok",
          icon: "file-text",
        });
      }
    }

    // Group by date
    const byDate: Record<string, CalendarEvent[]> = {};
    for (const e of evts) {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    }

    return { events: evts, eventsByDate: byDate };
  }, [reminders, files, now]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayISO = toISODate(now);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] ?? [] : [];

  return (
    <View style={styles.container}>
      {/* Month nav */}
      <View style={styles.header}>
        <Pressable onPress={prevMonth} style={styles.navBtn} accessibilityLabel="Previous month">
          <Feather name="chevron-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
        <Pressable onPress={nextMonth} style={styles.navBtn} accessibilityLabel="Next month">
          <Feather name="chevron-right" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {/* Day headers */}
      <View style={styles.dayRow}>
        {DAYS.map((d) => (
          <Text key={d} style={styles.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.weekRow}>
          {w.map((d, di) => {
            if (d === null) return <View key={di} style={styles.dayCell} />;
            const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isToday = iso === todayISO;
            const isSelected = iso === selectedDate;
            const dayEvents = eventsByDate[iso] ?? [];
            const hasReminder = dayEvents.some((e) => e.type === "reminder");
            const hasExpiry = dayEvents.some((e) => e.type === "expiry");
            const hasSoon = dayEvents.some((e) => e.tone === "soon" || e.tone === "expired");

            return (
              <Pressable
                key={di}
                onPress={() => setSelectedDate(iso === selectedDate ? null : iso)}
                style={[
                  styles.dayCell,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                ]}
                accessibilityLabel={`${MONTHS[month]} ${d}`}
              >
                <Text
                  style={[
                    styles.dayNum,
                    isToday && styles.todayNum,
                    isSelected && styles.selectedNum,
                  ]}
                >
                  {d}
                </Text>
                {dayEvents.length > 0 && (
                  <View style={styles.dots}>
                    {hasReminder && (
                      <View style={[styles.dot, hasSoon && styles.dotSoon]} />
                    )}
                    {hasExpiry && (
                      <View style={[styles.dot, styles.dotExpiry]} />
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* Selected day events */}
      {selectedDate && (
        <View style={styles.eventsCard}>
          <Text style={styles.eventsTitle}>
            {formatDate(parseISODate(selectedDate).getTime())}
          </Text>
          {selectedEvents.length === 0 ? (
            <Text style={styles.noEvents}>Nothing scheduled</Text>
          ) : (
            <ScrollView style={{ maxHeight: 200 }}>
              {selectedEvents.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => e.type === "reminder" ? onPressReminder(e.id) : onPressFile(e.id)}
                  style={({ pressed }) => [styles.eventRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.eventIcon, e.tone === "soon" && styles.eventIconSoon]}>
                    <Feather name={e.icon as any} size={14} color={e.tone === "soon" ? colors.warnInk : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{e.title}</Text>
                    <Text style={styles.eventSub}>
                      {e.type === "reminder" ? (e.who ? `${e.who} · ` : "") + (e.amount || "Due") : "Expires"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { marginRight: 6 }]} />
          <Text style={styles.legendText}>Bill / Reminder</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.dotExpiry, { marginRight: 6 }]} />
          <Text style={styles.legendText}>Document expiry</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  navBtn: {
    padding: 8,
  },
  monthLabel: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
  },
  dayRow: {
    flexDirection: "row",
  },
  dayHeader: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    paddingVertical: 6,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  todayCell: {
    backgroundColor: colors.primarySoft,
  },
  selectedCell: {
    backgroundColor: colors.primary,
  },
  dayNum: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
  },
  todayNum: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  selectedNum: {
    color: colors.onPrimary,
    fontFamily: fonts.semibold,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  dotSoon: {
    backgroundColor: colors.warnInk,
  },
  dotExpiry: {
    backgroundColor: colors.accent,
  },
  eventsCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  eventsTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 8,
  },
  noEvents: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 12,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  eventIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eventIconSoon: {
    backgroundColor: colors.warnSoft,
  },
  eventTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
  },
  eventSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
});

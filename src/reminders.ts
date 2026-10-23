import * as Notifications from "expo-notifications";
import { PlannedCustom, PlannedReminder, ReminderEntry, planCustomReminders, planReminders } from "./reminders-plan";
import { Reminder, Settings } from "./types";

const CHANNEL = "expiry";
const CATEGORY = "reminder";
const MAX_SCHEDULED = 100;

/** Call once at startup: lets reminders appear even while the app is open. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureCategory() {
  // Buttons on reminder notifications. They open the app (behind the unlock) because
  // changing saved data silently in the background would bypass the lock.
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: "snooze", buttonTitle: "Snooze 1 day", options: { opensAppToForeground: true } },
    { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: true } },
  ]);
}

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Reminders and document expiry",
    importance: Notifications.AndroidImportance.HIGH,
    // PRIVATE: on the lock screen Android can hide the text until the phone is unlocked
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks for notification permission (Android 13+). Returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel(); // Android only shows the prompt once a channel exists
  let p = await Notifications.getPermissionsAsync();
  if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

function when(offset: number) {
  return offset === 0 ? "today" : offset === 1 ? "tomorrow" : `in ${offset} days`;
}

function content(r: PlannedReminder, showNames: boolean) {
  return {
    title: showNames ? `${r.name} expires ${when(r.offset)}` : `A document expires ${when(r.offset)}`,
    body: showNames ? r.folderLabel : "Open DocVault to see which one.",
    data: { fileId: r.fileId, folderId: r.folderId },
  };
}

function customContent(r: PlannedCustom, showNames: boolean) {
  const rem = r.reminder;
  const money = rem.amount?.trim();
  const when = r.snoozed ? "snoozed reminder" : r.offset === 0 ? "due today" : r.offset === 1 ? "due tomorrow" : `due in ${r.offset} days`;
  const note = rem.note?.trim().replace(/\s+/g, " ");
  return {
    title: showNames ? rem.title : "A reminder is due",
    body: showNames ? [money, when, note && note.length > 70 ? note.slice(0, 67) + "…" : note].filter(Boolean).join(" · ") : "Open DocVault to see details.",
    data: { reminderId: rem.id, occurrence: r.occurrence },
    categoryIdentifier: CATEGORY,
  };
}

type Note = { fireAt: Date; content: Notifications.NotificationContentInput };

let chain: Promise<unknown> = Promise.resolve();

/** Rebuilds every scheduled reminder from the current files. Safe to call often. */
export function syncReminders(entries: ReminderEntry[], reminders: Reminder[], settings: Settings): Promise<void> {
  const run = chain.then(async () => {
    await ensureChannel();
    await ensureCategory();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!settings.remindersEnabled || !(await hasReminderPermission())) return;
    const notes: Note[] = [
      ...planReminders(entries, settings.remindOffsets, new Date(), MAX_SCHEDULED).map((r) => ({
        fireAt: r.fireAt,
        content: content(r, settings.notifyNames),
      })),
      ...planCustomReminders(reminders).map((r) => ({ fireAt: r.fireAt, content: customContent(r, settings.notifyNames) })),
    ]
      .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
      .slice(0, MAX_SCHEDULED); // soonest first; the rest are scheduled on a later app start
    for (const n of notes) {
      await Notifications.scheduleNotificationAsync({
        content: n.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: CHANNEL },
      });
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

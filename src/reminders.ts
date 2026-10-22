import * as Notifications from "expo-notifications";
import { PlannedReminder, ReminderEntry, planReminders } from "./reminders-plan";
import { Settings } from "./types";

const CHANNEL = "expiry";

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

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Document expiry",
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

let chain: Promise<unknown> = Promise.resolve();

/** Rebuilds every scheduled reminder from the current files. Safe to call often. */
export function syncReminders(entries: ReminderEntry[], settings: Settings): Promise<void> {
  const run = chain.then(async () => {
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!settings.remindersEnabled || !(await hasReminderPermission())) return;
    for (const r of planReminders(entries, settings.remindOffsets)) {
      await Notifications.scheduleNotificationAsync({
        content: content(r, settings.notifyNames),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL },
      });
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

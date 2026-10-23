import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import { cardLines } from "./emergency-card";
import type { Profile } from "./types";

export { BLOOD_GROUPS, cardLines } from "./emergency-card";

type CardInput = {
  name: string;
  lines: { label: string; value: string }[];
  footer: string;
  color: string;
  photo?: string;
};

const native = requireOptionalNativeModule<{
  isSupported(): boolean;
  preview(card: CardInput): Promise<string>;
  apply(card: CardInput): Promise<number>;
  remove(): Promise<void>;
}>("LockScreenCard");

const toCard = (p: Profile, color: string, photo?: string): CardInput => ({
  name: p.name.trim(),
  lines: cardLines(p),
  footer: p.note?.trim() ?? "",
  color,
  photo: photo || undefined,
});

export const lockCardSupported = () => native?.isSupported() ?? false;
export const previewLockCard = (p: Profile, color: string, photo?: string) => native?.preview(toCard(p, color, photo)) ?? Promise.resolve(null);
export const applyLockCard = async (p: Profile, color: string, photo?: string) => {
  await native?.apply(toCard(p, color, photo));
};
export const removeLockCard = async () => {
  await native?.remove();
};

const CHANNEL = "emergency-card";
const NOTE_ID = "emergency-card";

/** A quiet notification that Android keeps on the lock screen, readable without unlocking. */
export async function showCardNotification(p: Profile) {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Emergency card",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    enableVibrate: false,
    showBadge: false,
  });
  const body = cardLines(p)
    .map((l) => `${l.label.replace("Call · ", "")}: ${l.value}`)
    .concat(p.note?.trim() ? [p.note.trim()] : [])
    .join("\n");
  await Notifications.scheduleNotificationAsync({
    identifier: NOTE_ID,
    content: { title: `In case of emergency: ${p.name.trim()}`, body, sticky: true, autoDismiss: false, data: { emergencyCard: true } },
    trigger: { channelId: CHANNEL },
  });
}

export const hideCardNotification = () => Notifications.dismissNotificationAsync(NOTE_ID).catch(() => undefined);

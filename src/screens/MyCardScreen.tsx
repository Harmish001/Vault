import React, { useEffect, useState } from "react";
import { Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { useLock } from "../lock/LockProvider";
import { requestReminderPermission } from "../reminders";
import {
  BLOOD_GROUPS,
  applyLockCard,
  cardLines,
  hideCardNotification,
  lockCardSupported,
  previewLockCard,
  removeLockCard,
  showCardNotification,
} from "../emergency";
import { colors, fonts, radius } from "../theme";
import type { EmergencyContact, Profile } from "../types";
import { folderPath, uid } from "../utils";
import { FolderPicker } from "../components/FolderPicker";
import { Button, IconButton, PromptModal, ScreenHeader, SheetModal } from "../components/ui";

const CARD_COLOR = colors.danger;
const EMPTY: Profile = { name: "", contacts: [], showMedical: true, showAddress: true };
const MAX_CONTACTS = 3;

type TextKey = "name" | "phone" | "email" | "address" | "pincode" | "dob" | "allergies" | "conditions" | "medicines" | "note";
const TEXT: Record<TextKey, { title: string; placeholder: string; keyboard?: "phone-pad" | "email-address" | "number-pad"; multiline?: boolean; suggestions?: string[] }> = {
  name: { title: "Your name", placeholder: "Full name, as on your documents" },
  phone: { title: "Your mobile number", placeholder: "e.g. 98765 43210", keyboard: "phone-pad" },
  email: { title: "Your email", placeholder: "name@example.com", keyboard: "email-address" },
  address: { title: "Your address", placeholder: "House, street, area, city", multiline: true },
  pincode: { title: "PIN code", placeholder: "6 digits", keyboard: "number-pad" },
  dob: { title: "Date of birth", placeholder: "DD/MM/YYYY", keyboard: "number-pad" },
  allergies: { title: "Allergies", placeholder: "e.g. Penicillin, peanuts", suggestions: ["None known"] },
  conditions: { title: "Medical conditions", placeholder: "e.g. Diabetes, asthma", suggestions: ["None"] },
  medicines: { title: "Regular medicines", placeholder: "e.g. Metformin 500 mg" },
  note: {
    title: "Message for whoever finds this phone",
    placeholder: "e.g. Please call my family. Reward if returned.",
    suggestions: ["Please call my family", "Reward if returned"],
  },
};

/** The owner's emergency card (lock screen) and the details autofill offers. */
export default function MyCardScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "MyCard">) {
  const { profile, saveProfile, folders } = useVault();
  const { settings, update } = useSettings();
  const { runExternal } = useLock();
  const insets = useSafeAreaInsets();
  const p = profile ?? EMPTY;
  const [editing, setEditing] = useState<TextKey | null>(null);
  const [contact, setContact] = useState<{ c?: EmergencyContact } | null>(null);
  const [pickFolder, setPickFolder] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLock = lockCardSupported();
  const ready = !!p.name.trim() && cardLines(p).length > 0;

  useEffect(() => {
    if (!canLock || !p.name.trim()) return setPreview(null);
    let live = true;
    previewLockCard(p, CARD_COLOR, settings.lockCardPhoto)
      .then((uri) => live && setPreview(uri))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [canLock, p, settings.lockCardPhoto]);

  /** Saves, then redraws whatever is already on the lock screen. */
  async function save(patch: Partial<Profile>, photo = settings.lockCardPhoto) {
    const next = { ...p, ...patch };
    await saveProfile(next);
    try {
      if (settings.lockCardWallpaper) await applyLockCard(next, CARD_COLOR, photo);
      if (settings.lockCardNotification) await showCardNotification(next);
    } catch {
      ToastAndroid.show("Saved, but the lock screen couldn't be updated", ToastAndroid.SHORT);
    }
  }

  async function toggleWallpaper(on: boolean) {
    if (!on) {
      setBusy(true);
      await removeLockCard().catch(() => undefined);
      await update({ lockCardWallpaper: false });
      setBusy(false);
      return;
    }
    if (!ready) return Alert.alert("Add a few details first", "Add your name and at least one emergency contact, so the card has something to show.");
    Alert.alert(
      "Put the card on your lock screen?",
      "DocVault replaces your lock-screen wallpaper with this card. Your home-screen wallpaper stays as it is. Turn this off later and the lock screen shows your home-screen wallpaper.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Put it on",
          onPress: async () => {
            setBusy(true);
            try {
              await applyLockCard(p, CARD_COLOR, settings.lockCardPhoto);
              await update({ lockCardWallpaper: true });
              ToastAndroid.show("Lock the phone to see your card", ToastAndroid.SHORT);
            } catch {
              Alert.alert("Couldn't change the lock screen", "This phone doesn't let apps set the lock-screen wallpaper.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  async function toggleNotification(on: boolean) {
    if (!on) {
      await hideCardNotification();
      return update({ lockCardNotification: false });
    }
    if (!ready) return Alert.alert("Add a few details first", "Add your name and at least one emergency contact.");
    if (!(await requestReminderPermission())) {
      return Alert.alert("Notifications are off", "Turn on notifications for DocVault in Android settings to show the card on the lock screen.");
    }
    await showCardNotification(p);
    await update({ lockCardNotification: true });
  }

  async function choosePhoto() {
    const res = await runExternal(() => DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true })).catch(() => null);
    const picked = res && !res.canceled ? res.assets?.[0] : null;
    if (!picked) return;
    const dest = `${FileSystem.documentDirectory}lock-card-photo-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: picked.uri, to: dest });
    if (settings.lockCardPhoto) FileSystem.deleteAsync(settings.lockCardPhoto, { idempotent: true }).catch(() => undefined);
    await update({ lockCardPhoto: dest });
    if (settings.lockCardWallpaper) await save({}, dest);
  }

  async function clearPhoto() {
    if (settings.lockCardPhoto) FileSystem.deleteAsync(settings.lockCardPhoto, { idempotent: true }).catch(() => undefined);
    await update({ lockCardPhoto: undefined });
    if (settings.lockCardWallpaper) await save({}, undefined);
  }

  async function openAndroidEmergencyInfo() {
    try {
      await IntentLauncher.startActivityAsync("android.settings.EDIT_EMERGENCY_INFO");
    } catch {
      Alert.alert(
        "Open it from Settings",
        "Open the phone's Settings → Safety & emergency → Medical information (on some phones: Settings → About phone → Emergency information)."
      );
    }
  }

  const field = (k: TextKey, value?: string) => (
    <FieldRow key={k} label={TEXT[k].title} value={value} placeholder={TEXT[k].placeholder} onPress={() => setEditing(k)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="My Card"
        onBack={() => navigation.goBack()}
        right={
          <IconButton
            icon="settings"
            label="Settings"
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12) + 110, gap: 18 }}>
        <View style={styles.hero}>
          <Feather name="heart" size={22} color={CARD_COLOR} />
          <Text style={styles.heroText}>
            If you're hurt or lose your phone, the person holding it can call your family and see your address, straight from the lock screen. Document numbers are never shown there.
          </Text>
        </View>

        <Section title="About you">
          {field("name", p.name)}
          {field("phone", p.phone)}
          {field("email", p.email)}
          {field("address", p.address)}
          {field("pincode", p.pincode)}
          {field("dob", p.dob)}
          <FieldRow
            label="Your folder"
            value={p.folderId && folders.some((f) => f.id === p.folderId) ? folderPath(folders, p.folderId) : undefined}
            placeholder="Pick the folder with your own documents"
            onPress={() => setPickFolder(true)}
          />
        </Section>

        <Section title="In an emergency">
          {p.contacts.map((c) => (
            <FieldRow key={c.id} label={c.relation || "Contact"} value={`${c.name}  ${c.phone}`} onPress={() => setContact({ c })} icon="phone" />
          ))}
          {p.contacts.length < MAX_CONTACTS ? (
            <View style={styles.block}>
              <Button label={p.contacts.length ? "Add another contact" : "Add an emergency contact"} kind="secondary" onPress={() => setContact({})} />
            </View>
          ) : null}
          {field("allergies", p.allergies)}
          {field("conditions", p.conditions)}
          {field("medicines", p.medicines)}
          {field("note", p.note)}
        </Section>

        <Section title="On the lock screen">
          {canLock && preview ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: preview }} style={styles.preview} accessibilityLabel="Preview of the lock-screen card" />
            </View>
          ) : null}
          <ToggleRow
            title="Card as lock-screen notification"
            body="Displays directly on top of your lock screen without modifying wallpaper. Readable without unlocking."
            value={!!settings.lockCardNotification}
            onChange={toggleNotification}
          />
          {canLock ? (
            <>
              <ToggleRow
                title="Card as lock-screen wallpaper"
                body="Overlays your emergency card on top of your current lock screen wallpaper."
                value={!!settings.lockCardWallpaper}
                disabled={busy}
                onChange={toggleWallpaper}
              />
              <View style={[styles.block, { flexDirection: "row", gap: 10 }]}>
                <Button label={settings.lockCardPhoto ? "Change photo" : "Custom background photo"} kind="secondary" onPress={choosePhoto} style={{ flex: 1 }} />
                {settings.lockCardPhoto ? <Button label="Reset to wallpaper" kind="secondary" onPress={clearPhoto} /> : null}
              </View>
            </>
          ) : null}
          <ToggleRow title="Show medical details" body="Allergies, conditions and medicines." value={p.showMedical} onChange={(v) => save({ showMedical: v })} />
          <ToggleRow
            title="Show my address"
            body="Shown on your emergency card so whoever finds your phone can return it."
            value={p.showAddress ?? true}
            onChange={(v) => save({ showAddress: v })}
          />
          <View style={styles.block}>
            <Button label="Also fill Android's emergency info" kind="secondary" onPress={openAndroidEmergencyInfo} />
            <Text style={styles.hint}>Paramedics know to look there: Emergency call → Emergency information.</Text>
          </View>
        </Section>

        <Pressable onPress={() => navigation.navigate("Settings")} style={styles.autofill} accessibilityRole="button">
          <Feather name="edit-3" size={18} color={colors.primary} />
          <Text style={styles.autofillText}>
            Your name, mobile, email, address and date of birth can also fill forms in other apps. Turn on Autofill in Settings.
          </Text>
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>

      <PromptModal
        visible={editing !== null}
        title={editing ? TEXT[editing].title : ""}
        initial={editing ? (p[editing] as string | undefined) ?? "" : ""}
        placeholder={editing ? TEXT[editing].placeholder : undefined}
        keyboardType={editing ? TEXT[editing].keyboard : undefined}
        multiline={editing ? TEXT[editing].multiline : false}
        suggestions={editing ? TEXT[editing].suggestions : undefined}
        allowEmpty={editing !== "name"}
        confirmLabel="Save"
        onCancel={() => setEditing(null)}
        onSubmit={(v) => {
          if (editing) save({ [editing]: v.trim() || undefined } as Partial<Profile>);
          setEditing(null);
        }}
      />
      <ContactModal
        state={contact}
        onClose={() => setContact(null)}
        onSave={(c) => {
          const exists = p.contacts.some((x) => x.id === c.id);
          save({ contacts: exists ? p.contacts.map((x) => (x.id === c.id ? c : x)) : [...p.contacts, c] });
          setContact(null);
        }}
        onDelete={(c) => {
          save({ contacts: p.contacts.filter((x) => x.id !== c.id) });
          setContact(null);
        }}
      />
      <FolderPicker
        visible={pickFolder}
        title="Your folder"
        confirmLabel="Use"
        onClose={() => setPickFolder(false)}
        onPick={(id) => {
          setPickFolder(false);
          save({ folderId: id });
        }}
      />
    </View>
  );
}

function ContactModal(props: {
  state: { c?: EmergencyContact } | null;
  onClose: () => void;
  onSave: (c: EmergencyContact) => void;
  onDelete: (c: EmergencyContact) => void;
}) {
  const existing = props.state?.c;
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (props.state) {
      setName(existing?.name ?? "");
      setRelation(existing?.relation ?? "");
      setPhone(existing?.phone ?? "");
    }
  }, [props.state, existing]);
  const ok = name.trim() && phone.replace(/\D/g, "").length >= 6;

  return (
    <SheetModal visible={props.state !== null} onClose={props.onClose} position="top">
      <Text style={styles.modalTitle}>{existing ? "Edit contact" : "Emergency contact"}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" autoFocus />
      <TextInput
        value={relation}
        onChangeText={setRelation}
        placeholder="Relation, e.g. Wife, Brother, Doctor"
        placeholderTextColor={colors.muted}
        style={[styles.input, { marginTop: 10 }]}
        autoCapitalize="words"
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone number"
        placeholderTextColor={colors.muted}
        style={[styles.input, { marginTop: 10 }]}
        keyboardType="phone-pad"
      />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        {existing ? (
          <Button label="Remove" kind="danger" onPress={() => props.onDelete(existing)} style={{ flex: 1 }} />
        ) : (
          <Button label="Cancel" kind="secondary" onPress={props.onClose} style={{ flex: 1 }} />
        )}
        <Button
          label="Save"
          disabled={!ok}
          onPress={() => props.onSave({ id: existing?.id ?? uid(), name: name.trim(), relation: relation.trim(), phone: phone.trim() })}
          style={{ flex: 1 }}
        />
      </View>
    </SheetModal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function FieldRow(props: { label: string; value?: string; placeholder?: string; icon?: React.ComponentProps<typeof Feather>["name"]; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="button"
      accessibilityLabel={`${props.label}: ${props.value || "not set"}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{props.label}</Text>
        <Text style={props.value ? styles.value : styles.placeholder} numberOfLines={2}>
          {props.value || props.placeholder}
        </Text>
      </View>
      <Feather name={props.icon ?? "edit-2"} size={16} color={colors.muted} />
    </Pressable>
  );
}

function ToggleRow(props: { title: string; body: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.block, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{props.title}</Text>
        <Text style={styles.hint}>{props.body}</Text>
      </View>
      <Switch value={props.value} disabled={props.disabled} onValueChange={props.onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

const screen = Dimensions.get("screen");

const styles = StyleSheet.create({
  hero: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, alignItems: "flex-start" },
  heroText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.dangerInk },
  section: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden" },
  block: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  value: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 2 },
  placeholder: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: 2, fontStyle: "italic" },
  toggleTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { minWidth: 52, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  previewWrap: { alignItems: "center", paddingTop: 16 },
  preview: { width: 170, aspectRatio: screen.width / screen.height, borderRadius: radius.md, backgroundColor: colors.primaryDark },
  autofill: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  autofillText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.primaryDark },
  modalTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink, marginBottom: 10 },
  input: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
});

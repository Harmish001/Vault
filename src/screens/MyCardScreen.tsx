import React, { useEffect, useState } from "react";
import { Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import QRCode from "react-native-qrcode-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { useLock } from "../lock/LockProvider";
import { requestReminderPermission } from "../reminders";
import {
  BLOOD_GROUPS,
  applyLockCard,
  buildEmergencyQrText,
  cardLines,
  hideCardNotification,
  lockCardSupported,
  previewLockCard,
  removeLockCard,
  showCardNotification,
} from "../emergency";
import { colors, fonts, radius } from "../theme";
import type { EmergencyContact, LockCardMode, LockCardSize, Profile } from "../types";
import { folderPath, uid } from "../utils";
import { FolderPicker } from "../components/FolderPicker";
import { Button, IconButton, PromptModal, ScreenHeader, SheetModal } from "../components/ui";

const CARD_COLOR = colors.danger;
const EMPTY: Profile = { name: "", contacts: [], showMedical: true, showAddress: true };
const MAX_CONTACTS = 3;

const PREDEFINED_RELATIONS = [
  "Mom",
  "Dad",
  "Wife",
  "Husband",
  "Partner",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Parent",
  "Child",
  "Doctor",
  "Friend",
  "Neighbor",
  "Colleague",
  "Caregiver",
  "Relative",
  "Other",
];

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
  const [relationPicker, setRelationPicker] = useState<{
    contact: { id: string; name: string; phone: string; relation: string };
    isNew: boolean;
  } | null>(null);
  const [pickFolder, setPickFolder] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canLock = lockCardSupported();
  const ready = !!p.name.trim() && cardLines(p).length > 0;

  const cardMode: LockCardMode = settings.lockCardMode ?? "qr";
  const cardSize: LockCardSize = settings.lockCardSize ?? "medium";

  useEffect(() => {
    if (!canLock || !p.name.trim()) return setPreview(null);
    let live = true;
    previewLockCard(p, CARD_COLOR, settings.lockCardPhoto, cardMode, cardSize)
      .then((uri) => live && setPreview(uri))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [canLock, p, settings.lockCardPhoto, cardMode, cardSize]);

  /** Saves, then redraws whatever is already on the lock screen. */
  async function save(patch: Partial<Profile>, photo = settings.lockCardPhoto, mode = cardMode, size = cardSize) {
    const next = { ...p, ...patch };
    await saveProfile(next);
    try {
      if (settings.lockCardWallpaper) await applyLockCard(next, CARD_COLOR, photo, mode, size);
      if (settings.lockCardNotification) await showCardNotification(next);
    } catch {
      ToastAndroid.show("Saved, but the lock screen couldn't be updated", ToastAndroid.SHORT);
    }
  }

  async function changeCardMode(mode: LockCardMode) {
    await update({ lockCardMode: mode });
    if (settings.lockCardWallpaper) {
      await applyLockCard(p, CARD_COLOR, settings.lockCardPhoto, mode, cardSize).catch(() => undefined);
    }
  }

  async function changeCardSize(size: LockCardSize) {
    await update({ lockCardSize: size });
    if (settings.lockCardWallpaper) {
      await applyLockCard(p, CARD_COLOR, settings.lockCardPhoto, cardMode, size).catch(() => undefined);
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
      cardMode === "qr" ? "Put the emergency QR code on your lock screen?" : "Put the emergency card on your lock screen?",
      cardMode === "qr"
        ? "DocVault replaces your lock-screen wallpaper with an emergency QR code card. Your home-screen wallpaper stays as it is. Anyone scanning the QR code with any camera can view your emergency contacts and medical info."
        : "DocVault replaces your lock-screen wallpaper with an emergency contact card. Your home-screen wallpaper stays as it is. Anyone can read your emergency details directly on the lock screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Put it on",
          onPress: async () => {
            setBusy(true);
            try {
              await applyLockCard(p, CARD_COLOR, settings.lockCardPhoto, cardMode, cardSize);
              await update({ lockCardWallpaper: true });
              ToastAndroid.show("Lock the phone to see your emergency card", ToastAndroid.SHORT);
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
    if (settings.lockCardWallpaper) await save({}, dest, cardMode, cardSize);
  }

  async function clearPhoto() {
    if (settings.lockCardPhoto) FileSystem.deleteAsync(settings.lockCardPhoto, { idempotent: true }).catch(() => undefined);
    await update({ lockCardPhoto: undefined });
    if (settings.lockCardWallpaper) await save({}, undefined, cardMode, cardSize);
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

  async function pickContactFromDevice() {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== Contacts.PermissionStatus.GRANTED) {
        Alert.alert(
          "Contacts permission",
          "Permission to access contacts is required to pick a contact. You can also enter contact details manually.",
          [
            { text: "Enter manually", onPress: () => setContact({}) },
            { text: "Cancel", style: "cancel" },
          ]
        );
        return;
      }

      const res = await Contacts.presentContactPickerAsync();
      if (!res) return;

      const rawName =
        [res.firstName, res.middleName, res.lastName].filter(Boolean).join(" ").trim() ||
        res.name?.trim() ||
        "";
      const phones = (res.phoneNumbers || []).map((p) => p.number?.trim()).filter((n): n is string => !!n);

      if (phones.length === 0) {
        Alert.alert(
          "No phone number",
          `${rawName || "This contact"} doesn't have a phone number. Please enter the number manually.`,
          [
            {
              text: "Enter manually",
              onPress: () => setContact({ c: { id: uid(), name: rawName, relation: "", phone: "" } }),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
        return;
      }

      const selectedPhone = phones[0];
      setRelationPicker({
        contact: { id: uid(), name: rawName, phone: selectedPhone, relation: "" },
        isNew: true,
      });
    } catch {
      Alert.alert("Contacts", "Couldn't open contact picker. You can enter contact details manually.", [
        { text: "Enter manually", onPress: () => setContact({}) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  function handleSelectRelation(relation: string) {
    if (!relationPicker) return;
    const { contact: c, isNew } = relationPicker;
    const updated: EmergencyContact = { ...c, relation: relation.trim() };
    if (isNew) {
      save({ contacts: [...p.contacts, updated] });
      ToastAndroid.show(`Added ${updated.name || "contact"}`, ToastAndroid.SHORT);
    } else {
      save({ contacts: p.contacts.map((x) => (x.id === updated.id ? updated : x)) });
      ToastAndroid.show(`Updated relation for ${updated.name}`, ToastAndroid.SHORT);
    }
    setRelationPicker(null);
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
            If you're hurt or lose your phone, anyone can scan the emergency QR code or view the card on your lock screen to see your emergency contacts and medical info.
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
            <View style={[styles.block, { flexDirection: "row", gap: 10 }]}>
              <Button
                label={p.contacts.length ? "Pick contact" : "Add emergency contact"}
                kind="primary"
                onPress={pickContactFromDevice}
                style={{ flex: 1 }}
              />
              <Button
                label="Manual"
                kind="secondary"
                onPress={() => setContact({})}
              />
            </View>
          ) : null}
          {field("allergies", p.allergies)}
          {field("conditions", p.conditions)}
          {field("medicines", p.medicines)}
          {field("note", p.note)}
        </Section>

        <Section title="On the lock screen">
          {/* Live Phone Lockscreen Preview */}
          <LockscreenCardPreview
            profile={p}
            mode={cardMode}
            size={cardSize}
            photo={settings.lockCardPhoto}
          />

          <View style={styles.block}>
            <Text style={styles.selectorLabel}>Lock screen card type</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                onPress={() => changeCardMode("qr")}
                style={[styles.segmentBtn, cardMode === "qr" && styles.segmentBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: cardMode === "qr" }}
              >
                <Feather name="maximize" size={15} color={cardMode === "qr" ? colors.surface : colors.ink} />
                <Text style={[styles.segmentText, cardMode === "qr" && styles.segmentTextActive]}>QR Code</Text>
              </Pressable>
              <Pressable
                onPress={() => changeCardMode("details")}
                style={[styles.segmentBtn, cardMode === "details" && styles.segmentBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: cardMode === "details" }}
              >
                <Feather name="file-text" size={15} color={cardMode === "details" ? colors.surface : colors.ink} />
                <Text style={[styles.segmentText, cardMode === "details" && styles.segmentTextActive]}>Card with details</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.block, { paddingTop: 0 }]}>
            <Text style={styles.selectorLabel}>Card size</Text>
            <View style={styles.segmentedControl}>
              {(["small", "medium", "large"] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => changeCardSize(s)}
                  style={[styles.segmentBtn, cardSize === s && styles.segmentBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cardSize === s }}
                >
                  <Text style={[styles.segmentText, cardSize === s && styles.segmentTextActive]}>
                    {s === "small" ? "Small" : s === "medium" ? "Medium (Default)" : "Large"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <ToggleRow
            title="Card as lock-screen notification"
            body="Displays directly on top of your lock screen without modifying wallpaper. Readable without unlocking."
            value={!!settings.lockCardNotification}
            onChange={toggleNotification}
          />
          {canLock ? (
            <>
              <ToggleRow
                title={cardMode === "qr" ? "Emergency QR code as wallpaper" : "Emergency card as wallpaper"}
                body={
                  cardMode === "qr"
                    ? "Overlays an emergency QR code on your lock screen wallpaper that any camera can scan."
                    : "Overlays an emergency contact card on your lock screen wallpaper with your details."
                }
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
        onOpenRelationSheet={(current) => {
          setRelationPicker({
            contact: current,
            isNew: !p.contacts.some((x) => x.id === current.id),
          });
        }}
        onPickFromDevice={async () => {
          try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status !== Contacts.PermissionStatus.GRANTED) return null;
            const res = await Contacts.presentContactPickerAsync();
            if (!res) return null;
            const rawName =
              [res.firstName, res.middleName, res.lastName].filter(Boolean).join(" ").trim() ||
              res.name?.trim() ||
              "";
            const phones = (res.phoneNumbers || []).map((p) => p.number?.trim()).filter((n): n is string => !!n);
            return { name: rawName, phone: phones[0] || "" };
          } catch {
            return null;
          }
        }}
      />
      <RelationPickerSheet
        state={relationPicker}
        onClose={() => setRelationPicker(null)}
        onSelect={handleSelectRelation}
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

/** Realistic phone mockup rendering the live emergency card in selected size and mode. */
function LockscreenCardPreview({
  profile,
  mode,
  size,
  photo,
}: {
  profile: Profile;
  mode: LockCardMode;
  size: LockCardSize;
  photo?: string;
}) {
  const p = profile;
  const firstContact = p.contacts.find((c) => c.phone.trim());
  const primaryContact = firstContact
    ? `${firstContact.relation.trim() ? firstContact.relation.trim() + " · " : ""}${firstContact.name.trim()}  ${firstContact.phone.trim()}`.trim()
    : "";

  const lines = cardLines(p);
  const qrPayload = buildEmergencyQrText(p);

  // Card dimensions based on size (small, medium, large)
  const cardWidth = size === "small" ? 152 : size === "medium" ? 180 : 204;
  const qrSize = size === "small" ? 54 : size === "medium" ? 72 : 92;
  const headerFontSize = size === "small" ? 7.5 : size === "medium" ? 8.5 : 10;
  const nameFontSize = size === "small" ? 10 : size === "medium" ? 12 : 14;
  const detailsNameFontSize = size === "small" ? 11 : size === "medium" ? 13 : 15;
  const textScale = size === "small" ? 0.8 : size === "medium" ? 0.95 : 1.1;

  // Max lines to show in details mode based on size
  const maxRows = size === "small" ? 3 : size === "medium" ? 4 : 6;
  const displayedLines = lines.filter((l) => l.value.trim()).slice(0, maxRows);

  return (
    <View style={styles.phoneMockupWrap}>
      <View style={styles.phoneMockup}>
        {/* Background Wallpaper */}
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1e0b12" }]} />
        )}
        <View style={styles.phoneOverlay} />

        {/* Lock icon, status bar, and clock */}
        <View style={styles.phoneStatusBar}>
          <Feather name="lock" size={11} color="rgba(255,255,255,0.85)" />
          <Text style={styles.phoneTime}>12:45</Text>
          <Text style={styles.phoneDate}>Tuesday, October 30</Text>
        </View>

        {/* Lock Screen Emergency Card */}
        <View style={styles.phoneCardContainer}>
          <View style={[styles.mockCard, { width: cardWidth }]}>
            {/* Red Accent Header */}
            <View style={[styles.mockCardHeader, { paddingVertical: size === "small" ? 4 : size === "medium" ? 5.5 : 7 }]}>
              <Text style={[styles.mockCardHeaderText, { fontSize: headerFontSize }]}>
                IN CASE OF EMERGENCY
              </Text>
            </View>

            {/* Card Body */}
            <View style={[styles.mockCardBody, { padding: size === "small" ? 6 : size === "medium" ? 8 : 10 }]}>
              {mode === "qr" ? (
                <>
                  <Text style={[styles.mockName, { fontSize: nameFontSize }]} numberOfLines={1}>
                    {p.name.trim() || "Your Name"}
                  </Text>
                  <Text style={[styles.mockSub, { fontSize: 7.5 * textScale }]}>
                    Scan QR with camera for emergency info
                  </Text>

                  {/* QR Box */}
                  <View style={[styles.mockQrBox, { padding: size === "small" ? 3 : 5 }]}>
                    <QRCode value={qrPayload || "DOCVAULT"} size={qrSize} />
                  </View>

                  {primaryContact ? (
                    <Text style={[styles.mockPrimary, { fontSize: 8.5 * textScale }]} numberOfLines={1}>
                      📞 {primaryContact}
                    </Text>
                  ) : null}

                  {p.note?.trim() ? (
                    <Text style={[styles.mockNote, { fontSize: 7.5 * textScale }]} numberOfLines={1}>
                      {p.note.trim()}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[styles.mockName, { fontSize: detailsNameFontSize, marginBottom: 4 }]} numberOfLines={1}>
                    {p.name.trim() || "Your Name"}
                  </Text>

                  {displayedLines.length > 0 ? (
                    displayedLines.map((line, idx) => (
                      <View key={idx} style={styles.mockDetailRow}>
                        <Text style={[styles.mockDetailLabel, { fontSize: 7 * textScale }]}>
                          {line.label.toUpperCase()}
                        </Text>
                        <Text style={[styles.mockDetailValue, { fontSize: 8.5 * textScale }]} numberOfLines={1}>
                          {line.value}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.mockDetailRow}>
                      <Text style={[styles.mockDetailLabel, { fontSize: 7 * textScale }]}>EMERGENCY CONTACT</Text>
                      <Text style={[styles.mockDetailValue, { fontSize: 8.5 * textScale }]}>Add contacts above</Text>
                    </View>
                  )}

                  {p.note?.trim() && size !== "small" ? (
                    <Text style={[styles.mockNote, { fontSize: 7.5 * textScale, marginTop: 4 }]} numberOfLines={1}>
                      {p.note.trim()}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </View>

        {/* Bottom swipe indicator */}
        <View style={styles.phoneHomeBar} />
      </View>

      <Text style={styles.phoneMockupCaption}>
        Lock screen preview ({size.charAt(0).toUpperCase() + size.slice(1)} · {mode === "qr" ? "QR Code" : "Details"})
      </Text>
    </View>
  );
}

function ContactModal(props: {
  state: { c?: EmergencyContact } | null;
  onClose: () => void;
  onSave: (c: EmergencyContact) => void;
  onDelete: (c: EmergencyContact) => void;
  onOpenRelationSheet: (contact: { id: string; name: string; phone: string; relation: string }) => void;
  onPickFromDevice: () => Promise<{ name: string; phone: string } | null>;
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

  async function handlePickContact() {
    const picked = await props.onPickFromDevice();
    if (picked) {
      if (picked.name) setName(picked.name);
      if (picked.phone) setPhone(picked.phone);
    }
  }

  return (
    <SheetModal visible={props.state !== null} onClose={props.onClose} position="top">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={styles.modalTitle}>{existing ? "Edit contact" : "Emergency contact"}</Text>
        <Pressable
          onPress={handlePickContact}
          style={({ pressed }) => [styles.pickContactBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Pick from contacts"
        >
          <Feather name="book-open" size={14} color={colors.primary} />
          <Text style={styles.pickContactBtnText}>Pick contact</Text>
        </Pressable>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="words"
        autoFocus={!existing}
      />

      <Pressable
        onPress={() => {
          props.onClose();
          props.onOpenRelationSheet({
            id: existing?.id ?? uid(),
            name: name.trim(),
            phone: phone.trim(),
            relation: relation.trim(),
          });
        }}
        style={styles.relationPickerTrigger}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.relationPickerLabel}>Relation</Text>
          <Text style={relation ? styles.relationPickerValue : styles.relationPickerPlaceholder}>
            {relation || "e.g. Wife, Mom, Dad, Doctor..."}
          </Text>
        </View>
        <Feather name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

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

function RelationPickerSheet(props: {
  state: { contact: { id: string; name: string; phone: string; relation: string }; isNew: boolean } | null;
  onClose: () => void;
  onSelect: (relation: string) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (props.state) setQuery("");
  }, [props.state]);

  if (!props.state) return null;

  const trimmed = query.trim();
  const filtered = PREDEFINED_RELATIONS.filter((r) =>
    r.toLowerCase().includes(trimmed.toLowerCase())
  );
  const exactMatch = PREDEFINED_RELATIONS.some(
    (r) => r.toLowerCase() === trimmed.toLowerCase()
  );
  const showCustom = trimmed.length > 0 && !exactMatch;

  return (
    <SheetModal visible={props.state !== null} onClose={props.onClose} position="bottom">
      <View style={{ maxHeight: Dimensions.get("window").height * 0.65 }}>
        <Text style={styles.modalTitle}>Select relationship</Text>
        <Text style={[styles.hint, { marginBottom: 12 }]}>
          Who is {props.state.contact.name || "this contact"} to you?
        </Text>

        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or enter relationship..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="words"
          />
          {trimmed ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, gap: 4 }}>
          {showCustom && (
            <Pressable
              style={({ pressed }) => [styles.relationItem, styles.relationItemCustom, pressed && { opacity: 0.85 }]}
              onPress={() => props.onSelect(trimmed)}
            >
              <View style={styles.relationIconWrap}>
                <Feather name="plus" size={16} color={colors.primary} />
              </View>
              <Text style={styles.relationCustomText}>Use "{trimmed}"</Text>
            </Pressable>
          )}

          {filtered.map((item) => {
            const isSelected = props.state?.contact.relation.toLowerCase() === item.toLowerCase();
            return (
              <Pressable
                key={item}
                style={({ pressed }) => [
                  styles.relationItem,
                  isSelected && styles.relationItemActive,
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
                onPress={() => props.onSelect(item)}
              >
                <Text style={[styles.relationItemText, isSelected && styles.relationItemTextActive]}>
                  {item}
                </Text>
                {isSelected && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            );
          })}

          {filtered.length === 0 && !showCustom && (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={styles.hint}>No matching relationship found</Text>
            </View>
          )}
        </ScrollView>
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
  autofill: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  autofillText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.primaryDark },
  modalTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink, marginBottom: 4 },
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
  selectorLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 30,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 24,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    textAlign: "center",
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: colors.surface,
  },
  pickContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  pickContactBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  relationPickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    marginTop: 10,
  },
  relationPickerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  relationPickerValue: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 2,
  },
  relationPickerPlaceholder: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  relationItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  relationItemActive: {
    backgroundColor: colors.surfaceAlt,
  },
  relationItemText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  relationItemTextActive: {
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  relationItemCustom: {
    backgroundColor: colors.primarySoft,
    marginBottom: 4,
  },
  relationIconWrap: {
    marginRight: 10,
  },
  relationCustomText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.primary,
  },

  /* Lockscreen Mockup Phone Preview */
  phoneMockupWrap: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
  phoneMockup: {
    width: 220,
    height: 380,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: "#2C2C30",
    backgroundColor: "#161618",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  phoneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  phoneStatusBar: {
    alignItems: "center",
    paddingTop: 18,
  },
  phoneTime: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: "#FFFFFF",
    marginTop: 2,
    letterSpacing: -0.5,
  },
  phoneDate: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: -2,
  },
  phoneCardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    paddingBottom: 20,
  },
  mockCard: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: radius.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mockCardHeader: {
    backgroundColor: CARD_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  mockCardHeaderText: {
    fontFamily: fonts.heading,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  mockCardBody: {
    alignItems: "center",
  },
  mockName: {
    fontFamily: fonts.heading,
    color: colors.ink,
    textAlign: "center",
  },
  mockSub: {
    fontFamily: fonts.body,
    color: colors.muted,
    textAlign: "center",
    marginVertical: 2,
  },
  mockQrBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    marginVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  mockPrimary: {
    fontFamily: fonts.semibold,
    color: colors.ink,
    textAlign: "center",
    marginTop: 3,
  },
  mockNote: {
    fontFamily: fonts.body,
    color: colors.muted,
    textAlign: "center",
    marginTop: 2,
  },
  mockDetailRow: {
    width: "100%",
    marginVertical: 2,
  },
  mockDetailLabel: {
    fontFamily: fonts.body,
    color: colors.muted,
    letterSpacing: 0.4,
  },
  mockDetailValue: {
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  phoneHomeBar: {
    position: "absolute",
    bottom: 8,
    width: 68,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  phoneMockupCaption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
  },
});

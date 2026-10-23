import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { requestReminderPermission } from "../reminders";
import { colors, fonts, radius } from "../theme";
import { FileField, VaultFile } from "../types";
import { parseISODate, toISODate, uid } from "../utils";
import { Button, SheetModal } from "./ui";

const LABEL_SUGGESTIONS = ["Document number", "Name on document", "Issue date", "Issued by"];

/** Sets or clears a file's expiry date, asking for notification permission when a reminder will be needed. */
export function useExpiry() {
  const { updateFile } = useVault();
  const { settings } = useSettings();

  const set = useCallback(
    async (file: VaultFile, d?: Date) => {
      await updateFile(file.id, { expiresOn: d ? toISODate(d) : undefined });
      if (d && settings.remindersEnabled && !(await requestReminderPermission())) {
        Alert.alert(
          "Reminders can't be shown",
          "Notifications are turned off for DocVault. The expiry date is saved and shown in the app. Turn on notifications in Android settings to get reminders.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings() },
          ]
        );
      }
    },
    [updateFile, settings.remindersEnabled]
  );

  const pick = useCallback(
    (file: VaultFile) =>
      DateTimePickerAndroid.open({
        value: file.expiresOn ? parseISODate(file.expiresOn) : new Date(),
        mode: "date",
        onChange: (e, d) => {
          if (e.type === "set" && d) set(file, d);
        },
      }),
    [set]
  );

  return { set, pick };
}

/** Adds a detail to a file, or edits one; pass `field` to edit. */
export function FieldModal(props: {
  state: { field?: FileField } | null;
  onClose: () => void;
  onSave: (field: FileField, existing?: FileField) => void;
  onDelete?: (f: FileField) => void;
}) {
  const existing = props.state?.field;
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    if (props.state) {
      setLabel(existing?.label ?? "");
      setValue(existing?.value ?? "");
    }
  }, [props.state, existing]);
  const ok = label.trim().length > 0 && value.trim().length > 0;

  return (
    <SheetModal visible={props.state !== null} onClose={props.onClose} position="top">
      <Text style={styles.modalTitle}>{existing ? "Edit detail" : "Add detail"}</Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Label, e.g. Document number"
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="sentences"
      />
      <View style={styles.chips}>
        {LABEL_SUGGESTIONS.map((l) => (
          <Pressable key={l} onPress={() => setLabel(l)} style={styles.chip} accessibilityRole="button">
            <Text style={styles.chipText}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Value"
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        {existing && props.onDelete ? (
          <Button label="Delete" kind="danger" onPress={() => props.onDelete?.(existing)} style={{ flex: 1 }} />
        ) : (
          <Button label="Cancel" kind="secondary" onPress={props.onClose} style={{ flex: 1 }} />
        )}
        <Button
          label="Save"
          disabled={!ok}
          onPress={() => props.onSave({ id: existing?.id ?? uid(), label: label.trim(), value: value.trim() }, existing)}
          style={{ flex: 1 }}
        />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
});

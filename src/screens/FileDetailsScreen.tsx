import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { openFile } from "../openFile";
import { colors, fonts, radius } from "../theme";
import { FileField } from "../types";
import {
  addYears,
  folderPath,
  formatDate,
  maskValue,
  parseISODate,
} from "../utils";
import { FileThumb } from "../components/Rows";
import { ExpiryBadge } from "../components/Rows";
import { FieldModal, useExpiry } from "../components/QuickDetails";
import {
  Button,
  IconButton,
  PromptModal,
  ScreenHeader,
} from "../components/ui";

export default function FileDetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "FileDetails">) {
  const { files, folders, updateFile, fileUri } = useVault();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const file = files.find((f) => f.id === route.params.fileId);

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [fieldEdit, setFieldEdit] = useState<{ field?: FileField } | null>(
    null,
  );
  const [tagPrompt, setTagPrompt] = useState(false);
  const [notesPrompt, setNotesPrompt] = useState(false);
  const expiry = useExpiry();

  useEffect(() => {
    if (!file && navigation.canGoBack()) navigation.goBack();
  }, [file, navigation]);
  if (!file) return null;

  const tags = file.tags ?? [];
  const fields = file.fields ?? [];
  const suggestions = Array.from(new Set(files.flatMap((f) => f.tags ?? [])))
    .filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()))
    .slice(0, 8);

  const setExpiry = (d?: Date) => expiry.set(file, d);

  async function copy(f: FileField) {
    await Clipboard.setStringAsync(f.value);
    setCopied(f.id);
    setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 1600);
  }

  function addTag(raw: string) {
    if (!file) return;
    const t = raw.trim().replace(/^#+/, "").slice(0, 24);
    if (t) updateFile(file.id, { tags: [...tags, t] });
  }

  function saveField(next: FileField, existing?: FileField) {
    if (!file) return;
    updateFile(file.id, {
      fields: existing
        ? fields.map((x) => (x.id === existing.id ? next : x))
        : [...fields, next],
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={file.name}
        subtitle={folderPath(folders, file.folderId)}
        onBack={() => navigation.goBack()}
        right={
          <IconButton
            icon="external-link"
            label="Open file"
            onPress={() => openFile(fileUri(file), file.mime)}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 32,
          gap: 18,
        }}
      >
        <View style={styles.hero}>
          <FileThumb
            name={file.name}
            mime={file.mime}
            uri={fileUri(file)}
            size={56}
          />
          <Text style={styles.heroText}>
            Add an expiry date to get a reminder, and save the details you copy
            most.
          </Text>
        </View>

        <Section title="Expiry">
          <View style={styles.block}>
            {file.expiresOn ? (
              <>
                <Text style={styles.big}>
                  {formatDate(parseISODate(file.expiresOn).getTime())}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ExpiryBadge iso={file.expiresOn} />
                </View>
              </>
            ) : (
              <Text style={styles.muted}>No expiry date set.</Text>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Button
                label={file.expiresOn ? "Change date" : "Set expiry date"}
                onPress={() => expiry.pick(file)}
                style={{ flex: 1 }}
              />
              {file.expiresOn ? (
                <Button
                  label="Clear"
                  kind="secondary"
                  onPress={() => setExpiry(undefined)}
                />
              ) : null}
            </View>
            <Text style={[styles.muted, { marginTop: 14 }]}>
              Or set it from today:
            </Text>
            <View style={styles.chips}>
              {[1, 5, 10].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setExpiry(addYears(new Date(), n))}
                  style={styles.chip}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>
                    In {n} {n === 1 ? "year" : "years"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.muted, { marginTop: 12 }]}>
              {settings.remindersEnabled
                ? `Reminders at 9:00 AM: ${[...settings.remindOffsets]
                    .sort((a, b) => b - a)
                    .map((d) => (d === 0 ? "on the day" : `${d} days before`))
                    .join(", ")}. Change this in Settings.`
                : "Reminders are turned off in Settings."}
            </Text>
          </View>
        </Section>

        <Section title="Details">
          <View style={styles.block}>
            {fields.length === 0 ? (
              <Text style={styles.muted}>
                Save the document number, issue date or anything else you'd
                otherwise open the scan to read.
              </Text>
            ) : (
              fields.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => setFieldEdit({ field: f })}
                  style={styles.fieldRow}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <Text style={styles.fieldValue} selectable={false}>
                      {revealed[f.id] ? f.value : maskValue(f.value)}
                    </Text>
                  </View>
                  <IconButton
                    icon={revealed[f.id] ? "eye-off" : "eye"}
                    label={revealed[f.id] ? "Hide value" : "Show value"}
                    onPress={() =>
                      setRevealed((r) => ({ ...r, [f.id]: !r[f.id] }))
                    }
                  />
                  <IconButton
                    icon={copied === f.id ? "check" : "copy"}
                    label={`Copy ${f.label}`}
                    color={copied === f.id ? colors.success : undefined}
                    onPress={() => copy(f)}
                  />
                </Pressable>
              ))
            )}
            <Button
              label="Add detail"
              kind="secondary"
              onPress={() => setFieldEdit({})}
              style={{ marginTop: fields.length ? 6 : 14 }}
            />
          </View>
        </Section>

        <Section title="Tags">
          <View style={styles.block}>
            <View style={styles.chips}>
              {tags.map((t) => (
                <Pressable
                  key={t}
                  onPress={() =>
                    updateFile(file.id, { tags: tags.filter((x) => x !== t) })
                  }
                  style={[styles.chip, styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove tag ${t}`}
                >
                  <Text style={[styles.chipText, { color: colors.onPrimary }]}>#{t}</Text>
                  <Feather name="x" size={14} color={colors.onPrimary} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => setTagPrompt(true)}
                style={styles.chip}
                accessibilityRole="button"
              >
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={styles.chipText}>Add tag</Text>
              </Pressable>
            </View>
            {suggestions.length ? (
              <>
                <Text style={[styles.muted, { marginTop: 14 }]}>
                  Used on other files:
                </Text>
                <View style={styles.chips}>
                  {suggestions.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => addTag(t)}
                      style={styles.chip}
                      accessibilityRole="button"
                    >
                      <Text style={styles.chipText}>#{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </Section>

        <Section title="Notes">
          <Pressable
            onPress={() => setNotesPrompt(true)}
            style={styles.block}
            accessibilityRole="button"
          >
            <Text style={file.notes ? styles.notes : styles.muted}>
              {file.notes ||
                "Tap to add a note, such as where the original is kept."}
            </Text>
          </Pressable>
        </Section>

        <Text style={styles.footnote}>
          Saved details are protected by the app lock but are not encrypted on
          the phone yet. Avoid storing full card or account numbers you wouldn't
          want exposed.
        </Text>
      </ScrollView>

      <PromptModal
        visible={tagPrompt}
        title="Add a tag"
        placeholder="e.g. kyc, insurance, 2026"
        confirmLabel="Add"
        onCancel={() => setTagPrompt(false)}
        onSubmit={(v) => {
          addTag(v);
          setTagPrompt(false);
        }}
      />
      <PromptModal
        visible={notesPrompt}
        title="Notes"
        initial={file.notes}
        multiline
        allowEmpty
        confirmLabel="Save"
        onCancel={() => setNotesPrompt(false)}
        onSubmit={(v) => {
          updateFile(file.id, { notes: v });
          setNotesPrompt(false);
        }}
      />
      <FieldModal
        state={fieldEdit}
        onClose={() => setFieldEdit(null)}
        onSave={(field, existing) => {
          saveField(field, existing);
          setFieldEdit(null);
        }}
        onDelete={(f) => {
          updateFile(file.id, { fields: fields.filter((x) => x.id !== f.id) });
          setFieldEdit(null);
        }}
      />
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
  },
  heroText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryDark,
  },
  section: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  block: { padding: 16 },
  big: { fontFamily: fonts.title, fontSize: 26, color: colors.ink },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  notes: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  fieldLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  fieldValue: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
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
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});

import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import { colors, fonts, radius } from "../theme";
import { Folder, VaultFile } from "../types";
import { dueInfo, expiryInfo, extOf, formatBytes, formatDate, kindOf } from "../utils";

const KIND_STYLE = {
  image: { bg: "#E3F1FB", fg: "#2F8FD0" },
  pdf: { bg: "#FBE6E6", fg: "#C23B3B" },
  doc: { bg: "#E4EAFB", fg: "#2A3BA8" },
  sheet: { bg: "#E2F3EA", fg: "#2F8F6B" },
  video: { bg: "#EFE6F8", fg: "#7A4FB0" },
  other: { bg: "#ECEEF5", fg: "#5B6280" },
} as const;

export function FileThumb({ name, mime, uri, size = 44 }: { name: string; mime: string; uri?: string; size?: number }) {
  const kind = kindOf(mime, name);
  const s = KIND_STYLE[kind];
  if (kind === "image" && uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: s.bg }} />;
  }
  const label = (extOf(name).slice(1) || "file").toUpperCase().slice(0, 4);
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: s.bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: s.fg }}>{label}</Text>
    </View>
  );
}

const TONE = {
  ok: { bg: "#ECEEF5", fg: "#5B6280" },
  soon: { bg: "#FFF1D6", fg: "#8A5A00" },
  expired: { bg: "#FBE6E6", fg: "#B02A2A" },
} as const;

export function ExpiryBadge({ iso }: { iso: string }) {
  const e = expiryInfo(iso);
  const t = TONE[e.tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: t.fg }}>{e.label}</Text>
    </View>
  );
}

export function DueBadge({ iso }: { iso: string }) {
  const e = dueInfo(iso);
  const t = TONE[e.tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: t.fg }}>{e.label}</Text>
    </View>
  );
}

export function FileRow(props: {
  file: VaultFile;
  uri: string;
  subtitle?: string;
  onPress: () => void;
  onMenu: () => void;
}) {
  const f = props.file;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const hasFields = Boolean(f.fields && f.fields.length > 0);
  const primaryField = hasFields ? f.fields![0] : null;
  const isPrimaryCopied =
    copiedId === "primary" || (primaryField !== null && copiedId === primaryField.id);

  async function copyValue(id: string, text: string) {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 1500);
  }

  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#ECEFFA" }]}>
      <FileThumb name={f.name} mime={f.mime} uri={props.uri} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {f.name}
          </Text>
          {primaryField ? (
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                copyValue("primary", primaryField.value);
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.inlineCopyBtn,
                isPrimaryCopied && styles.inlineCopyBtnCopied,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Copy ${primaryField.label}`}
            >
              <Feather
                name={isPrimaryCopied ? "check" : "copy"}
                size={12}
                color={isPrimaryCopied ? "#FFFFFF" : colors.primary}
              />
              <Text
                style={[
                  styles.inlineCopyText,
                  isPrimaryCopied && styles.inlineCopyTextCopied,
                ]}
              >
                {isPrimaryCopied ? "Copied ✓" : "Copy"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {props.subtitle ? props.subtitle + "  •  " : ""}{formatBytes(f.size)}  •  {formatDate(f.addedAt)}
        </Text>
        {hasFields ? (
          <View style={styles.fieldsContainer}>
            {f.fields!.map((field) => {
              const isFieldCopied =
                copiedId === field.id || (copiedId === "primary" && field.id === primaryField?.id);
              return (
                <Pressable
                  key={field.id}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    copyValue(field.id, field.value);
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.fieldChip,
                    isFieldCopied && styles.fieldChipCopied,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy ${field.label}: ${field.value}`}
                >
                  <Feather
                    name={isFieldCopied ? "check" : "copy"}
                    size={11}
                    color={isFieldCopied ? "#FFFFFF" : colors.primary}
                  />
                  <Text
                    style={[
                      styles.fieldChipText,
                      isFieldCopied && styles.fieldChipTextCopied,
                    ]}
                    numberOfLines={1}
                  >
                    {isFieldCopied ? `${field.label}: Copied ✓` : `${field.label}: ${field.value}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {f.expiresOn || f.tags?.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 }}>
            {f.expiresOn ? <ExpiryBadge iso={f.expiresOn} /> : null}
            {(f.tags ?? []).slice(0, 2).map((t) => (
              <Text key={t} style={styles.tag}>#{t}</Text>
            ))}
            {(f.tags?.length ?? 0) > 2 ? <Text style={styles.tag}>+{(f.tags?.length ?? 0) - 2}</Text> : null}
          </View>
        ) : null}
      </View>
      <Pressable onPress={props.onMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Actions for ${f.name}`} style={styles.menuBtn}>
        <Feather name="more-vertical" size={20} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

/** A folder drawn as a folder: coloured tab on top of a tinted body. */
export function FolderTile(props: { folder: Folder; detail: string; onPress: () => void; onLongPress?: () => void }) {
  const c = props.folder.color;
  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${props.folder.name}, ${props.detail}`}
      style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ width: 54, height: 12, backgroundColor: c, borderTopLeftRadius: 9, borderTopRightRadius: 9, marginLeft: 14 }} />
      <View style={[styles.tileBody, { backgroundColor: c + "1F", borderColor: c }]}>
        <Feather name="folder" size={22} color={c} />
        <View>
          <Text style={styles.tileName} numberOfLines={2}>{props.folder.name}</Text>
          <Text style={styles.tileSub} numberOfLines={1}>{props.detail}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function FolderRow(props: { folder: Folder; detail: string; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable onPress={props.onPress} onLongPress={props.onLongPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#ECEFFA" }]}>
      <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: props.folder.color + "26", alignItems: "center", justifyContent: "center" }}>
        <Feather name="folder" size={22} color={props.folder.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{props.folder.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{props.detail}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, flexShrink: 1 },
  inlineCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.primary + "14",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  inlineCopyBtnCopied: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  inlineCopyText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  inlineCopyTextCopied: {
    color: "#FFFFFF",
  },
  fieldsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  fieldChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#ECEFFA",
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: "100%",
  },
  fieldChipCopied: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  fieldChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
  },
  fieldChipTextCopied: {
    color: "#FFFFFF",
    fontFamily: fonts.semibold,
  },
  tag: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  menuBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  tileBody: {
    borderWidth: 1.5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    padding: 14,
    minHeight: 108,
    justifyContent: "space-between",
    gap: 10,
  },
  tileName: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  tileSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});

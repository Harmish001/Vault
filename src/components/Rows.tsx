import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
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
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#ECEFFA" }]}>
      <FileThumb name={f.name} mime={f.mime} uri={props.uri} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{f.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {props.subtitle ? props.subtitle + "  •  " : ""}{formatBytes(f.size)}  •  {formatDate(f.addedAt)}
        </Text>
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
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
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

import React from "react";
import {
  ActivityIndicator, Modal, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { colors, folderColors, fonts, radius } from "../theme";

export function ScreenHeader(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  left?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      {props.onBack ? (
        <IconButton icon="arrow-left" label="Back" onPress={props.onBack} />
      ) : (
        props.left
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{props.subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>{props.right}</View>
    </View>
  );
}

export function IconButton(props: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.line }]}
    >
      <Feather name={props.icon} size={22} color={props.color ?? colors.ink} />
    </Pressable>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const kind = props.kind ?? "primary";
  const bg = kind === "primary" ? colors.primary : kind === "danger" ? colors.danger : "transparent";
  const fg = kind === "secondary" ? colors.primary : colors.onPrimary;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: kind === "secondary" ? colors.primary : bg },
        (props.disabled || props.loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
        props.style,
      ]}
    >
      {props.loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{props.label}</Text>}
    </Pressable>
  );
}

export function FabBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.fabBar, { bottom: insets.bottom + 20 }]}>{children}</View>;
}

export function Pill(props: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  tone?: "dark" | "accent";
  disabled?: boolean;
}) {
  const dark = props.tone === "dark";
  const fg = colors.onPrimary;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: dark ? colors.primary : colors.accent },
        (pressed || props.disabled) && { opacity: 0.8 },
      ]}
    >
      <Feather name={props.icon} size={20} color={fg} />
      <Text style={[styles.pillText, { color: fg }]}>{props.label}</Text>
    </Pressable>
  );
}

export function EmptyState(props: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyBody}>{props.body}</Text>
      {props.action}
    </View>
  );
}

export function SheetModal(props: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** "top" keeps text-entry dialogs clear of the on-screen keyboard. */
  position?: "bottom" | "top";
}) {
  const insets = useSafeAreaInsets();
  const top = props.position === "top";
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={props.onClose} />
      <View
        style={[
          styles.sheet,
          top
            ? { top: insets.top + 56, bottom: undefined, left: 16, right: 16, borderRadius: 24, paddingBottom: 20 }
            : { paddingBottom: insets.bottom + 16 },
        ]}
      >
        {props.children}
      </View>
    </Modal>
  );
}

export type MenuItem = { label: string; icon: React.ComponentProps<typeof Feather>["name"]; onPress: () => void; danger?: boolean };

export function ActionMenu(props: { visible: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <SheetModal visible={props.visible} onClose={props.onClose}>
      {props.title ? <Text style={styles.sheetTitle} numberOfLines={1}>{props.title}</Text> : null}
      {props.items.map((it) => (
        <Pressable
          key={it.label}
          style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.bg }]}
          onPress={() => {
            props.onClose();
            setTimeout(it.onPress, 120); // let the sheet close before opening the next UI
          }}
        >
          <Feather name={it.icon} size={20} color={it.danger ? colors.danger : colors.ink} />
          <Text style={[styles.menuLabel, it.danger && { color: colors.danger }]}>{it.label}</Text>
        </Pressable>
      ))}
    </SheetModal>
  );
}

export function PromptModal(props: {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  confirmLabel: string;
  secure?: boolean;
  allowEmpty?: boolean;
  hint?: string;
  multiline?: boolean;
  suggestions?: string[];
  withColor?: boolean;
  initialColor?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  onCancel: () => void;
  onSubmit: (value: string, color: string) => void;
}) {
  const [value, setValue] = React.useState(props.initial ?? "");
  const [color, setColor] = React.useState(props.initialColor ?? folderColors[0]);
  React.useEffect(() => {
    if (props.visible) {
      setValue(props.initial ?? "");
      setColor(props.initialColor ?? folderColors[0]);
    }
  }, [props.visible, props.initial, props.initialColor]);
  const ok = props.allowEmpty || value.trim().length > 0;
  return (
    <SheetModal visible={props.visible} onClose={props.onCancel} position="top">
      <Text style={styles.sheetTitle}>{props.title}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        autoFocus
        secureTextEntry={props.secure}
        keyboardType={props.keyboardType}
        autoCapitalize={props.secure || props.keyboardType === "email-address" ? "none" : props.withColor ? "words" : "sentences"}
        multiline={props.multiline}
        style={[styles.input, props.multiline && { minHeight: 130, textAlignVertical: "top" }]}
        onSubmitEditing={() => !props.multiline && ok && props.onSubmit(value, color)}
        selectTextOnFocus
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      {props.suggestions?.length && !value.trim() ? (
        <View style={styles.swatches}>
          {props.suggestions.map((sg) => (
            <Pressable key={sg} onPress={() => setValue(sg)} accessibilityRole="button" style={styles.suggest}>
              <Text style={styles.suggestText}>{sg}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {props.withColor ? (
        <View style={styles.swatches}>
          {folderColors.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="button"
              accessibilityLabel={`Folder color ${c}`}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
            >
              {color === c ? <Feather name="check" size={16} color={colors.onPrimary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Button label="Cancel" kind="secondary" onPress={props.onCancel} style={{ flex: 1 }} />
        <Button label={props.confirmLabel} disabled={!ok} onPress={() => props.onSubmit(value, color)} style={{ flex: 1 }} />
      </View>
    </SheetModal>
  );
}

export const styles = StyleSheet.create({
  fabBar: { position: "absolute", right: 18, flexDirection: "row", gap: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  headerTitle: { fontFamily: fonts.title, fontSize: 24, color: colors.ink },
  headerSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  empty: { alignItems: "center", paddingHorizontal: 36, paddingTop: 56, gap: 10 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.ink, textAlign: "center" },
  emptyBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center", marginBottom: 12 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.ink, marginBottom: 10 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 10 },
  menuLabel: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
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
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 18 },
  suggest: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line },
  suggestText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3, borderColor: colors.surface, elevation: 3, shadowColor: colors.shadow, shadowOpacity: 0.25, shadowRadius: 3 },
});

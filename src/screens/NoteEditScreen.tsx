import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts, noteColors, radius } from "../theme";
import { NoteColor } from "../types";
import { IconButton } from "../components/ui";
import { FavStar } from "../components/Rows";
import { isFavorite } from "../favorites";


const COLOR_KEYS: NoteColor[] = [
  "default",
  "yellow",
  "peach",
  "rose",
  "purple",
  "blue",
  "mint",
  "sage",
];

export default function NoteEditScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "NoteEdit">) {
  const { notes, createNote, updateNote, deleteNote, favorites, toggleFavorite } = useVault();
  const insets = useSafeAreaInsets();
  const noteId = route.params?.id;
  const existing = notes.find((n) => n.id === noteId);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [isSecret, setIsSecret] = useState(existing?.isSecret ?? false);
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [color, setColor] = useState<NoteColor>(existing?.color ?? "default");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedRef = useRef(false);

  // Sync if opened note changes
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setContent(existing.content);
      setIsSecret(existing.isSecret ?? false);
      setPinned(existing.pinned ?? false);
      setColor(existing.color ?? "default");
    }
  }, [existing?.id]);

  async function handleCopy() {
    if (!content) {
      ToastAndroid.show("Nothing to copy", ToastAndroid.SHORT);
      return;
    }
    await Clipboard.setStringAsync(content);
    setCopied(true);
    ToastAndroid.show("Copied to clipboard", ToastAndroid.SHORT);
    setTimeout(() => setCopied(false), 1600);
  }

  async function handleSave(leave = true) {
    if (saving) return;
    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    if (!cleanTitle && !cleanContent) {
      if (existing) {
        await deleteNote(existing.id);
      }
      if (leave) navigation.goBack();
      return;
    }

    setSaving(true);
    try {
      if (existing) {
        await updateNote(existing.id, {
          title: cleanTitle || "Untitled",
          content,
          isSecret,
          pinned,
          color,
        });
      } else if (!savedRef.current) {
        savedRef.current = true;
        await createNote({
          title: cleanTitle || "Untitled",
          content,
          isSecret,
          pinned,
          color,
        });
      }
      if (leave) {
        navigation.goBack();
      }
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing) {
      navigation.goBack();
      return;
    }
    Alert.alert("Delete note?", "This note will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteNote(existing.id);
          navigation.goBack();
        },
      },
    ]);
  }

  const themeConfig = noteColors[color] ?? noteColors.default;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: themeConfig.bg }}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: themeConfig.line,
          },
        ]}
      >
        <IconButton
          icon="arrow-left"
          label="Back"
          onPress={() => handleSave(true)}
        />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="bookmark"
          label={pinned ? "Unpin note" : "Pin note"}
          color={pinned ? colors.primary : colors.muted}
          onPress={() => setPinned((p) => !p)}
        />
        {existing ? (
          <FavStar
            on={isFavorite(favorites, "note", existing.id)}
            onPress={() => toggleFavorite("note", existing.id)}
            label={title || "Note"}
            size={20}
          />
        ) : null}
        {content ? (
          <IconButton
            icon={copied ? "check" : "copy"}
            label="Copy text"
            color={copied ? colors.success : colors.ink}
            onPress={handleCopy}
          />
        ) : null}
        {existing ? (
          <IconButton
            icon="trash-2"
            label="Delete"
            color={colors.danger}
            onPress={confirmDelete}
          />
        ) : null}
        <Pressable
          onPress={() => handleSave(true)}
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save note"
        >
          <Feather name="check" size={20} color={colors.onPrimary} />
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 18,
          paddingBottom: insets.bottom + 90,
          gap: 16,
        }}
      >
        {/* Secure Note Toggle Card */}
        <View
          style={[
            styles.secureCard,
            {
              borderColor: isSecret ? colors.primaryLine : themeConfig.line,
              backgroundColor: isSecret ? colors.primarySoft : colors.surface + "AA",
            },
          ]}
        >
          <View
            style={[
              styles.secureIconWrap,
              { backgroundColor: isSecret ? colors.primary : colors.neutralSoft },
            ]}
          >
            <Feather
              name={isSecret ? "lock" : "unlock"}
              size={18}
              color={isSecret ? colors.onPrimary : colors.muted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.secureTitle}>
              {isSecret ? "Secure Note (Hidden in list)" : "Regular Note"}
            </Text>
            <Text style={styles.secureSub}>
              {isSecret
                ? "Description is masked on the notes list with a quick 1-tap copy button."
                : "Save passwords, PINs or confidential numbers securely."}
            </Text>
          </View>
          <Switch
            value={isSecret}
            onValueChange={setIsSecret}
            trackColor={{ true: colors.primary, false: colors.switchOff }}
            thumbColor={colors.surface}
          />
        </View>

        {/* Title Input */}
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={[styles.titleInput, { color: themeConfig.text }]}
          autoFocus={!existing}
          returnKeyType="next"
        />

        {/* Content Input */}
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder={
            isSecret
              ? "Important password, account number, PIN or secret info..."
              : "Note description..."
          }
          placeholderTextColor={colors.muted}
          style={[styles.contentInput, { color: themeConfig.text }]}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      {/* Bottom Color Palette Bar */}
      <View
        style={[
          styles.paletteBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: themeConfig.bg,
            borderTopColor: themeConfig.line,
          },
        ]}
      >
        <Text style={styles.paletteLabel}>Color</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 6 }}
        >
          {COLOR_KEYS.map((ck) => {
            const swatch = noteColors[ck];
            const isSelected = color === ck;
            return (
              <Pressable
                key={ck}
                onPress={() => setColor(ck)}
                accessibilityRole="button"
                accessibilityLabel={`Note color ${ck}`}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: swatch.bg,
                    borderColor: isSelected ? colors.primary : swatch.line,
                    borderWidth: isSelected ? 2.5 : 1.5,
                  },
                ]}
              >
                {isSelected ? (
                  <Feather name="check" size={14} color={colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 4,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginLeft: 6,
  },
  saveBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.onPrimary,
  },
  secureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  secureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  secureTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
  },
  secureSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 2,
  },
  titleInput: {
    fontFamily: fonts.heading,
    fontSize: 22,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  contentInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 240,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  paletteBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  paletteLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});

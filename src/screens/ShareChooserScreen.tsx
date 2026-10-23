import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useShareIntentContext } from "expo-share-intent";
import { RootStackParamList } from "../navigation";
import { ScreenHeader } from "../components/ui";
import { parseBill } from "../capture/parseBill";
import { formatBytes } from "../utils";
import { colors, fonts, radius } from "../theme";

export default function ShareChooserScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "ShareChooser">) {
  const { shareIntent, resetShareIntent } = useShareIntentContext();

  const close = () => {
    resetShareIntent();
    navigation.navigate("Home");
  };

  const files = shareIntent.files ?? [];
  const textContent = shareIntent.text || shareIntent.webUrl || "";
  const isTextOnly = !files.length && !!textContent;

  // Check file types
  const imageFiles = useMemo(
    () =>
      files.filter((f) => {
        const mime = f.mimeType?.toLowerCase() ?? "";
        const name = f.fileName?.toLowerCase() ?? "";
        return (
          mime.startsWith("image/") ||
          /\.(jpg|jpeg|png|webp|heic)$/i.test(name)
        );
      }),
    [files]
  );

  const isImageShare = imageFiles.length > 0;
  const isPdfOrOther = !isTextOnly && !isImageShare;

  const firstFile = files[0];
  const firstImage = imageFiles[0];

  const handleCreateReminder = () => {
    if (isTextOnly) {
      const parsed = parseBill(textContent);
      navigation.navigate("ReminderEdit", {
        draft: {
          result: parsed,
          source: "share-text",
          sourceText: textContent,
        },
      });
    } else if (isImageShare) {
      // Pass up to first 3 images
      const uris = imageFiles.slice(0, 3).map((f) => f.path);
      navigation.navigate("ReminderEdit", {
        draft: {
          source: "share-image",
          imageUris: uris,
          originalName: firstImage.fileName,
          originalSize: firstImage.size ?? undefined,
        },
      });
    }
  };

  const handleSaveToFolder = () => {
    navigation.navigate("Save");
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Shared to DocVault" onBack={close} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Source preview card */}
        <View style={styles.sourceCard}>
          {isImageShare && firstImage?.path ? (
            <Image source={{ uri: firstImage.path }} style={styles.thumb} />
          ) : (
            <View style={styles.iconThumb}>
              <Feather
                name={isTextOnly ? "message-square" : "file-text"}
                size={24}
                color={colors.primary}
              />
            </View>
          )}

          <View style={styles.sourceInfo}>
            {isTextOnly ? (
              <>
                <Text style={styles.sourceTitle} numberOfLines={3}>
                  {textContent}
                </Text>
                <Text style={styles.sourceSubline}>Shared text</Text>
              </>
            ) : (
              <>
                <Text style={styles.sourceTitle} numberOfLines={2}>
                  {firstFile?.fileName || "Shared file"}
                </Text>
                <Text style={styles.sourceSubline}>
                  {firstFile?.size ? formatBytes(firstFile.size) : ""}{" "}
                  {files.length > 1 ? `• ${files.length} files` : ""}
                </Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.question}>What would you like to do?</Text>

        {/* Primary Action Card: Create a reminder */}
        <Pressable
          style={[styles.actionCard, styles.actionCardPrimary, isPdfOrOther && styles.actionCardDisabled]}
          onPress={handleCreateReminder}
          disabled={isPdfOrOther}
          accessibilityRole="button"
          accessibilityLabel="Create a reminder from this"
        >
          <View style={[styles.actionIconWrap, styles.actionIconWrapPrimary]}>
            <Feather name="bell" size={24} color={colors.primary} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionTitle}>Create a reminder</Text>
            <Text style={styles.actionSubtitle}>Finds the amount and due date</Text>
            {isPdfOrOther ? (
              <Text style={styles.disabledHelper}>
                PDF support is coming. Take a screenshot of the bill and share that.
              </Text>
            ) : null}
          </View>
          {!isPdfOrOther ? (
            <Feather name="chevron-right" size={20} color={colors.primary} />
          ) : null}
        </Pressable>

        {/* Secondary Action Card: Save to a folder (hidden for text shares) */}
        {!isTextOnly ? (
          <Pressable
            style={styles.actionCard}
            onPress={handleSaveToFolder}
            accessibilityRole="button"
            accessibilityLabel="Save this to a folder"
          >
            <View style={styles.actionIconWrap}>
              <Feather name="folder" size={24} color={colors.ink} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Save to a folder</Text>
              <Text style={styles.actionSubtitle}>Keep it with your documents</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  iconThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: "#E6EAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceInfo: {
    flex: 1,
  },
  sourceTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  sourceSubline: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  question: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
    marginTop: 8,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  actionCardPrimary: {
    backgroundColor: "#F2F5FE",
    borderColor: "#C7D5F7",
  },
  actionCardDisabled: {
    opacity: 0.6,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconWrapPrimary: {
    backgroundColor: "#DCE5FB",
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.ink,
  },
  actionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  disabledHelper: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#B45309",
    marginTop: 4,
  },
});

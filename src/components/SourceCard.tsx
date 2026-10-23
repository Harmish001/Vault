import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fonts, radius } from "../theme";

type SourceCardProps = {
  thumbnailUri?: string;
  title?: string;
  subline?: string;
  extractedText?: string;
};

export function SourceCard({
  thumbnailUri,
  title,
  subline,
  extractedText,
}: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumb} />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Feather name="file-text" size={24} color={colors.primary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {title || "Shared content"}
          </Text>
          {subline ? (
            <Text style={styles.subline} numberOfLines={1}>
              {subline}
            </Text>
          ) : null}
        </View>
      </View>

      {extractedText ? (
        <View style={styles.expandArea}>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={styles.expandButton}
            accessibilityRole="button"
            accessibilityLabel="Toggle recognized text"
          >
            <Text style={styles.expandLabel}>What I read</Text>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.primary}
            />
          </Pressable>

          {expanded ? (
            <View style={styles.textBox}>
              <ScrollView
                style={styles.scroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <Text style={styles.text} selectable>
                  {extractedText}
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  subline: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  expandArea: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  expandLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  textBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 8,
    marginTop: 6,
    maxHeight: 120, // ~6 lines
  },
  scroll: {
    maxHeight: 110,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 18,
  },
});

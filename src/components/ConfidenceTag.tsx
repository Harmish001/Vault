import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";

export type TagType = "check" | "needed";

export function ConfidenceTag({ type }: { type: TagType }) {
  const isNeeded = type === "needed";
  return (
    <View style={[styles.pill, isNeeded ? styles.pillNeeded : styles.pillCheck]}>
      <Text style={[styles.text, isNeeded ? styles.textNeeded : styles.textCheck]}>
        {isNeeded ? "Needed" : "Check"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  pillCheck: {
    backgroundColor: colors.neutralSoft,
  },
  pillNeeded: {
    backgroundColor: colors.dangerSoft,
  },
  text: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  textCheck: {
    color: colors.neutralInk,
  },
  textNeeded: {
    color: colors.dangerInk,
  },
});

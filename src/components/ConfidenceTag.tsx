import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../theme";

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
    backgroundColor: "#F1F5F9",
  },
  pillNeeded: {
    backgroundColor: "#FEE2E2",
  },
  text: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  textCheck: {
    color: "#334155", // slate-700
  },
  textNeeded: {
    color: "#DC2626", // red-600
  },
});

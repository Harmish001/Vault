import React, { useEffect } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";

export default function RemindersScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Reminders">) {
  useEffect(() => {
    navigation.replace("Home", { tab: "reminders" });
  }, [navigation]);

  return null;
}

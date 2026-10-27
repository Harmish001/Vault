import React, { useEffect } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";

export default function NotesScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Notes">) {
  useEffect(() => {
    navigation.replace("Home", { tab: "notes" });
  }, [navigation]);

  return null;
}

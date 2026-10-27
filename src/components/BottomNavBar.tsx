import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { colors, fonts } from "../theme";
import { useVault } from "../storage/vault";
import { nextDue } from "../reminders-plan";

export type TabKey = "documents" | "notes" | "reminders" | "mycard";

type Props = {
  active: TabKey;
};

export default function BottomNavBar({ active }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { reminders } = useVault();

  // Due reminders count badge
  const dueCount = useMemo(() => {
    const now = new Date();
    return reminders.filter((r) => Boolean(nextDue(r, now))).length;
  }, [reminders]);

  const tabs: {
    key: TabKey;
    label: string;
    icon: React.ComponentProps<typeof Feather>["name"];
    badge?: number;
    onPress: () => void;
  }[] = [
    {
      key: "documents",
      label: "Documents",
      icon: "folder",
      onPress: () => {
        if (active !== "documents") navigation.navigate("Home");
      },
    },
    {
      key: "notes",
      label: "Notes",
      icon: "edit-3",
      onPress: () => {
        if (active !== "notes") navigation.navigate("Notes");
      },
    },
    {
      key: "reminders",
      label: "Reminders",
      icon: "bell",
      badge: dueCount > 0 ? dueCount : undefined,
      onPress: () => {
        if (active !== "reminders") navigation.navigate("Reminders");
      },
    },
    {
      key: "mycard",
      label: "My Card",
      icon: "heart",
      onPress: () => {
        if (active !== "mycard") navigation.navigate("MyCard");
      },
    },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={[styles.outerWrapper, { bottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.dock}>
        {tabs.map((tab) => {
          const isSelected = active === tab.key;

          if (isSelected) {
            return (
              <Pressable
                key={tab.key}
                onPress={tab.onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: true }}
                accessibilityLabel={tab.label}
                style={({ pressed }) => [
                  styles.activeTab,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={styles.activeIconCircle}>
                  <Feather name={tab.icon} size={18} color={colors.onPrimary} />
                  {tab.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {tab.badge > 99 ? "99+" : tab.badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.activeLabel}>{tab.label}</Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={tab.key}
              onPress={tab.onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: false }}
              accessibilityLabel={tab.label}
              style={({ pressed }) => [
                styles.inactiveCircle,
                pressed && styles.inactivePressed,
              ]}
            >
              <Feather name={tab.icon} size={19} color={colors.muted} />
              {tab.badge ? (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.badgeText}>
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 36,
    borderWidth: 0,
    elevation: 8,
    gap: 10,
  },
  activeTab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 0,
    paddingLeft: 4,
    paddingRight: 13,
    paddingVertical: 4,
    borderRadius: 24,
    gap: 7,
  },
  activeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.primary,
    letterSpacing: 0.1,
  },
  inactiveCircle: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  inactivePressed: {
    opacity: 0.75,
    backgroundColor: colors.line,
    borderRadius: 999,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  inactiveBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    color: colors.onPrimary,
    lineHeight: 11,
  },
});

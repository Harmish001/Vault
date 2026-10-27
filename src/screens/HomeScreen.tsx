import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { IconButton, ScreenHeader } from "../components/ui";
import BottomNavBar, { TabKey } from "../components/BottomNavBar";
import HomeDashboardView from "../views/HomeDashboardView";
import DocumentsView from "../views/DocumentsView";
import NotesView from "../views/NotesView";
import RemindersView from "../views/RemindersView";

export default function HomeScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "Home">) {
  const [activeTab, setActiveTab] = useState<TabKey>(route.params?.tab ?? "home");

  // Sync tab if route params change externally
  useEffect(() => {
    if (route.params?.tab && route.params.tab !== activeTab) {
      setActiveTab(route.params.tab);
    }
  }, [route.params?.tab, activeTab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Persistent Header across all tabs with My Card & Settings on the right */}
      <ScreenHeader
        title="DocVault"
        left={
          <Image
            source={require("../../assets/logo-mark.png")}
            style={{ width: 40, height: 40, borderRadius: 10 }}
          />
        }
        right={
          <>
            <IconButton
              icon="heart"
              label="My Card"
              color={colors.primary}
              onPress={() => navigation.navigate("MyCard")}
            />
            <IconButton
              icon="settings"
              label="Settings"
              onPress={() => navigation.navigate("Settings")}
            />
          </>
        }
      />

      {/* Screen Content: changes seamlessly without re-rendering Header or BottomNavBar */}
      <View style={{ flex: 1 }}>
        {activeTab === "home" && (
          <HomeDashboardView navigation={navigation} onSwitchTab={setActiveTab} />
        )}
        {activeTab === "documents" && <DocumentsView navigation={navigation} />}
        {activeTab === "notes" && <NotesView navigation={navigation} />}
        {activeTab === "reminders" && <RemindersView navigation={navigation} />}
      </View>

      {/* Persistent Bottom Navigation Dock: [Documents] [Notes] [Home (Center)] [Reminders] */}
      <BottomNavBar active={activeTab} onChangeTab={setActiveTab} />
    </View>
  );
}

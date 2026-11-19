import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { useSettings } from "../storage/settings";
import { IconButton, ScreenHeader } from "../components/ui";
import { FamilySetupModal } from "../components/FamilySetupModal";
import BottomNavBar, { TabKey } from "../components/BottomNavBar";
import HomeDashboardView from "../views/HomeDashboardView";
import DocumentsView from "../views/DocumentsView";
import NotesView from "../views/NotesView";
import RemindersView from "../views/RemindersView";
import BooksView from "../views/BooksView";
import InstantSearch from "../components/InstantSearch";

export default function HomeScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "Home">) {
  const { settings, update: updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabKey>(route.params?.tab ?? "home");
  const [familySetupOpen, setFamilySetupOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevTabRef = useRef<TabKey>(activeTab);

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      fadeAnim.setValue(0.2);
      slideAnim.setValue(8);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      prevTabRef.current = activeTab;
    }
  }, [activeTab, fadeAnim, slideAnim]);

  // Sync tab if route params change externally
  useEffect(() => {
    if (route.params?.tab && route.params.tab !== activeTab) {
      setActiveTab(route.params.tab);
    }
  }, [route.params?.tab, activeTab]);

  // Show family setup popup once on launch for new and existing users
  useEffect(() => {
    if (settings.familySetupDone === false) {
      const timer = setTimeout(() => {
        setFamilySetupOpen(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [settings.familySetupDone]);

  const handleCloseFamilySetup = () => {
    setFamilySetupOpen(false);
    updateSettings({ familySetupDone: true });
  };

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
              icon="search"
              label="Search"
              onPress={() => setSearchOpen(true)}
            />
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

      {/* Screen Content: smooth animation on section changes */}
      <Animated.View
        key={activeTab}
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {activeTab === "home" && (
          <HomeDashboardView navigation={navigation} onSwitchTab={setActiveTab} />
        )}
        {activeTab === "documents" && <DocumentsView navigation={navigation} />}
        {activeTab === "notes" && <NotesView navigation={navigation} />}
        {activeTab === "books" && <BooksView navigation={navigation} />}
        {activeTab === "reminders" && <RemindersView navigation={navigation} />}
      </Animated.View>

      {/* Persistent Bottom Navigation Dock: [Documents] [Notes] [Home (Center)] [Reminders] */}
      <BottomNavBar active={activeTab} onChangeTab={setActiveTab} />

      <FamilySetupModal
        visible={familySetupOpen}
        onClose={handleCloseFamilySetup}
      />

      <InstantSearch
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenFile={(id) => navigation.navigate("FileDetails", { fileId: id })}
        onOpenFolder={(id) => navigation.navigate("Folder", { id })}
        onOpenNote={(id) => navigation.navigate("NoteEdit", { id })}
        onOpenBook={(id) => navigation.navigate("BookReader", { bookId: id })}
      />
    </View>
  );
}

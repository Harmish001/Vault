import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold } from "@expo-google-fonts/figtree";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { RootStackParamList } from "./src/navigation";
import { SettingsProvider, useSettings } from "./src/storage/settings";
import { VaultProvider, useVault } from "./src/storage/vault";
import { LockProvider, useLock } from "./src/lock/LockProvider";
import { colors } from "./src/theme";
import HomeScreen from "./src/screens/HomeScreen";
import FolderScreen from "./src/screens/FolderScreen";
import SaveScreen from "./src/screens/SaveScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const Stack = createNativeStackNavigator<RootStackParamList>();
const navRef = createNavigationContainerRef<RootStackParamList>();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

function Shell({ fontsReady }: { fontsReady: boolean }) {
  const { ready: settingsReady } = useSettings();
  const { ready: vaultReady } = useVault();
  const { locked } = useLock();
  const { hasShareIntent, shareIntent } = useShareIntentContext();
  const [navReady, setNavReady] = useState(false);
  const hidden = useRef(false);

  const appReady = fontsReady && settingsReady && vaultReady;
  useEffect(() => {
    if (appReady && !hidden.current) {
      hidden.current = true;
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [appReady]);

  // Files shared from the gallery / other apps: wait for unlock, then open the "Save to" screen.
  useEffect(() => {
    if (!appReady || !navReady || locked) return;
    if (hasShareIntent && navRef.getCurrentRoute()?.name !== "Save") {
      navRef.navigate("Save");
    }
  }, [appReady, navReady, locked, hasShareIntent, shareIntent]);

  if (!appReady) return <View style={{ flex: 1, backgroundColor: colors.primaryDark }} />;

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Folder" component={FolderScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Save" component={SaveScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  });

  return (
    <SafeAreaProvider>
      {/* resetOnBackground:false keeps a shared file alive while the phone's unlock screen is showing */}
      <ShareIntentProvider options={{ resetOnBackground: false }}>
        <SettingsProvider>
          <VaultProvider>
            <LockProvider>
              <StatusBar style="dark" />
              <Shell fontsReady={fontsLoaded} />
            </LockProvider>
          </VaultProvider>
        </SettingsProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}

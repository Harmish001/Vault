import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useSettings } from "../storage/settings";
import { colors, fonts } from "../theme";

type Ctx = {
  locked: boolean;
  noDeviceLock: boolean;
  /** Wrap anything that opens another full-screen Android activity (scanner, file picker). */
  runExternal: <T>(fn: () => Promise<T>) => Promise<T>;
};
const LockContext = createContext<Ctx>({ locked: true, noDeviceLock: false, runExternal: (fn) => fn() });
export const useLock = () => useContext(LockContext);

export function LockProvider({ children }: { children: React.ReactNode }) {
  const { ready, settings } = useSettings();
  const [locked, setLocked] = useState(true);
  const [noDeviceLock, setNoDeviceLock] = useState(false);
  const leftAt = useRef<number | null>(null);
  const busy = useRef(false);
  const external = useRef(0);

  const runExternal = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    external.current++;
    try {
      return await fn();
    } finally {
      // keep the guard briefly: the "active" event can arrive just after the promise settles
      setTimeout(() => {
        external.current--;
      }, 1000);
    }
  }, []);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        // No fingerprint, PIN, pattern or password on the phone: nothing to check against.
        setNoDeviceLock(true);
        setLocked(false);
        return;
      }
      setNoDeviceLock(false);
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock DocVault",
        disableDeviceFallback: false, // allows the phone's PIN / pattern, not only biometrics
      });
      if (res.success) setLocked(false);
    } catch {
      // stay locked; the Unlock button lets the person retry
    } finally {
      busy.current = false;
    }
  }, []);

  // Cold start.
  useEffect(() => {
    if (!ready) return;
    if (!settings.lockEnabled) {
      setLocked(false);
      return;
    }
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.lockEnabled]);

  // Re-lock after the app has been away longer than the chosen grace period.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        if (!busy.current && external.current === 0) leftAt.current = Date.now();
      } else if (state === "active") {
        if (busy.current || external.current > 0) return; // returning from our own system screen
        const away = leftAt.current;
        leftAt.current = null;
        if (settings.lockEnabled && away !== null && Date.now() - away > settings.lockAfterSec * 1000) {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [settings.lockEnabled, settings.lockAfterSec, unlock]);

  // Hide content in the app switcher and block screenshots.
  useEffect(() => {
    if (settings.blockScreenshots) preventScreenCaptureAsync().catch(() => undefined);
    else allowScreenCaptureAsync().catch(() => undefined);
  }, [settings.blockScreenshots]);

  return (
    <LockContext.Provider value={{ locked, noDeviceLock, runExternal }}>
      {children}
      <Modal
        visible={locked}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.overlay}>
          <Image source={require("../../assets/logo-mark.png")} style={styles.logo} />
          <Text style={styles.title}>DocVault</Text>
          <Text style={styles.sub}>Your documents are locked.</Text>
          <Pressable onPress={unlock} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Unlock</Text>
          </Pressable>
        </View>
      </Modal>
    </LockContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  logo: { width: 96, height: 96, borderRadius: 22, marginBottom: 20 },
  title: { fontFamily: fonts.title, fontSize: 32, color: "#fff" },
  sub: { fontFamily: fonts.body, fontSize: 16, color: "#C9D0F5", marginTop: 6, marginBottom: 32 },
  button: { backgroundColor: colors.accent, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.primaryDark },
});

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import QRCode from "react-native-qrcode-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { colors, fonts, radius } from "../theme";
import { ScreenHeader } from "../components/ui";
import { stopShareSession } from "../sharing/sharing";
import { RELAY_BASE_URL } from "../sharing/sharingRelay";

const RELAY_HOST = RELAY_BASE_URL.replace(/^https?:\/\//, "");

export default function ShareQRScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "ShareQR">) {
  const { url, expiresAt, token, itemCount, code, words } = route.params;
  const insets = useSafeAreaInsets();

  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );
  const [blurred, setBlurred] = useState(false);
  const [stopped, setStopped] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(intervalRef.current!);
        setStopped(true);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [expiresAt]);

  // Blur QR when app goes background (shoulder-surfing protection)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setBlurred(state !== "active");
    });
    return () => sub.remove();
  }, []);

  async function handleStop() {
    Alert.alert("Stop sharing?", "The link will stop working immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: async () => {
          clearInterval(intervalRef.current!);
          setStopped(true);
          await stopShareSession(token);
          navigation.goBack();
        },
      },
    ]);
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const timerColor =
    secondsLeft > 60 ? colors.accent : secondsLeft > 20 ? "#C07000" : colors.danger;

  const expired = stopped || secondsLeft === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Scan to Access"
        subtitle={`${itemCount} item${itemCount !== 1 ? "s" : ""} · encrypted`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.body}>
        {/* QR card */}
        <View style={styles.card}>
          {expired ? (
            <View style={styles.expiredBox}>
              <Feather name="clock" size={40} color={colors.muted} />
              <Text style={styles.expiredTitle}>Session Expired</Text>
              <Text style={styles.expiredSub}>
                The share link is no longer valid. Go back and create a new one.
              </Text>
            </View>
          ) : blurred ? (
            <View style={styles.blurBox}>
              <Feather name="eye-off" size={36} color={colors.muted} />
              <Text style={styles.blurText}>QR hidden while app is in background</Text>
            </View>
          ) : (
            <View style={styles.qrWrapper}>
              <QRCode
                value={url}
                size={220}
                color={colors.primaryDark}
                backgroundColor={colors.surface}
                ecl="M"
              />
            </View>
          )}

          {/* Timer */}
          {!expired && (
            <View style={styles.timerRow}>
              <Feather name="clock" size={15} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>
                Expires in {minutes}:{seconds}
              </Text>
            </View>
          )}

          {/* Typed alternative for PCs without a camera */}
          {!expired && !blurred && (
            <View style={styles.codeBox}>
              <Text style={styles.codeHint}>No camera? Open {RELAY_HOST} and type:</Text>
              <Text style={styles.codeText} selectable>
                {code.slice(0, 3)} {code.slice(3)}
              </Text>
              <Text style={styles.wordsText} selectable>
                {words.join("  ")}
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.steps}>
          {[
            { icon: "camera", text: "Scan this QR code with any device that has a camera" },
            { icon: "monitor", text: `No camera on your PC? Open ${RELAY_HOST} and type the code and words` },
            { icon: "unlock", text: "Files decrypt instantly in the browser — nothing stored" },
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepIcon}>
                <Feather name={step.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        {/* Security badge */}
        <View style={styles.secBadge}>
          <Feather name="shield" size={14} color={colors.accent} />
          <Text style={styles.secText}>
            End-to-end encrypted · key never leaves this device · single-use link
          </Text>
        </View>
      </ScrollView>

      {/* Stop button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleStop}
          disabled={expired}
          style={({ pressed }) => [
            styles.stopBtn,
            expired && { opacity: 0.4 },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Feather name="x-circle" size={18} color={colors.danger} />
          <Text style={styles.stopBtnText}>Stop Sharing</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 20,
    gap: 20,
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    width: "100%",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  blurBox: {
    width: 244,
    height: 244,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  blurText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  expiredBox: {
    width: 244,
    height: 244,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  expiredTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.ink,
  },
  expiredSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timerText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  codeBox: {
    width: "100%",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  codeHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  codeText: {
    fontFamily: fonts.heading,
    fontSize: 32,
    letterSpacing: 4,
    color: colors.primaryDark,
  },
  wordsText: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.primary,
    textAlign: "center",
  },
  steps: {
    width: "100%",
    gap: 12,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  secBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E6F4EA",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
  },
  secText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accent,
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  stopBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.danger,
  },
});

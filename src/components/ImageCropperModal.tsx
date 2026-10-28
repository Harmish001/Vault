import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { colors, fonts, radius } from "../theme";

type Props = {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onDone: (croppedUri: string) => void;
};

type HandleType = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | "inside" | null;

export function ImageCropperModal({ visible, imageUri, onCancel, onDone }: Props) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [processing, setProcessing] = useState(false);

  // Crop box in display coordinates relative to the displayed image area
  const [crop, setCrop] = useState({ l: 0, t: 0, r: 0, b: 0 });

  const cropRef = useRef(crop);
  cropRef.current = crop;

  const dragStart = useRef({
    handle: null as HandleType,
    crop: { l: 0, t: 0, r: 0, b: 0 },
    touchX: 0,
    touchY: 0,
  });

  // Load natural image dimensions when imageUri changes
  useEffect(() => {
    if (!visible || !imageUri) {
      setNaturalSize(null);
      setRotate(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = await manipulateAsync(imageUri, [], {});
        if (!cancelled) {
          setNaturalSize({ w: info.width, h: info.height });
        }
      } catch {
        Image.getSize(
          imageUri,
          (w, h) => {
            if (!cancelled) setNaturalSize({ w, h });
          },
          () => undefined
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, imageUri]);

  // Compute displayed image layout within the container
  const layout = useMemo(() => {
    if (!naturalSize || containerSize.w <= 0 || containerSize.h <= 0) {
      return { dispW: 0, dispH: 0, padX: 0, padY: 0 };
    }
    const isSideways = rotate === 90 || rotate === 270;
    const effectiveW = isSideways ? naturalSize.h : naturalSize.w;
    const effectiveH = isSideways ? naturalSize.w : naturalSize.h;

    const maxW = Math.max(10, containerSize.w - 24);
    const maxH = Math.max(10, containerSize.h - 24);

    const ratio = effectiveW / effectiveH;
    let dispW = maxW;
    let dispH = maxW / ratio;

    if (dispH > maxH) {
      dispH = maxH;
      dispW = maxH * ratio;
    }

    const padX = (containerSize.w - dispW) / 2;
    const padY = (containerSize.h - dispH) / 2;

    return { dispW, dispH, padX, padY };
  }, [naturalSize, containerSize, rotate]);

  // Reset crop box to full image whenever image or orientation changes
  useEffect(() => {
    if (layout.dispW > 0 && layout.dispH > 0) {
      setCrop({ l: 0, t: 0, r: layout.dispW, b: layout.dispH });
    }
  }, [layout.dispW, layout.dispH]);

  const resetFull = () => {
    if (layout.dispW > 0 && layout.dispH > 0) {
      setCrop({ l: 0, t: 0, r: layout.dispW, b: layout.dispH });
    }
  };

  const rotate90 = () => {
    setRotate((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  };

  // Helper to detect which handle was tapped
  const findHandle = (x: number, y: number): HandleType => {
    const { l, t, r, b } = cropRef.current;
    const thresh = 28;

    const nearL = Math.abs(x - l) <= thresh;
    const nearR = Math.abs(x - r) <= thresh;
    const nearT = Math.abs(y - t) <= thresh;
    const nearB = Math.abs(y - b) <= thresh;

    if (nearL && nearT) return "tl";
    if (nearR && nearT) return "tr";
    if (nearL && nearB) return "bl";
    if (nearR && nearB) return "br";
    if (nearT && x >= l && x <= r) return "t";
    if (nearB && x >= l && x <= r) return "b";
    if (nearL && y >= t && y <= b) return "l";
    if (nearR && y >= t && y <= b) return "r";
    if (x > l && x < r && y > t && y < b) return "inside";
    return null;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const locX = evt.nativeEvent.locationX;
          const locY = evt.nativeEvent.locationY;
          const handle = findHandle(locX, locY);
          dragStart.current = {
            handle,
            crop: { ...cropRef.current },
            touchX: locX,
            touchY: locY,
          };
        },
        onPanResponderMove: (evt, gesture) => {
          const { handle, crop: sc } = dragStart.current;
          if (!handle) return;
          const minSize = 40;
          const maxW = layout.dispW;
          const maxH = layout.dispH;
          const dx = gesture.dx;
          const dy = gesture.dy;

          let { l, t, r, b } = sc;

          if (handle === "inside") {
            const w = sc.r - sc.l;
            const h = sc.b - sc.t;
            l = Math.max(0, Math.min(maxW - w, sc.l + dx));
            t = Math.max(0, Math.min(maxH - h, sc.t + dy));
            r = l + w;
            b = t + h;
          } else {
            if (handle.includes("l")) {
              l = Math.max(0, Math.min(sc.r - minSize, sc.l + dx));
            }
            if (handle.includes("r")) {
              r = Math.min(maxW, Math.max(sc.l + minSize, sc.r + dx));
            }
            if (handle.includes("t")) {
              t = Math.max(0, Math.min(sc.b - minSize, sc.t + dy));
            }
            if (handle.includes("b")) {
              b = Math.min(maxH, Math.max(sc.t + minSize, sc.b + dy));
            }
          }

          setCrop({ l, t, r, b });
        },
        onPanResponderRelease: () => {
          dragStart.current.handle = null;
        },
      }),
    [layout.dispW, layout.dispH]
  );

  async function handleApply() {
    if (!imageUri || !naturalSize || layout.dispW <= 0 || layout.dispH <= 0) return;
    setProcessing(true);
    try {
      // Step 1: Apply rotation first if any
      let currentUri = imageUri;
      let effectiveW = naturalSize.w;
      let effectiveH = naturalSize.h;

      if (rotate !== 0) {
        const rotRes = await manipulateAsync(currentUri, [{ rotate }], {
          format: SaveFormat.JPEG,
          compress: 0.95,
        });
        currentUri = rotRes.uri;
        effectiveW = rotRes.width;
        effectiveH = rotRes.height;
      }

      // Step 2: Determine if user made an actual crop
      const isFull =
        crop.l <= 3 &&
        crop.t <= 3 &&
        crop.r >= layout.dispW - 3 &&
        crop.b >= layout.dispH - 3;

      if (isFull) {
        onDone(currentUri);
        return;
      }

      // Convert display coordinates to natural image pixel coordinates
      const scaleX = effectiveW / layout.dispW;
      const scaleY = effectiveH / layout.dispH;

      const originX = Math.max(0, Math.min(effectiveW - 10, Math.round(crop.l * scaleX)));
      const originY = Math.max(0, Math.min(effectiveH - 10, Math.round(crop.t * scaleY)));
      const width = Math.max(10, Math.min(effectiveW - originX, Math.round((crop.r - crop.l) * scaleX)));
      const height = Math.max(10, Math.min(effectiveH - originY, Math.round((crop.b - crop.t) * scaleY)));

      const cropRes = await manipulateAsync(
        currentUri,
        [{ crop: { originX, originY, width, height } }],
        { format: SaveFormat.JPEG, compress: 0.95 }
      );
      onDone(cropRes.uri);
    } catch {
      onDone(imageUri);
    } finally {
      setProcessing(false);
    }
  }

  if (!visible || !imageUri) return null;

  const { dispW, dispH, padX, padY } = layout;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerBtn} hitSlop={8}>
            <Feather name="x" size={22} color={colors.surface} />
          </Pressable>
          <Text style={styles.headerTitle}>Adjust & Crop</Text>
          <Pressable
            onPress={handleApply}
            disabled={processing || dispW <= 0}
            style={[styles.headerDoneBtn, processing && { opacity: 0.5 }]}
          >
            {processing ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.headerDoneText}>Done</Text>
            )}
          </Pressable>
        </View>

        {/* Workspace Canvas */}
        <View
          style={styles.canvas}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setContainerSize({ w: width, h: height });
          }}
        >
          {dispW > 0 && dispH > 0 && (
            <View
              style={{
                width: dispW,
                height: dispH,
                position: "absolute",
                left: padX,
                top: padY,
              }}
            >
              {/* Underlying Image */}
              <Image
                source={{ uri: imageUri }}
                resizeMode="contain"
                style={{
                  width: dispW,
                  height: dispH,
                  transform: [{ rotate: `${rotate}deg` }],
                }}
              />

              {/* Dimmed Overlay outside crop area */}
              {/* Top Mask */}
              <View style={[styles.mask, { top: 0, left: 0, right: 0, height: crop.t }]} />
              {/* Bottom Mask */}
              <View style={[styles.mask, { top: crop.b, left: 0, right: 0, bottom: 0 }]} />
              {/* Left Mask */}
              <View style={[styles.mask, { top: crop.t, left: 0, width: crop.l, height: crop.b - crop.t }]} />
              {/* Right Mask */}
              <View style={[styles.mask, { top: crop.t, left: crop.r, right: 0, height: crop.b - crop.t }]} />

              {/* Crop Box Frame */}
              <View
                pointerEvents="none"
                style={[
                  styles.cropFrame,
                  {
                    left: crop.l,
                    top: crop.t,
                    width: crop.r - crop.l,
                    height: crop.b - crop.t,
                  },
                ]}
              >
                {/* Rule of thirds grid lines */}
                <View style={[styles.gridLineH, { top: "33.3%" }]} />
                <View style={[styles.gridLineH, { top: "66.6%" }]} />
                <View style={[styles.gridLineV, { left: "33.3%" }]} />
                <View style={[styles.gridLineV, { left: "66.6%" }]} />

                {/* Corner Handles */}
                <View style={[styles.cornerHandle, styles.tl]} />
                <View style={[styles.cornerHandle, styles.tr]} />
                <View style={[styles.cornerHandle, styles.bl]} />
                <View style={[styles.cornerHandle, styles.br]} />

                {/* Mid Edge Handles */}
                <View style={[styles.edgeHandleH, styles.tHandle]} />
                <View style={[styles.edgeHandleH, styles.bHandle]} />
                <View style={[styles.edgeHandleV, styles.lHandle]} />
                <View style={[styles.edgeHandleV, styles.rHandle]} />
              </View>

              {/* Touch Responder Layer over displayed area */}
              <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill} />
            </View>
          )}
        </View>

        {/* Bottom Toolbar */}
        <View style={styles.footer}>
          <Pressable onPress={resetFull} style={styles.footerBtn}>
            <Feather name="maximize" size={18} color={colors.surface} />
            <Text style={styles.footerBtnText}>Full image</Text>
          </Pressable>
          <Pressable onPress={rotate90} style={styles.footerBtn}>
            <Feather name="rotate-cw" size={18} color={colors.surface} />
            <Text style={styles.footerBtnText}>Rotate 90°</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#12141A",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.surface,
  },
  headerDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  headerDoneText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.onPrimary,
  },
  canvas: {
    flex: 1,
    overflow: "hidden",
  },
  mask: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cropFrame: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  cornerHandle: {
    position: "absolute",
    width: 18,
    height: 18,
    borderColor: "#FFFFFF",
  },
  tl: { top: -2, left: -2, borderTopWidth: 3.5, borderLeftWidth: 3.5 },
  tr: { top: -2, right: -2, borderTopWidth: 3.5, borderRightWidth: 3.5 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 3.5, borderLeftWidth: 3.5 },
  br: { bottom: -2, right: -2, borderBottomWidth: 3.5, borderRightWidth: 3.5 },
  edgeHandleH: {
    position: "absolute",
    alignSelf: "center",
    width: 24,
    height: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  tHandle: { top: -1.5 },
  bHandle: { bottom: -1.5 },
  edgeHandleV: {
    position: "absolute",
    top: "50%",
    width: 3,
    height: 24,
    marginTop: -12,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  lHandle: { left: -1.5 },
  rHandle: { right: -1.5 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#161822",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  footerBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.surface,
  },
});

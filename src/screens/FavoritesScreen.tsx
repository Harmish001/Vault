import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { useSettings } from "../storage/settings";
import { Favorite } from "../types";
import { colors, fonts, radius } from "../theme";
import { folderPath, plural } from "../utils";
import { FavStar, FileThumb } from "../components/Rows";
import { EmptyState, ScreenHeader } from "../components/ui";

export default function FavoritesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Favorites">) {
  const { favorites, files, folders, fileUri, toggleFavorite, reorderFavorites } = useVault();
  const { settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  // Local copy so the list doesn't jump back while the reordered index is being saved.
  const [order, setOrder] = useState(favorites);
  useEffect(() => setOrder(favorites), [favorites]);

  function save(next: Favorite[]) {
    setOrder(next);
    reorderFavorites(next).catch(() => setOrder(favorites));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    save(next);
  }

  function toggleWidget(id: string) {
    const hidden = settings.widgetHidden;
    update({ widgetHidden: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });
  }

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<Favorite>) => {
    const file = item.kind === "file" ? files.find((f) => f.id === item.id) : undefined;
    const folder = item.kind === "folder" ? folders.find((f) => f.id === item.id) : undefined;
    const name = file?.name ?? folder?.name;
    if (!name) return null;
    const onWidget = file ? !settings.widgetHidden.includes(file.id) : false;
    const i = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={isActive}
          style={[styles.row, isActive && styles.rowActive]}
          accessibilityLabel={name}
          accessibilityActions={[
            { name: "moveUp", label: "Move up" },
            { name: "moveDown", label: "Move down" },
          ]}
          onAccessibilityAction={(e) => move(i, e.nativeEvent.actionName === "moveUp" ? i - 1 : i + 1)}
        >
          <Pressable onPressIn={drag} hitSlop={8} style={styles.handle} accessibilityElementsHidden importantForAccessibility="no">
            <Feather name="menu" size={18} color={colors.muted} />
          </Pressable>
          {file ? (
            <FileThumb name={file.name} mime={file.mime} uri={fileUri(file)} size={40} />
          ) : (
            <View style={[styles.folderIcon, { backgroundColor: folder!.color + "26" }]}>
              <Feather name="folder" size={20} color={folder!.color} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {file ? folderPath(folders, file.folderId) : plural(files.filter((f) => f.folderId === folder!.id).length, "file")}
            </Text>
          </View>
          {file ? (
            <Pressable
              onPress={() => toggleWidget(file.id)}
              hitSlop={6}
              style={[styles.chip, onWidget && styles.chipOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: onWidget }}
              accessibilityLabel={`Show ${file.name} on the home-screen widget`}
            >
              <Feather name="smartphone" size={13} color={onWidget ? colors.onPrimary : colors.muted} />
              <Text style={[styles.chipText, onWidget && { color: colors.onPrimary }]}>Widget</Text>
            </Pressable>
          ) : null}
          <FavStar on onPress={() => toggleFavorite(item.kind, item.id)} label={name} />
        </Pressable>
      </ScaleDecorator>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Favorites" subtitle={plural(order.length, "item")} onBack={() => navigation.goBack()} />
      {order.length ? (
        <DraggableFlatList
          data={order}
          keyExtractor={(f) => f.kind + ":" + f.id}
          onDragEnd={({ data }) => save(data)}
          renderItem={renderItem}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={{ padding: 8, paddingBottom: insets.bottom + 32 }}
          ListFooterComponent={
            <Text style={styles.tip}>
              Hold a row and drag to reorder. “Widget” picks which documents appear on the home-screen widget; folders stay in the app.
            </Text>
          }
        />
      ) : (
        <EmptyState title="No favorites yet" body="Tap the star on any file or folder to pin passports, licences, policies and other documents you use often." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  rowActive: { backgroundColor: colors.surface, elevation: 4 },
  handle: { width: 28, height: 36, alignItems: "center", justifyContent: "center" },
  folderIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  tip: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: "center", padding: 16 },
});

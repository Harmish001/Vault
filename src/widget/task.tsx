import React from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandler } from "react-native-android-widget";
import { readVaultIndex, vaultFilePath } from "../storage/vault";
import { readSettings } from "../storage/settings";
import { widgetItems } from "../favorites";
import { kindOf } from "../utils";
import type { Note, Settings, VaultIndex } from "../types";
import { FavoritesWidget, WIDGET_CARD, WIDGET_CAROUSEL, type WidgetCard } from "./FavoritesWidget";

export type WidgetData = { index: (Pick<VaultIndex, "files" | "folders" | "favorites"> & { notes?: Note[] }) | null; settings: Settings };

const PAGES_FILE = (FileSystem.documentDirectory ?? "") + "widget-pages.json";

async function readPages(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(PAGES_FILE));
  } catch {
    return {};
  }
}

const writePages = (p: Record<string, number>) => FileSystem.writeAsStringAsync(PAGES_FILE, JSON.stringify(p)).catch(() => undefined);

/** Small JPEG as a data URI: widgets are drawn by the launcher, which can't read the app's private files. */
async function thumb(storedAs: string): Promise<string | null> {
  try {
    const r = await manipulateAsync(vaultFilePath(storedAs), [{ resize: { width: 160 } }], {
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    });
    FileSystem.deleteAsync(r.uri, { idempotent: true }).catch(() => undefined);
    return r.base64 ? "data:image/jpeg;base64," + r.base64 : null;
  } catch {
    return null;
  }
}

function perPage(info: WidgetInfo) {
  if (info.widgetName === WIDGET_CARD) return 1;
  return Math.max(2, Math.min(4, Math.floor((info.width - 16) / 110)));
}

async function build(info: WidgetInfo, data: WidgetData, step = 0) {
  const compact = info.widgetName === WIDGET_CARD;
  if (!data.index) return <FavoritesWidget compact={compact} cards={[]} page={0} pages={1} unavailable />;

  const items = widgetItems(data.index, data.settings.widgetHidden);
  const per = perPage(info);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const saved = await readPages();
  const cur = saved[info.widgetId] ?? 0;
  const page = (((cur + step) % pages) + pages) % pages; // arrows wrap around
  if (page !== cur) await writePages({ ...saved, [info.widgetId]: page });

  const visible = items.slice(page * per, page * per + per);
  const cards: WidgetCard[] = await Promise.all(
    visible.map(async (it) => ({
      ...it,
      thumb: data.settings.widgetThumbnails && it.storedAs && kindOf(it.mime, it.name) === "image" ? await thumb(it.storedAs) : null,
    }))
  );
  return <FavoritesWidget compact={compact} cards={cards} page={page} pages={pages} />;
}

/** Runs headless when Android adds, resizes or updates a widget, or a pager arrow is tapped. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === "WIDGET_DELETED") {
    const { [widgetInfo.widgetId]: _gone, ...rest } = await readPages();
    await writePages(rest);
    return;
  }
  const step = widgetAction === "WIDGET_CLICK" ? (clickAction === "NEXT" ? 1 : clickAction === "PREV" ? -1 : 0) : 0;
  const data: WidgetData = { index: await readVaultIndex(), settings: await readSettings() };
  renderWidget(await build(widgetInfo, data, step));
};

/** Redraws every placed widget from the app's in-memory data (after favorites, files or settings change). */
export function refreshWidgets(data: WidgetData) {
  for (const widgetName of [WIDGET_CARD, WIDGET_CAROUSEL]) {
    requestWidgetUpdate({ widgetName, renderWidget: (info) => build(info, data) }).catch(() => undefined);
  }
}

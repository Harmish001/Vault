import React from "react";
import { ToastAndroid } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandler } from "react-native-android-widget";
import { readVaultIndex, vaultFilePath } from "../storage/vault";
import { readSettings } from "../storage/settings";
import { widgetItems } from "../favorites";
import { kindOf } from "../utils";
import type { Note, Settings, VaultIndex } from "../types";
import { FavoritesWidget, WIDGET_CARD, WIDGET_CAROUSEL, type WidgetCard } from "./FavoritesWidget";
import { CurrentBookWidget, WIDGET_CURRENT_BOOK } from "./CurrentBookWidget";
import { Book, getBookStatus } from "../types";

export { WIDGET_CURRENT_BOOK };

export type WidgetData = {
  index: (Pick<VaultIndex, "files" | "folders" | "favorites"> & { notes?: Note[]; books?: Book[] }) | null;
  settings: Settings;
};

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

async function bookCoverThumb(coverPath: string): Promise<string | null> {
  try {
    const fullUri = coverPath.startsWith("file://") ? coverPath : `file://${coverPath}`;
    const r = await manipulateAsync(fullUri, [{ resize: { width: 180 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
      base64: true,
    });
    FileSystem.deleteAsync(r.uri, { idempotent: true }).catch(() => undefined);
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch {
    return null;
  }
}

async function buildCurrentBookWidget(info: WidgetInfo, data: WidgetData) {
  if (!data.index) return <CurrentBookWidget book={null} unavailable />;
  const books = data.index.books ?? [];
  const readable = books.filter((b) => b.type !== "external" && b.filePath);
  if (!readable.length) return <CurrentBookWidget book={null} unavailable={false} />;

  // Priority 1: Books currently in 'reading' status
  const readingBooks = readable.filter((b) => getBookStatus(b) === "reading");
  let targetBook: Book;

  if (readingBooks.length > 0) {
    targetBook = [...readingBooks].sort((a, b) => {
      const aTime = a.lastOpenedAt ?? a.progress.updatedAt ?? a.addedAt;
      const bTime = b.lastOpenedAt ?? b.progress.updatedAt ?? b.addedAt;
      return bTime - aTime;
    })[0];
  } else {
    // Priority 2: Most recently opened or added readable book
    targetBook = [...readable].sort((a, b) => {
      const aTime = a.lastOpenedAt ?? a.addedAt;
      const bTime = b.lastOpenedAt ?? b.addedAt;
      return bTime - aTime;
    })[0];
  }

  let coverThumb: string | null = null;
  if (targetBook.coverPath) {
    coverThumb = await bookCoverThumb(targetBook.coverPath);
  }

  return <CurrentBookWidget book={targetBook} coverThumb={coverThumb} />;
}

function perPage(info: WidgetInfo) {
  if (info.widgetName === WIDGET_CARD) return 1;
  return Math.max(2, Math.min(4, Math.floor((info.width - 16) / 110)));
}

async function build(info: WidgetInfo, data: WidgetData, step = 0, copiedId?: string) {
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
      isCopied: it.id === copiedId,
      thumb: data.settings.widgetThumbnails && it.storedAs && kindOf(it.mime, it.name) === "image" ? await thumb(it.storedAs) : null,
    }))
  );
  return <FavoritesWidget compact={compact} cards={cards} page={page} pages={pages} />;
}

/** Runs headless when Android adds, resizes or updates a widget, or a pager arrow or copy button is tapped. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) => {
  if (widgetAction === "WIDGET_DELETED") {
    const { [widgetInfo.widgetId]: _gone, ...rest } = await readPages();
    await writePages(rest);
    return;
  }

  // Handle instant headless copy without opening or unlocking the app
  if (clickAction === "COPY_ITEM") {
    const targetId = (clickActionData?.id as string) || "";
    const data: WidgetData = { index: await readVaultIndex(), settings: await readSettings() };

    // 1. Check if it's a note
    const note = data.index?.notes?.find((n) => n.id === targetId);
    if (note) {
      const text = [note.title?.trim(), note.content?.trim()].filter(Boolean).join("\n\n");
      await Clipboard.setStringAsync(text || note.title || "");
      ToastAndroid.show("Note copied to clipboard", ToastAndroid.SHORT);
      renderWidget(await build(widgetInfo, data, 0, targetId));
      return;
    }

    // 2. Check if it's a file with fields / notes
    const file = data.index?.files?.find((f) => f.id === targetId);
    if (file) {
      const parts: string[] = [];
      if (file.fields?.length) {
        for (const field of file.fields) {
          if (field.value?.trim()) parts.push(`${field.label}: ${field.value.trim()}`);
        }
      }
      if (file.notes?.trim()) parts.push(file.notes.trim());
      const toCopy = parts.join("\n") || file.name;
      await Clipboard.setStringAsync(toCopy);
      ToastAndroid.show("Details copied to clipboard", ToastAndroid.SHORT);
      renderWidget(await build(widgetInfo, data, 0, targetId));
      return;
    }
  }

  if (widgetInfo.widgetName === WIDGET_CURRENT_BOOK) {
    const data: WidgetData = { index: await readVaultIndex(), settings: await readSettings() };
    renderWidget(await buildCurrentBookWidget(widgetInfo, data));
    return;
  }

  const step = widgetAction === "WIDGET_CLICK" ? (clickAction === "NEXT" ? 1 : clickAction === "PREV" ? -1 : 0) : 0;
  const data: WidgetData = { index: await readVaultIndex(), settings: await readSettings() };
  renderWidget(await build(widgetInfo, data, step));
};

/** Redraws every placed widget from the app's in-memory data (after favorites, files or settings change). */
export function refreshWidgets(data: WidgetData) {
  for (const widgetName of [WIDGET_CARD, WIDGET_CAROUSEL, WIDGET_CURRENT_BOOK]) {
    requestWidgetUpdate({
      widgetName,
      renderWidget: (info) =>
        info.widgetName === WIDGET_CURRENT_BOOK ? buildCurrentBookWidget(info, data) : build(info, data),
    }).catch(() => undefined);
  }
}

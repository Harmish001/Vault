import React from "react";
import { FlexWidget, ImageWidget, SvgWidget, TextWidget, type HexColor } from "react-native-android-widget";
import { colors, kindColors } from "../theme";
import { extOf, kindOf } from "../utils";
import type { WidgetItem } from "../favorites";

export const WIDGET_CARD = "FavoriteCard";
export const WIDGET_CAROUSEL = "FavoritesCarousel";

export type WidgetCard = WidgetItem & { thumb: string | null };

const hex = (c: string) => c as HexColor;
const link = (action: "open" | "share", id: string) => `docvault://widget/${action}?id=${encodeURIComponent(id)}`;

const ICON = {
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
};
const svg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

function Card({ card }: { card: WidgetCard }) {
  const k = kindColors[kindOf(card.mime, card.name)];
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link("open", card.id) }}
      accessibilityLabel={`Open ${card.name}`}
      style={{
        flex: 1,
        height: "match_parent",
        backgroundColor: hex(colors.surface),
        borderRadius: 16,
        padding: 10,
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        {card.thumb ? (
          <ImageWidget image={card.thumb as `data:image${string}`} imageWidth={40} imageHeight={40} radius={10} resizeMode="cover" />
        ) : (
          <FlexWidget style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: hex(card.kind === "note" ? colors.primarySoft : k.bg), justifyContent: "center", alignItems: "center" }}>
            <TextWidget
              text={card.kind === "note" ? "NOTE" : (extOf(card.name).slice(1) || "file").toUpperCase().slice(0, 4)}
              style={{ fontSize: 11, fontWeight: "700", color: hex(card.kind === "note" ? colors.primary : k.fg) }}
            />
          </FlexWidget>
        )}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: link("share", card.id) }}
          accessibilityLabel={`Share ${card.name}`}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: hex(colors.primarySoft), justifyContent: "center", alignItems: "center" }}
        >
          <SvgWidget svg={svg(ICON.share, colors.primary)} style={{ width: 16, height: 16 }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ width: "match_parent", flexDirection: "column" }}>
        <TextWidget text={card.name} maxLines={2} truncate="END" style={{ fontSize: 13, fontWeight: "600", color: hex(colors.ink) }} />
        {card.folder ? (
          <TextWidget text={card.folder} maxLines={1} truncate="END" style={{ fontSize: 11, color: hex(colors.muted), marginTop: 2 }} />
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

function Arrow({ dir, label }: { dir: "PREV" | "NEXT"; label: string }) {
  return (
    <FlexWidget
      clickAction={dir}
      accessibilityLabel={label}
      style={{ width: 32, height: 28, justifyContent: "center", alignItems: "center" }}
    >
      <SvgWidget svg={svg(dir === "PREV" ? ICON.left : ICON.right, colors.onPrimary)} style={{ width: 18, height: 18 }} />
    </FlexWidget>
  );
}

function Message({ text }: { text: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: hex(colors.primaryDark),
        borderRadius: 22,
        padding: 14,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <TextWidget text={text} maxLines={4} style={{ fontSize: 13, color: hex(colors.onPrimary), textAlign: "center" }} />
    </FlexWidget>
  );
}

export function FavoritesWidget(props: {
  compact: boolean;
  cards: WidgetCard[];
  page: number;
  pages: number;
  /** the vault index couldn't be read without the app (e.g. after a phone storage reset) */
  unavailable?: boolean;
}) {
  if (props.unavailable) return <Message text="Open DocVault to load your favorites." />;
  if (!props.cards.length) return <Message text="Star documents in DocVault to see them here." />;
  const paged = props.pages > 1;
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: hex(colors.primaryDark),
        borderRadius: 22,
        padding: 8,
        flexDirection: "column",
      }}
    >
      {props.compact && !paged ? null : (
        <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          {props.compact ? (
            <Arrow dir="PREV" label="Previous favorite" />
          ) : (
            <TextWidget text="Favorites" clickAction="OPEN_APP" style={{ fontSize: 14, fontWeight: "700", color: hex(colors.onPrimary), marginLeft: 6 }} />
          )}
          {paged ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
              {props.compact ? null : <Arrow dir="PREV" label="Previous favorites" />}
              <TextWidget text={`${props.page + 1}/${props.pages}`} style={{ fontSize: 12, color: hex(colors.onDarkMuted) }} />
              <Arrow dir="NEXT" label={props.compact ? "Next favorite" : "Next favorites"} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      )}
      <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row", flexGap: 8 }}>
        {props.cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

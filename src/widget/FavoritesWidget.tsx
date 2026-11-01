import React from "react";
import { FlexWidget, ImageWidget, SvgWidget, TextWidget, type HexColor } from "react-native-android-widget";
import { colors, kindColors } from "../theme";
import { extOf, kindOf } from "../utils";
import type { WidgetItem } from "../favorites";

export const WIDGET_CARD = "FavoriteCard";
export const WIDGET_CAROUSEL = "FavoritesCarousel";

export type WidgetCard = WidgetItem & { thumb: string | null; isCopied?: boolean };

const hex = (c: string) => c as HexColor;
const link = (action: "open" | "share" | "copy", id: string) => `docvault://widget/${action}?id=${encodeURIComponent(id)}`;

const ICON = {
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  copy:
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check:
    '<polyline points="20 6 9 17 4 12"/>',
  note:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
};

const svg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

function Card({ card }: { card: WidgetCard }) {
  const k = kindColors[kindOf(card.mime, card.name)];
  const isNote = card.kind === "note";
  const isCopy = isNote || !!card.hasInfo;
  const isCopied = !!card.isCopied;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link("open", card.id) }}
      accessibilityLabel={`Open ${card.name}`}
      style={{
        flex: 1,
        height: "match_parent",
        backgroundColor: hex(isCopied ? "#FAFAF8" : colors.surface),
        borderRadius: 16,
        padding: 10,
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top row: badge & action button */}
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        {card.thumb ? (
          <ImageWidget image={card.thumb as `data:image${string}`} imageWidth={38} imageHeight={38} radius={10} resizeMode="cover" />
        ) : (
          <FlexWidget
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: hex(isNote ? "#FCE4EC" : k.bg),
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {isNote ? (
              <SvgWidget svg={svg(ICON.note, colors.primary)} style={{ width: 18, height: 18 }} />
            ) : (
              <TextWidget
                text={(extOf(card.name).slice(1) || "FILE").toUpperCase().slice(0, 4)}
                style={{ fontSize: 10, fontWeight: "700", color: hex(k.fg) }}
              />
            )}
          </FlexWidget>
        )}

        {/* Action Button: Instant headless copy for notes/info; share for files */}
        <FlexWidget
          clickAction={isCopy ? "COPY_ITEM" : "OPEN_URI"}
          clickActionData={isCopy ? { id: card.id, name: card.name, kind: card.kind } : { uri: link("share", card.id) }}
          accessibilityLabel={`${isCopy ? (isCopied ? "Copied" : "Copy") : "Share"} ${card.name}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: hex(isCopied ? "#E8F5E9" : colors.primarySoft),
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <SvgWidget
            svg={svg(isCopied ? ICON.check : isCopy ? ICON.copy : ICON.share, isCopied ? colors.success : colors.primary)}
            style={{ width: 15, height: 15 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Middle/Bottom: Title, snippet preview, and tag */}
      <FlexWidget style={{ width: "match_parent", flexDirection: "column", marginTop: 4 }}>
        <TextWidget
          text={card.name}
          maxLines={card.snippet ? 1 : 2}
          truncate="END"
          style={{ fontSize: 13, fontWeight: "700", color: hex(colors.ink) }}
        />

        {card.snippet ? (
          <TextWidget
            text={card.snippet}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 11, color: hex(isCopied ? colors.success : colors.muted), marginTop: 2, lineHeight: 15 }}
          />
        ) : null}

        {card.folder ? (
          <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
            <TextWidget
              text={isCopied ? "Copied to clipboard" : card.folder}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 10, fontWeight: isCopied ? "600" : "400", color: hex(isCopied ? colors.success : colors.muted) }}
            />
          </FlexWidget>
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
      style={{
        width: 30,
        height: 28,
        borderRadius: 8,
        backgroundColor: hex("#2A2426"),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <SvgWidget svg={svg(dir === "PREV" ? ICON.left : ICON.right, colors.onPrimary)} style={{ width: 16, height: 16 }} />
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
  if (!props.cards.length) return <Message text="Star documents or notes in DocVault to see them here." />;
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
      {/* Header bar */}
      {props.compact && !paged ? null : (
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            paddingHorizontal: 2,
          }}
        >
          {props.compact ? (
            <Arrow dir="PREV" label="Previous favorite" />
          ) : (
            <FlexWidget
              clickAction="OPEN_APP"
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                backgroundColor: hex("#2A2426"),
              }}
            >
              <TextWidget
                text="DocVault"
                style={{ fontSize: 11, fontWeight: "700", color: hex(colors.primarySoft) }}
              />
            </FlexWidget>
          )}

          {paged ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 4 }}>
              {props.compact ? null : <Arrow dir="PREV" label="Previous favorites" />}
              <TextWidget
                text={`${props.page + 1}/${props.pages}`}
                style={{ fontSize: 11, fontWeight: "600", color: hex(colors.onDarkMuted), marginHorizontal: 4 }}
              />
              <Arrow dir="NEXT" label={props.compact ? "Next favorite" : "Next favorites"} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      )}

      {/* Cards container */}
      <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row", flexGap: 8 }}>
        {props.cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

import React from "react";
import { FlexWidget, ImageWidget, SvgWidget, TextWidget, type HexColor } from "react-native-android-widget";
import { colors } from "../theme";
import type { Book } from "../types";

export const WIDGET_CURRENT_BOOK = "CurrentBookWidget";

const hex = (c: string) => c as HexColor;
const link = (id: string) => `docvault://widget/book?id=${encodeURIComponent(id)}`;

const ICON = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  play: '<polygon points="6 4 19 12 6 20 6 4"/>',
};

const svg = (body: string, color: string, fill = "none") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export function CurrentBookWidget({
  book,
  coverThumb,
  unavailable,
}: {
  book: Book | null;
  coverThumb?: string | null;
  unavailable?: boolean;
}) {
  if (unavailable || !book) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: "match_parent",
          width: "match_parent",
          backgroundColor: hex(colors.primaryDark),
          borderRadius: 22,
          padding: 14,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <FlexWidget
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: hex("#332A2D"),
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <SvgWidget svg={svg(ICON.book, colors.onDarkMuted)} style={{ width: 22, height: 22 }} />
        </FlexWidget>
        <TextWidget
          text={unavailable ? "Open DocVault to load books." : "No book currently being read."}
          maxLines={2}
          truncate="END"
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: hex(colors.onPrimary),
            textAlign: "center",
          }}
        />
        <TextWidget
          text={unavailable ? "Tap to unlock" : "Tap to open library"}
          maxLines={1}
          style={{
            fontSize: 11,
            color: hex(colors.onDarkMuted),
            marginTop: 4,
            textAlign: "center",
          }}
        />
      </FlexWidget>
    );
  }

  const pct = Math.min(100, Math.max(0, Math.round(book.progress.percentage * 100)));
  const progressText =
    book.type === "pdf" && book.progress.pdfPage
      ? `Page ${book.progress.pdfPage}${book.progress.pdfTotalPages ? ` of ${book.progress.pdfTotalPages}` : ""} · ${pct}%`
      : book.progress.chapterLabel
      ? `${pct}% · ${book.progress.chapterLabel}`
      : `${pct}% read`;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: link(book.id) }}
      accessibilityLabel={`Continue reading ${book.title}`}
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: hex(colors.primaryDark),
        borderRadius: 22,
        padding: 12,
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top row: Label & Type */}
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <FlexWidget
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: hex("#332A2D"),
              justifyContent: "center",
              alignItems: "center",
              marginRight: 6,
            }}
          >
            <SvgWidget svg={svg(ICON.book, colors.primaryLight)} style={{ width: 11, height: 11 }} />
          </FlexWidget>
          <TextWidget
            text="CURRENTLY READING"
            style={{
              fontSize: 9.5,
              fontWeight: "700",
              color: hex(colors.onDarkMuted),
              letterSpacing: 0.6,
            }}
          />
        </FlexWidget>

        <FlexWidget
          style={{
            backgroundColor: hex("#332A2D"),
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          <TextWidget
            text={book.type.toUpperCase()}
            style={{
              fontSize: 8.5,
              fontWeight: "700",
              color: hex(colors.onDarkMuted),
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Center content: Cover on left, Info & Controls on right */}
      <FlexWidget
        style={{
          width: "match_parent",
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {/* Book Cover */}
        {coverThumb ? (
          <ImageWidget
            image={coverThumb as `data:image${string}`}
            imageWidth={60}
            imageHeight={84}
            radius={8}
            resizeMode="cover"
          />
        ) : (
          <FlexWidget
            style={{
              width: 60,
              height: 84,
              borderRadius: 8,
              backgroundColor: hex("#332A2D"),
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <SvgWidget svg={svg(ICON.book, colors.primaryLight)} style={{ width: 24, height: 24 }} />
          </FlexWidget>
        )}

        {/* Book Info */}
        <FlexWidget
          style={{
            flex: 1,
            height: 84,
            marginLeft: 10,
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Title & Author */}
          <FlexWidget style={{ flexDirection: "column" }}>
            <TextWidget
              text={book.title}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: hex(colors.onPrimary),
                lineHeight: 17,
              }}
            />
            {book.author ? (
              <TextWidget
                text={book.author}
                maxLines={1}
                truncate="END"
                style={{
                  fontSize: 10.5,
                  color: hex(colors.onDarkMuted),
                  marginTop: 2,
                }}
              />
            ) : null}
          </FlexWidget>

          {/* Progress & Resume Icon */}
          <FlexWidget style={{ flexDirection: "column" }}>
            <FlexWidget
              style={{
                width: "match_parent",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <FlexWidget style={{ flex: 1, marginRight: 8 }}>
                <TextWidget
                  text={progressText}
                  maxLines={1}
                  truncate="END"
                  style={{
                    fontSize: 9.5,
                    fontWeight: "600",
                    color: hex(colors.onDarkMuted),
                  }}
                />
              </FlexWidget>

              {/* Resume action icon button */}
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: link(book.id) }}
                accessibilityLabel={`Resume ${book.title}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: hex(colors.primary),
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <SvgWidget
                  svg={svg(ICON.play, colors.onPrimary, colors.onPrimary)}
                  style={{ width: 10, height: 10, marginLeft: 1 }}
                />
              </FlexWidget>
            </FlexWidget>

            {/* Progress bar */}
            <FlexWidget
              style={{
                width: "match_parent",
                height: 3.5,
                borderRadius: 2,
                backgroundColor: hex("#3D3336"),
                flexDirection: "row",
                overflow: "hidden",
              }}
            >
              <FlexWidget
                style={{
                  flex: Math.max(1, pct),
                  height: 3.5,
                  backgroundColor: hex(colors.primaryLight),
                  borderRadius: 2,
                }}
              />
              {pct < 100 ? (
                <FlexWidget
                  style={{
                    flex: 100 - Math.max(1, pct),
                    height: 3.5,
                  }}
                />
              ) : null}
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}


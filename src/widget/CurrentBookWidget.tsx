import React from "react";
import { FlexWidget, ImageWidget, SvgWidget, TextWidget, type HexColor } from "react-native-android-widget";
import { colors } from "../theme";
import type { Book } from "../types";

export const WIDGET_CURRENT_BOOK = "CurrentBookWidget";

const hex = (c: string) => c as HexColor;
const link = (id: string) => `docvault://widget/book?id=${encodeURIComponent(id)}`;

const ICON = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
};

const svg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

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
          borderRadius: 20,
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
        borderRadius: 20,
        padding: 10,
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
          marginBottom: 6,
        }}
      >
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <SvgWidget svg={svg(ICON.book, colors.primaryLight)} style={{ width: 13, height: 13 }} />
          <TextWidget
            text="CURRENTLY READING"
            style={{
              fontSize: 9.5,
              fontWeight: "700",
              color: hex(colors.onDarkMuted),
              letterSpacing: 0.5,
              marginLeft: 4,
            }}
          />
        </FlexWidget>

        <FlexWidget
          style={{
            backgroundColor: hex("#332A2D"),
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 4,
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

      {/* Center content: Cover on left, Info on right */}
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
            imageWidth={52}
            imageHeight={72}
            radius={6}
            resizeMode="cover"
          />
        ) : (
          <FlexWidget
            style={{
              width: 52,
              height: 72,
              borderRadius: 6,
              backgroundColor: hex("#332A2D"),
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <SvgWidget svg={svg(ICON.book, colors.primaryLight)} style={{ width: 22, height: 22 }} />
          </FlexWidget>
        )}

        {/* Book Info */}
        <FlexWidget
          style={{
            flex: 1,
            height: "match_parent",
            marginLeft: 8,
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <FlexWidget style={{ flexDirection: "column" }}>
            <TextWidget
              text={book.title}
              maxLines={2}
              truncate="END"
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: hex(colors.onPrimary),
                lineHeight: 16,
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
                  marginTop: 1,
                }}
              />
            ) : null}
          </FlexWidget>

          {/* Progress bar & resume */}
          <FlexWidget style={{ flexDirection: "column", marginTop: 4 }}>
            <TextWidget
              text={progressText}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: 9.5,
                fontWeight: "600",
                color: hex(colors.onDarkMuted),
                marginBottom: 3,
              }}
            />
            {/* Progress bar */}
            <FlexWidget
              style={{
                width: "match_parent",
                height: 3,
                borderRadius: 2,
                backgroundColor: hex("#3D3336"),
                flexDirection: "row",
                overflow: "hidden",
                marginBottom: 6,
              }}
            >
              <FlexWidget
                style={{
                  flex: Math.max(1, pct),
                  height: 3,
                  backgroundColor: hex(colors.primaryLight),
                  borderRadius: 2,
                }}
              />
              {pct < 100 ? (
                <FlexWidget
                  style={{
                    flex: 100 - Math.max(1, pct),
                    height: 3,
                  }}
                />
              ) : null}
            </FlexWidget>

            {/* Resume button */}
            <FlexWidget style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <FlexWidget
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: hex(colors.primary),
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 10,
                }}
              >
                <SvgWidget svg={svg(ICON.play, colors.onPrimary)} style={{ width: 10, height: 10 }} />
                <TextWidget
                  text="Resume"
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: hex(colors.onPrimary),
                    marginLeft: 3,
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}


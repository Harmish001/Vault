/**
 * DocVault's whole look lives in this file. Change a value here and every screen, the lock screen,
 * the home-screen widget and the app config (splash screen, launcher icon background, notification
 * color, via app.config.ts) follow. Launcher icon artwork reads these colors too: run `npm run icons`.
 *
 * Keep colors as 6-digit hex (#RRGGBB): some screens add a 2-digit alpha, e.g. colors.primary + "14".
 *
 * Palette: maroon primary, used sparingly for key actions, with a pine green secondary on warm
 * neutrals. Large surfaces (lock screen, splash, widget, dialog overlay) stay charcoal, and no
 * other color is close to maroon so it stays distinct. No blue or orange tones.
 */
export const colors = {
  // Surfaces
  bg: "#F6F5F2", // screen background
  surface: "#FFFFFF", // cards, sheets, inputs
  surfaceAlt: "#EFEEEA", // pressed rows, subtle fills
  line: "#E2E0DA", // borders and dividers

  // Text
  ink: "#1F1B1C", // main text
  muted: "#6D6668", // secondary text, inactive icons

  // Brand
  primary: "#7A1F35", // maroon: buttons, links, selected chips
  primaryLight: "#9A2F4A", // highlights in the icon artwork
  primaryDark: "#221C1E", // warm charcoal: lock screen, splash, widget background
  primarySoft: "#F7EEF0", // info panels, tinted cards
  primaryLine: "#E8D3D8", // borders of tinted cards
  accent: "#2F5D4A", // pine green secondary: second floating button, unlock button
  onPrimary: "#FFFFFF", // text and icons on primary, accent and primaryDark
  onDarkMuted: "#BDB3B5", // secondary text on primaryDark
  star: "#7A1F35", // favorite star

  // Status
  success: "#2E7D4F",
  danger: "#D0342C", // brighter scarlet so errors never look like the maroon brand color
  dangerSoft: "#FDECEA",
  dangerInk: "#A3231C",
  warnSoft: "#FAF6DD",
  warnLine: "#E6DCA2",
  warnInk: "#635500",
  neutralSoft: "#EFEEEA",
  neutralInk: "#58524F",

  // Misc
  backdrop: "rgba(20, 18, 19, 0.5)", // behind sheets and dialogs, neutral on purpose
  shadow: "#000000",
  switchOff: "#D9D7D1", // switch track when off
};

/** Colors offered for folders (one per family member works well). Only one maroon. */
export const folderColors = [
  "#7A1F35", // maroon
  "#2F5D4A", // pine
  "#6B8A76", // sage
  "#4A4A48", // charcoal
  "#6B6B2E", // olive
  "#7D6E66", // taupe
  "#8A7F5A", // khaki
  "#4F6B3A", // moss
];

/** File-type badges and placeholder thumbnails. */
export const kindColors = {
  image: { bg: "#F2EEEB", fg: "#6E5F57" },
  pdf: { bg: "#F7EEF0", fg: "#7A1F35" },
  doc: { bg: "#E9F0EC", fg: "#2F5D4A" },
  sheet: { bg: "#F0F0E1", fg: "#5C5C24" },
  video: { bg: "#EEF2E8", fg: "#4F6B3A" },
  other: { bg: "#EFEEEA", fg: "#58524F" },
} as const;

/** Expiry and due-date badges. */
export const toneColors = {
  ok: { bg: colors.neutralSoft, fg: colors.neutralInk },
  soon: { bg: colors.warnSoft, fg: colors.warnInk },
  expired: { bg: colors.dangerSoft, fg: colors.dangerInk },
} as const;

export const fonts = {
  title: "BricolageGrotesque_700Bold",
  heading: "BricolageGrotesque_600SemiBold",
  body: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
};

export const radius = { sm: 8, md: 14, lg: 20 };

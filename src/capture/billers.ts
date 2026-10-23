import type { ReminderCategory, Repeat } from "../types";

export type BillerEntry = {
  name: string;
  aliases: string[];
  category: ReminderCategory;
  repeat: Repeat;
};

export const BILLERS: BillerEntry[] = [
  { name: "Netflix", aliases: ["netflix"], category: "subscription", repeat: "monthly" },
  { name: "Amazon Prime", aliases: ["amazon prime", "prime membership"], category: "subscription", repeat: "yearly" },
  { name: "Disney+ Hotstar", aliases: ["hotstar", "disney+"], category: "subscription", repeat: "yearly" },
  { name: "YouTube Premium", aliases: ["youtube premium", "youtube music premium"], category: "subscription", repeat: "monthly" },
  { name: "Spotify", aliases: ["spotify"], category: "subscription", repeat: "monthly" },
  { name: "JioHotstar", aliases: ["jiohotstar"], category: "subscription", repeat: "yearly" },
  { name: "Airtel", aliases: ["airtel"], category: "telecom", repeat: "monthly" },
  { name: "Jio", aliases: ["reliance jio", "jiofiber", "jio postpaid", "jio"], category: "telecom", repeat: "monthly" },
  { name: "Vi", aliases: ["vodafone idea", "vi postpaid", "vi "], category: "telecom", repeat: "monthly" },
  { name: "BSNL", aliases: ["bsnl"], category: "telecom", repeat: "monthly" },
  { name: "Torrent Power", aliases: ["torrent power"], category: "utility", repeat: "monthly" },
  { name: "Gujarat Gas", aliases: ["gujarat gas"], category: "utility", repeat: "monthly" },
  { name: "DGVCL", aliases: ["dgvcl", "dakshin gujarat vij"], category: "utility", repeat: "monthly" },
  { name: "MSEDCL", aliases: ["msedcl", "mahavitaran"], category: "utility", repeat: "monthly" },
  { name: "Tata Power", aliases: ["tata power"], category: "utility", repeat: "monthly" },
  { name: "HDFC Bank Credit Card", aliases: ["hdfc bank credit card", "hdfc credit card", "hdfc card"], category: "card", repeat: "monthly" },
  { name: "SBI Card", aliases: ["sbi card", "sbi credit card"], category: "card", repeat: "monthly" },
  { name: "ICICI Bank Credit Card", aliases: ["icici bank credit card", "icici credit card", "icici card"], category: "card", repeat: "monthly" },
  { name: "LIC of India", aliases: ["lic of india", "life insurance corporation", "lic premium", "lic "], category: "insurance", repeat: "yearly" },
  { name: "HDFC Life", aliases: ["hdfc life"], category: "insurance", repeat: "yearly" },
  { name: "Star Health", aliases: ["star health"], category: "insurance", repeat: "yearly" },
];

export const SMS_HEADER_MAP: Record<string, { name: string; category: ReminderCategory; repeat: Repeat }> = {
  AIRTEL: { name: "Airtel", category: "telecom", repeat: "monthly" },
  JIOPAY: { name: "Jio", category: "telecom", repeat: "monthly" },
  JIO: { name: "Jio", category: "telecom", repeat: "monthly" },
  HDFCBK: { name: "HDFC Bank Credit Card", category: "card", repeat: "monthly" },
  SBICRD: { name: "SBI Card", category: "card", repeat: "monthly" },
  ICICIB: { name: "ICICI Bank Credit Card", category: "card", repeat: "monthly" },
  LICIND: { name: "LIC of India", category: "insurance", repeat: "yearly" },
};

export const CATEGORY_DEFAULTS: Record<
  ReminderCategory,
  { defaultRepeat: Repeat; defaultOffsets: number[]; icon: string }
> = {
  subscription: { defaultRepeat: "monthly", defaultOffsets: [3, 1, 0], icon: "tv" },
  telecom: { defaultRepeat: "monthly", defaultOffsets: [1, 0], icon: "smartphone" },
  utility: { defaultRepeat: "monthly", defaultOffsets: [2, 0], icon: "zap" },
  card: { defaultRepeat: "monthly", defaultOffsets: [3, 0], icon: "credit-card" },
  emi: { defaultRepeat: "monthly", defaultOffsets: [2, 0], icon: "credit-card" },
  insurance: { defaultRepeat: "yearly", defaultOffsets: [30, 7, 0], icon: "shield" },
  rent: { defaultRepeat: "monthly", defaultOffsets: [2, 0], icon: "home" },
  other: { defaultRepeat: "none", defaultOffsets: [1, 0], icon: "file-text" },
};

export const CATEGORY_KEYWORDS: { category: ReminderCategory; keywords: string[] }[] = [
  { category: "subscription", keywords: ["subscription", "renews", "auto-renew", "membership", "next billing"] },
  { category: "telecom", keywords: ["recharge", "postpaid", "broadband", "fibre", "dth"] },
  { category: "utility", keywords: ["electricity", "consumer no", "gas", "water", "meter"] },
  { category: "card", keywords: ["credit card", "card ending", "statement"] },
  { category: "emi", keywords: ["emi", "loan", "instalment"] },
  { category: "insurance", keywords: ["premium", "policy", "insurance", "sum assured"] },
  { category: "rent", keywords: ["rent"] },
];

import { stripFileScheme } from "../utils";

let nativeExtractText: ((uri: string) => Promise<string[]>) | null = null;
let nativeSupported = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const extractor = require("expo-text-extractor");
  nativeExtractText = extractor.extractTextFromImage;
  nativeSupported = !!extractor.isSupported;
} catch {
  nativeSupported = false;
  nativeExtractText = null;
}

export const ocrSupported = nativeSupported;

/** Reads the text on a page image, on the phone (Google ML Kit through Play services). */
export async function readPageText(uri: string): Promise<string> {
  if (!nativeSupported || !nativeExtractText) return "";
  try {
    const blocks = await nativeExtractText(stripFileScheme(uri));
    return blocks.join("\n");
  } catch {
    return "";
  }
}

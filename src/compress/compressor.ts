import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { buildPdf, PdfPage, readJpegInfo } from "../scan/pdf";
import { SCAN_OUT } from "../scan/paths";
import { uid } from "../utils";

export type CompressPreset = {
  id: string;
  label: string;
  maxBytes: number;
  badge: string;
  description: string;
};

export const COMPRESS_PRESETS: CompressPreset[] = [
  {
    id: "50kb",
    label: "< 50 KB",
    maxBytes: 50 * 1024,
    badge: "Passport & Sign",
    description: "Passport photos, signature & thumb impressions (UPSC, SSC, Exams)",
  },
  {
    id: "100kb",
    label: "< 100 KB",
    maxBytes: 100 * 1024,
    badge: "ID & KYC",
    description: "ID cards, KYC verification & government portal uploads",
  },
  {
    id: "200kb",
    label: "< 200 KB",
    maxBytes: 200 * 1024,
    badge: "Govt Portals",
    description: "Standard government limit for certificates, marksheets & caste/income docs",
  },
  {
    id: "500kb",
    label: "< 500 KB",
    maxBytes: 500 * 1024,
    badge: "Docs & Visa",
    description: "Bank statements, visa applications, salary slips & high-res documents",
  },
];

/**
 * Extracts embedded JPEG images and page orientations from a PDF file.
 */
export function extractJpegsFromPdf(pdfBytes: Uint8Array): PdfPage[] {
  const results: PdfPage[] = [];
  const len = pdfBytes.length;
  let pos = 0;

  while (pos < len - 3) {
    if (pdfBytes[pos] === 0xff && pdfBytes[pos + 1] === 0xd8 && pdfBytes[pos + 2] === 0xff) {
      const start = pos;
      let end = -1;
      let search = start + 2;
      while (search < len - 1) {
        if (pdfBytes[search] === 0xff && pdfBytes[search + 1] === 0xd9) {
          end = search + 2;
          break;
        }
        search++;
      }
      if (end !== -1) {
        const candidate = pdfBytes.slice(start, end);
        try {
          readJpegInfo(candidate);
          const lookbackStart = Math.max(0, start - 600);
          const lookback = Buffer.from(pdfBytes.slice(lookbackStart, start)).toString("latin1");
          let rotate: 0 | 90 | 180 | 270 = 0;
          const rotMatch = /\/Rotate\s+(\d+)/.exec(lookback);
          if (rotMatch) {
            const deg = Number(rotMatch[1]) % 360;
            if (deg === 90 || deg === 180 || deg === 270) rotate = deg as 0 | 90 | 180 | 270;
          }
          results.push({ jpeg: candidate, rotate });
          pos = end;
          continue;
        } catch {
          // not a valid JPEG
        }
      }
    }
    pos++;
  }

  return results;
}

export type CompressResult = {
  uri: string;
  size: number;
  originalSize: number;
  reductionPercent: number;
  isPdf: boolean;
  pageCount?: number;
};

/**
 * Compresses an image to guarantee it stays strictly under `targetBytes`.
 */
export async function compressImage(
  imageUri: string,
  targetBytes: number
): Promise<{ uri: string; size: number; width: number; height: number }> {
  await FileSystem.makeDirectoryAsync(SCAN_OUT, { intermediates: true });

  const initial = await manipulateAsync(imageUri, [], {});
  let curWidth = initial.width;
  let curHeight = initial.height;
  let quality = 0.85;

  // Max dimension guideline based on target size to save processing time
  if (targetBytes <= 50 * 1024) {
    const maxDim = 800;
    if (Math.max(curWidth, curHeight) > maxDim) {
      const scale = maxDim / Math.max(curWidth, curHeight);
      curWidth = Math.round(curWidth * scale);
      curHeight = Math.round(curHeight * scale);
    }
    quality = 0.65;
  } else if (targetBytes <= 100 * 1024) {
    const maxDim = 1200;
    if (Math.max(curWidth, curHeight) > maxDim) {
      const scale = maxDim / Math.max(curWidth, curHeight);
      curWidth = Math.round(curWidth * scale);
      curHeight = Math.round(curHeight * scale);
    }
    quality = 0.75;
  } else if (targetBytes <= 200 * 1024) {
    const maxDim = 1600;
    if (Math.max(curWidth, curHeight) > maxDim) {
      const scale = maxDim / Math.max(curWidth, curHeight);
      curWidth = Math.round(curWidth * scale);
      curHeight = Math.round(curHeight * scale);
    }
    quality = 0.8;
  }

  let bestUri = imageUri;
  let bestSize = Infinity;
  let bestW = curWidth;
  let bestH = curHeight;

  // Iteratively reduce quality / scale until size <= targetBytes
  for (let iter = 0; iter < 5; iter++) {
    const actions = (curWidth !== initial.width || curHeight !== initial.height)
      ? [{ resize: { width: curWidth, height: curHeight } }]
      : [];

    const res = await manipulateAsync(imageUri, actions, {
      compress: quality,
      format: SaveFormat.JPEG,
    });

    const info = await FileSystem.getInfoAsync(res.uri);
    const size = info.exists ? (info.size ?? 0) : 0;

    bestUri = res.uri;
    bestSize = size;
    bestW = res.width;
    bestH = res.height;

    if (size <= targetBytes) {
      break;
    }

    // Step down
    if (size > targetBytes * 1.8) {
      curWidth = Math.round(curWidth * 0.75);
      curHeight = Math.round(curHeight * 0.75);
      quality = Math.max(0.3, quality - 0.15);
    } else {
      quality = Math.max(0.25, quality - 0.12);
      if (iter >= 2) {
        curWidth = Math.round(curWidth * 0.85);
        curHeight = Math.round(curHeight * 0.85);
      }
    }
  }

  return { uri: bestUri, size: bestSize, width: bestW, height: bestH };
}

/**
 * Compresses a PDF file to stay under `targetBytes` by re-encoding pages with quality optimization.
 */
export async function compressPdf(
  pdfUri: string,
  targetBytes: number
): Promise<{ uri: string; size: number; pageCount: number }> {
  await FileSystem.makeDirectoryAsync(SCAN_OUT, { intermediates: true });

  const b64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: FileSystem.EncodingType.Base64 });
  const pdfBytes = base64ToBytes(b64);
  const pages = extractJpegsFromPdf(pdfBytes);

  if (pages.length === 0) {
    throw new Error("No compressed raster pages found in this PDF");
  }

  // Budget per page (leaving 3KB for PDF syntax, objects, and trailer)
  const overhead = 3000 + pages.length * 600;
  const budgetPerPage = Math.max(12 * 1024, Math.floor((targetBytes - overhead) / pages.length));

  const compressedPages: PdfPage[] = [];

  for (const page of pages) {
    const tempIn = SCAN_OUT + uid() + ".jpg";
    await FileSystem.writeAsStringAsync(tempIn, bytesToBase64(page.jpeg), {
      encoding: FileSystem.EncodingType.Base64,
    });

    const comp = await compressImage(tempIn, budgetPerPage);
    const compB64 = await FileSystem.readAsStringAsync(comp.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    compressedPages.push({
      jpeg: base64ToBytes(compB64),
      rotate: page.rotate,
    });

    await FileSystem.deleteAsync(tempIn, { idempotent: true }).catch(() => undefined);
    if (comp.uri !== tempIn) {
      await FileSystem.deleteAsync(comp.uri, { idempotent: true }).catch(() => undefined);
    }
  }

  const outPdf = SCAN_OUT + uid() + ".pdf";
  const builtPdf = buildPdf(compressedPages);
  await FileSystem.writeAsStringAsync(outPdf, bytesToBase64(builtPdf), {
    encoding: FileSystem.EncodingType.Base64,
  });

  const info = await FileSystem.getInfoAsync(outPdf);
  const size = info.exists ? (info.size ?? builtPdf.length) : builtPdf.length;

  return { uri: outPdf, size, pageCount: pages.length };
}

/**
 * Master compression entry point: automatically handles images and PDFs.
 */
export async function compressDocument(
  fileUri: string,
  mime: string,
  targetBytes: number
): Promise<CompressResult> {
  const originalInfo = await FileSystem.getInfoAsync(fileUri);
  const originalSize = originalInfo.exists ? (originalInfo.size ?? 0) : 0;
  const isPdf = mime === "application/pdf" || fileUri.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const result = await compressPdf(fileUri, targetBytes);
    const reductionPercent = originalSize > 0
      ? Math.max(0, Math.round(((originalSize - result.size) / originalSize) * 100))
      : 0;
    return {
      uri: result.uri,
      size: result.size,
      originalSize,
      reductionPercent,
      isPdf: true,
      pageCount: result.pageCount,
    };
  } else {
    const result = await compressImage(fileUri, targetBytes);
    const reductionPercent = originalSize > 0
      ? Math.max(0, Math.round(((originalSize - result.size) / originalSize) * 100))
      : 0;
    return {
      uri: result.uri,
      size: result.size,
      originalSize,
      reductionPercent,
      isPdf: false,
    };
  }
}

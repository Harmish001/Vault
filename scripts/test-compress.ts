import { buildPdf, readJpegInfo } from "../src/scan/pdf";
import { base64ToBytes, bytesToBase64 } from "../src/scan/base64";

const TINY_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAYABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDk6KKK8I/VgooooA//2Q==";

/**
 * Extracts embedded JPEG images from a PDF file.
 */
export function extractJpegsFromPdf(pdfBytes: Uint8Array): { jpeg: Uint8Array; rotate: 0 | 90 | 180 | 270 }[] {
  const results: { jpeg: Uint8Array; rotate: 0 | 90 | 180 | 270 }[] = [];
  const len = pdfBytes.length;
  let pos = 0;

  while (pos < len - 3) {
    // Search for JPEG SOI marker: 0xFF, 0xD8, 0xFF
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
          // Look backward in the PDF text before 'start' to see if there is a /Rotate tag
          const lookbackStart = Math.max(0, start - 500);
          const lookback = Buffer.from(pdfBytes.slice(lookbackStart, start)).toString("latin1");
          let rotate: 0 | 90 | 180 | 270 = 0;
          const rotMatch = /\/Rotate\s+(\d+)/.exec(lookback);
          if (rotMatch) {
            const deg = Number(rotMatch[1]) % 360;
            if (deg === 90 || deg === 180 || deg === 270) rotate = deg;
          }
          results.push({ jpeg: candidate, rotate });
          pos = end;
          continue;
        } catch {
          // not a valid JPEG, keep scanning
        }
      }
    }
    pos++;
  }

  return results;
}

const originalJpeg = base64ToBytes(TINY_JPEG);
const pdf = buildPdf([{ jpeg: originalJpeg, rotate: 0 }, { jpeg: originalJpeg, rotate: 90 }]);
const extracted = extractJpegsFromPdf(pdf);

console.log("Extracted pages count:", extracted.length);
if (extracted.length !== 2) throw new Error("Failed to extract 2 pages");
if (extracted[0].rotate !== 0) throw new Error("Page 0 rotate mismatch");
if (extracted[1].rotate !== 90) throw new Error("Page 1 rotate mismatch");
console.log("All extract tests passed!");

/**
 * Minimal, dependency-free PDF writer: one JPEG per page, embedded as-is (no recompression),
 * so scans keep their full quality and the file stays small.
 */

export type PdfPage = {
  jpeg: Uint8Array;
  /** extra clockwise rotation chosen by the user: 0, 90, 180 or 270 */
  rotate: 0 | 90 | 180 | 270;
};

type JpegInfo = { width: number; height: number; components: number; exifRotate: 0 | 90 | 180 | 270 };

const A4_SHORT = 595.28;
const A4_LONG = 841.89;

export function readJpegInfo(b: Uint8Array): JpegInfo {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error("Not a JPEG file");
  let pos = 2;
  let exifRotate: 0 | 90 | 180 | 270 = 0;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = b[pos + 1];
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    const len = (b[pos + 2] << 8) | b[pos + 3];
    if (marker === 0xe1) exifRotate = parseExifOrientation(b, pos + 4, len - 2) ?? exifRotate;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (b[pos + 5] << 8) | b[pos + 6];
      const width = (b[pos + 7] << 8) | b[pos + 8];
      const components = b[pos + 9];
      if (!width || !height) throw new Error("JPEG has no size");
      return { width, height, components, exifRotate };
    }
    pos += 2 + len;
  }
  throw new Error("Could not read JPEG size");
}

function parseExifOrientation(b: Uint8Array, start: number, length: number): 0 | 90 | 180 | 270 | null {
  // "Exif\0\0" then a TIFF header
  if (length < 14 || b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66) return null;
  const t = start + 6;
  const little = b[t] === 0x49;
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    little
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > b.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v === 3 ? 180 : v === 6 ? 90 : v === 8 ? 270 : 0;
    }
  }
  return null;
}

const enc = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** Builds a PDF where each page is sized like A4 (portrait or landscape to match the scan). */
export function buildPdf(pages: PdfPage[]): Uint8Array {
  if (!pages.length) throw new Error("No pages");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array) => {
    chunks.push(c);
    length += c.length;
  };
  const startObj = (id: number) => {
    offsets[id] = length;
    push(enc(`${id} 0 obj\n`));
  };

  push(enc("%PDF-1.4\n"));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  // object ids: 1 catalog, 2 pages, then 3 per page (page, contents, image)
  const pageIds = pages.map((_, i) => 3 + i * 3);

  startObj(1);
  push(enc("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  startObj(2);
  push(enc(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`));

  pages.forEach((p, i) => {
    const info = readJpegInfo(p.jpeg);
    const rot = ((info.exifRotate + p.rotate) % 360) as 0 | 90 | 180 | 270;
    const sideways = rot === 90 || rot === 270;
    const dispW = sideways ? info.height : info.width;
    const dispH = sideways ? info.width : info.height;
    const boxW = dispH >= dispW ? A4_SHORT : A4_LONG;
    const boxH = dispH >= dispW ? A4_LONG : A4_SHORT;
    const scale = Math.min(boxW / dispW, boxH / dispH);
    const w = info.width * scale; // page size *before* /Rotate is applied
    const h = info.height * scale;

    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;

    startObj(pageId);
    push(
      enc(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Rotate ${rot} ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
      )
    );

    const stream = enc(`q\n${num(w)} 0 0 ${num(h)} 0 0 cm\n/Im0 Do\nQ\n`);
    startObj(contentId);
    push(enc(`<< /Length ${stream.length} >>\nstream\n`));
    push(stream);
    push(enc("endstream\nendobj\n"));

    const cs = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const decode = info.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
    startObj(imageId);
    push(
      enc(
        `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${cs}${decode} ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`
      )
    );
    push(p.jpeg);
    push(enc("\nendstream\nendobj\n"));
  });

  const objCount = 2 + pages.length * 3;
  const xrefPos = length;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objCount; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  push(enc(xref));

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

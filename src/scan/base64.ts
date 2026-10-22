const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i;

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, "");
  let pad = 0;
  if (clean.endsWith("==")) pad = 2;
  else if (clean.endsWith("=")) pad = 1;
  const len = (clean.length / 4) * 3 - pad;
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    if (o < len) out[o++] = (a << 2) | (b >> 4);
    if (o < len) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < len) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096; // keeps each string piece small
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    let s = "";
    let i = start;
    for (; i + 2 < end; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63] + CHARS[(n >> 6) & 63] + CHARS[n & 63];
    }
    if (i < end) {
      const rem = end - i;
      const n = (bytes[i] << 16) | ((rem === 2 ? bytes[i + 1] : 0) << 8);
      s += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63] + (rem === 2 ? CHARS[(n >> 6) & 63] : "=") + "=";
    }
    parts.push(s);
  }
  return parts.join("");
}

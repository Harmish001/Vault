// Run with: npm test   (checks the PDF writer and base64 helpers without needing a phone)
import { buildPdf, readJpegInfo } from "../src/scan/pdf";
import { base64ToBytes, bytesToBase64 } from "../src/scan/base64";

const TINY_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAYABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDk6KKK8I/VgooooA//2Q==";
const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

for (const n of [0, 1, 2, 3, 4, 5, 100, 1001]) {
  const a = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
  const same = Buffer.compare(Buffer.from(a), Buffer.from(base64ToBytes(bytesToBase64(a)))) === 0;
  assert(same && bytesToBase64(a) === Buffer.from(a).toString("base64"), `base64 round-trip, ${n} bytes`);
}

const jpeg = base64ToBytes(TINY_JPEG);
const info = readJpegInfo(jpeg);
assert(info.width === 16 && info.height === 24 && info.components === 3, "reads JPEG size");

const pdf = buildPdf([{ jpeg, rotate: 0 }, { jpeg, rotate: 90 }]);
const text = Buffer.from(pdf).toString("latin1");
assert(text.startsWith("%PDF-1.4"), "PDF header");
assert(text.includes("/Count 2"), "two pages");
assert(text.includes("/Rotate 90"), "page rotation");
assert(text.trimEnd().endsWith("%%EOF"), "PDF trailer");
console.log("all scan tests passed");

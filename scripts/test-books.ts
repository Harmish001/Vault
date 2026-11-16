import assert from "node:assert";
import JSZip from "jszip";
import { DRM_ERROR_MESSAGE, parseEpub } from "../src/reader/epubMetadata";
import { Book, getBookStatus } from "../src/types";
import { getPdfReaderHtml } from "../src/reader/pdfHtml";

console.log("running books and reader tests...");

async function runTests() {
  // Test 1: Valid EPUB parsing
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Great Indian Novel</dc:title>
    <dc:creator>Shashi Tharoor</dc:creator>
  </metadata>
  <manifest>
    <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="chap1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chap1"/>
  </spine>
</package>`
  );

  // Tiny dummy 1x1 JPEG bytes
  const dummyCoverBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  zip.file("OEBPS/images/cover.jpg", dummyCoverBytes);

  const epubBytes = await zip.generateAsync({ type: "uint8array" });
  const meta = await parseEpub(epubBytes);

  assert.strictEqual(meta.title, "The Great Indian Novel", "Title extracted correctly");
  assert.strictEqual(meta.author, "Shashi Tharoor", "Author extracted correctly");
  assert.ok(meta.coverBase64, "Cover image extracted as base64");
  assert.strictEqual(meta.coverMime, "image/jpeg", "Cover mime matches");
  console.log("ok - valid EPUB parsing and metadata extraction");

  // Test 2: DRM Protected EPUB rejection
  const drmZip = new JSZip();
  drmZip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`
  );
  drmZip.file(
    "META-INF/encryption.xml",
    `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData><CipherData><CipherValue>test</CipherValue></CipherData></EncryptedData></encryption>`
  );

  const drmBytes = await drmZip.generateAsync({ type: "uint8array" });
  let rejected = false;
  try {
    await parseEpub(drmBytes);
  } catch (err: any) {
    if (err.message === DRM_ERROR_MESSAGE) {
      rejected = true;
    }
  }
  assert.ok(rejected, "DRM encrypted EPUB is rejected with exact required message");
  console.log("ok - DRM protected EPUB rejection with user-facing message");

  // Test 3: Invalid/corrupt file rejection
  let corruptRejected = false;
  try {
    await parseEpub(new Uint8Array([1, 2, 3, 4, 5]));
  } catch (err: any) {
    if (err.message === DRM_ERROR_MESSAGE) {
      corruptRejected = true;
    }
  }
  assert.ok(corruptRejected, "Corrupt file rejected without crash");
  console.log("ok - Corrupt/invalid file handling");

  // Test 4: Book status derivation
  const testBook: Book = {
    id: "b-1",
    title: "Test Book",
    type: "epub",
    isFavorite: false,
    addedAt: Date.now(),
    progress: {
      percentage: 0,
      updatedAt: Date.now(),
    },
  };
  assert.strictEqual(getBookStatus(testBook), "unread");

  testBook.progress.percentage = 0.45;
  assert.strictEqual(getBookStatus(testBook), "reading");

  testBook.progress.percentage = 0.99;
  assert.strictEqual(getBookStatus(testBook), "finished");

  // PDF book status with pdfPage
  const pdfBook: Book = {
    id: "b-pdf",
    title: "Test PDF Book",
    type: "pdf",
    isFavorite: false,
    addedAt: Date.now(),
    progress: {
      percentage: 0,
      pdfPage: 12,
      pdfTotalPages: 50,
      updatedAt: Date.now(),
    },
  };
  assert.strictEqual(getBookStatus(pdfBook), "reading", "PDF with page progress is reading");
  console.log("ok - Book status derivation (unread, reading, finished)");

  // Test 5: PDF reader HTML generation
  const dummyPdfB64 = Buffer.from("%PDF-1.4 test").toString("base64");
  const htmlBase64 = getPdfReaderHtml(dummyPdfB64, true, 5, "light");
  assert.ok(htmlBase64.includes("pdfjsLib"), "PDF HTML includes pdfjsLib");
  assert.ok(htmlBase64.includes(dummyPdfB64), "PDF HTML includes base64 payload when isBase64=true");
  assert.ok(htmlBase64.includes("curPage = 5"), "PDF HTML sets initial page");

  const dummyPdfUri = "file:///data/user/0/com.docvault/files/books/book_123.pdf";
  const htmlUri = getPdfReaderHtml(dummyPdfUri, false, 3, "dark");
  assert.ok(htmlUri.includes("pdfjsLib"), "PDF HTML includes pdfjsLib");
  assert.ok(htmlUri.includes(dummyPdfUri), "PDF HTML includes direct file URL for fast streaming without OOM");
  assert.ok(htmlUri.includes("filter: invert"), "Dark theme applies canvas invert filter");
  console.log("ok - Offline PDF HTML template generator (streaming file URI & base64)");

  console.log("All books and reader tests passed successfully!");
}

runTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});


import JSZip from "jszip";

export type EpubMetadata = {
  title: string;
  author: string | null;
  coverBase64: string | null;
  coverMime: string | null;
};

export const DRM_ERROR_MESSAGE =
  "This book is protected or unreadable. Only DRM-free EPUB and PDF files can be opened.";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractTagValue(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match || !match[1]) return null;
  return decodeXmlEntities(match[1].trim());
}

/**
 * Checks whether an EPUB file has DRM or encryption.
 */
function checkForDrm(zip: JSZip, encryptionXml: string | null, rightsXml: string | null): boolean {
  if (rightsXml && rightsXml.length > 0) {
    if (/adept|fairplay|drm|license/i.test(rightsXml)) {
      return true;
    }
  }

  if (encryptionXml && encryptionXml.length > 0) {
    // Check if it has EncryptedKey or CipherData
    if (/<(?:[a-zA-Z0-9_]+:)?EncryptedKey/i.test(encryptionXml)) {
      return true;
    }

    // Font obfuscation algorithms are standard and NOT content DRM
    const cleaned = encryptionXml
      .replace(/http:\/\/www\.idpf\.org\/2008\/embedding/gi, "")
      .replace(/http:\/\/ns\.adobe\.com\/pdf\/enc#font/gi, "");

    if (/<(?:[a-zA-Z0-9_]+:)?CipherData/i.test(cleaned)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves a relative path inside an EPUB zip archive.
 */
function resolveZipPath(baseDir: string, relativePath: string): string {
  const cleanBase = baseDir.replace(/\\/g, "/").replace(/\/$/, "");
  const cleanRel = relativePath.replace(/\\/g, "/");

  if (!cleanBase || cleanRel.startsWith("/")) {
    return cleanRel.replace(/^\//, "");
  }

  const parts = cleanBase.split("/");
  const relParts = cleanRel.split("/");

  for (const part of relParts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * Parses EPUB bytes and extracts metadata and cover image.
 * Throws DRM_ERROR_MESSAGE if encrypted or unreadable.
 */
export async function parseEpub(bytes: Uint8Array, fallbackTitle = "Untitled Book"): Promise<EpubMetadata> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error(DRM_ERROR_MESSAGE);
  }

  // Verify container.xml exists
  const containerEntry = zip.file("META-INF/container.xml");
  if (!containerEntry) {
    throw new Error(DRM_ERROR_MESSAGE);
  }

  // Check for DRM in encryption.xml or rights.xml
  const encEntry = zip.file("META-INF/encryption.xml");
  const encText = encEntry ? await encEntry.async("text") : null;
  const rightsEntry = zip.file("META-INF/rights.xml");
  const rightsText = rightsEntry ? await rightsEntry.async("text") : null;

  if (checkForDrm(zip, encText, rightsText)) {
    throw new Error(DRM_ERROR_MESSAGE);
  }

  // Parse container.xml to locate OPF package file
  const containerXml = await containerEntry.async("text");
  const rootfileMatch = containerXml.match(/<rootfile[^>]+full-path=["']([^"']+)["']/i);
  if (!rootfileMatch || !rootfileMatch[1]) {
    throw new Error(DRM_ERROR_MESSAGE);
  }

  const opfPath = rootfileMatch[1].trim();
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    throw new Error(DRM_ERROR_MESSAGE);
  }

  const opfXml = await opfEntry.async("text");
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";

  // Title & Author
  const title = extractTagValue(opfXml, "title") || fallbackTitle;
  const author = extractTagValue(opfXml, "creator") || null;

  // Cover image extraction
  let coverHref: string | null = null;
  let coverMime: string | null = null;

  // 1. EPUB3: <item ... properties="cover-image" ... href="..." media-type="..."/>
  const epub3CoverMatch = opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]*>/i);
  if (epub3CoverMatch) {
    const hrefM = epub3CoverMatch[0].match(/href=["']([^"']+)["']/i);
    const mimeM = epub3CoverMatch[0].match(/media-type=["']([^"']+)["']/i);
    if (hrefM) coverHref = hrefM[1];
    if (mimeM) coverMime = mimeM[1];
  }

  // 2. EPUB2: <meta name="cover" content="cover-id"/> -> <item id="cover-id" href="..." media-type="..."/>
  if (!coverHref) {
    const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) ||
      opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);
    if (metaCoverMatch && metaCoverMatch[1]) {
      const coverId = metaCoverMatch[1];
      const itemRegex = new RegExp(`<item[^>]+id=["']${coverId}["'][^>]*>`, "i");
      const itemMatch = opfXml.match(itemRegex);
      if (itemMatch) {
        const hrefM = itemMatch[0].match(/href=["']([^"']+)["']/i);
        const mimeM = itemMatch[0].match(/media-type=["']([^"']+)["']/i);
        if (hrefM) coverHref = hrefM[1];
        if (mimeM) coverMime = mimeM[1];
      }
    }
  }

  // 3. Fallback: item with id="cover" or href containing "cover"
  if (!coverHref) {
    const fallbackItemMatch = opfXml.match(/<item[^>]+(?:id=["']cover["']|href=["'][^"']*cover[^"']*\.(?:jpe?g|png|webp)["'])[^>]*>/i);
    if (fallbackItemMatch) {
      const hrefM = fallbackItemMatch[0].match(/href=["']([^"']+)["']/i);
      const mimeM = fallbackItemMatch[0].match(/media-type=["']([^"']+)["']/i);
      if (hrefM) coverHref = hrefM[1];
      if (mimeM) coverMime = mimeM[1];
    }
  }

  let coverBase64: string | null = null;
  if (coverHref) {
    const resolvedPath = resolveZipPath(opfDir, decodeURIComponent(coverHref));
    const coverEntry = zip.file(resolvedPath);
    if (coverEntry) {
      coverBase64 = await coverEntry.async("base64");
      if (!coverMime) {
        if (resolvedPath.endsWith(".png")) coverMime = "image/png";
        else if (resolvedPath.endsWith(".webp")) coverMime = "image/webp";
        else coverMime = "image/jpeg";
      }
    }
  }

  return {
    title,
    author,
    coverBase64,
    coverMime,
  };
}


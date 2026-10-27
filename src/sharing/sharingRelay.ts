/**
 * Relay client: uploads an encrypted share bundle to the vault-share Next.js backend
 * and gets back a short-lived token. The relay stores ONLY ciphertext — the AES key
 * never leaves the device; it goes only into the QR code's #hash fragment.
 *
 * The RELAY_BASE_URL should point to your deployed vault-share Next.js app.
 * During development you can point it at a locally-running server.
 */

export const RELAY_BASE_URL = "https://vault-share-beta.vercel.app"; // ← update after deploy

export type ShareItem = {
  /** Unique id, same as VaultFile.id or Note.id */
  id: string;
  /** Display name shown in the web viewer */
  name: string;
  /** MIME type, e.g. "application/pdf" or "text/plain" */
  mime: string;
  /** Encrypted payload (URL-safe base64, produced by sharingCrypto.encryptBlob/encryptText) */
  encrypted: string;
  /** Size in bytes of the *original* (unencrypted) data — for display only */
  originalSize: number;
};

export type ShareBundle = {
  /** Share format version */
  v: 1;
  /** ISO timestamp when the bundle was created */
  createdAt: string;
  /** Array of items being shared */
  items: ShareItem[];
};

export type UploadResult = {
  token: string;
  expiresAt: number; // epoch ms
};

/**
 * Upload the encrypted bundle to the relay.
 * Returns the token and expiry so we can show a countdown and build the QR URL.
 *
 * @param bundle  The pre-encrypted share bundle (JSON-stringified then encrypted).
 * @param ttlSec  Time-to-live in seconds (default 300 = 5 minutes).
 */
export async function uploadBundle(
  encryptedBundle: string,
  ttlSec = 300,
): Promise<UploadResult> {
  const res = await fetch(`${RELAY_BASE_URL}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: encryptedBundle, ttlSec }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Relay upload failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { token: string; expiresAt: number };
  return data;
}

/**
 * Tell the relay to delete a session early (user pressed "Stop Sharing").
 */
export async function deleteBundle(token: string): Promise<void> {
  await fetch(`${RELAY_BASE_URL}/api/share/${token}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

/**
 * Build the full QR URL given the relay token and the raw AES key.
 * The key goes into the #hash — it is NEVER sent to any server.
 *
 * Format:  https://vault-share.vercel.app/view/<token>#key=<urlbase64key>
 */
export function buildShareUrl(token: string, keyBase64: string): string {
  return `${RELAY_BASE_URL}/view/${token}#key=${keyBase64}`;
}

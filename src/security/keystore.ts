import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";

const KEY_NAME = "docvault_master_key_v1";

/**
 * The master key is a random 256-bit value kept in Android's Keystore-backed secure storage.
 * It never leaves the phone and is not derived from any password.
 *
 * create=false never makes a new key: a transient read problem must not be able to replace
 * the real key, because that would make existing data unreadable forever.
 */
export async function loadKey(create: boolean): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(KEY_NAME);
  if (stored) return base64ToBytes(stored);
  if (!create) return null;
  const key = Crypto.getRandomBytes(32);
  const b64 = bytesToBase64(key);
  await SecureStore.setItemAsync(KEY_NAME, b64);
  if ((await SecureStore.getItemAsync(KEY_NAME)) !== b64) {
    throw new Error("The encryption key could not be saved on this phone.");
  }
  return key;
}

export const randomNonce = () => Crypto.getRandomBytes(12);

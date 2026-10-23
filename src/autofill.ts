import { requireOptionalNativeModule } from "expo";
import type { FillProfile } from "./autofill-data";

export { buildFillProfiles } from "./autofill-data";

const native = requireOptionalNativeModule<{
  isSupported(): boolean;
  isEnabled(): boolean;
  setData(json: string): void;
  clear(): void;
  openSettings(): boolean;
  disable(): void;
}>("VaultAutofill");

export const autofillSupported = () => native?.isSupported() ?? false;
/** DocVault is the phone's selected autofill service */
export const autofillSelected = () => native?.isEnabled() ?? false;
export const openAutofillSettings = () => native?.openSettings() ?? false;

/** Hands the current details to the Android side, or removes them when `profiles` is null. */
export function syncAutofill(profiles: FillProfile[] | null) {
  try {
    if (profiles?.length) native?.setData(JSON.stringify({ profiles }));
    else native?.clear();
  } catch {
    // Keystore hiccups shouldn't break the app; the next change writes again
  }
}

export function turnOffAutofill() {
  try {
    native?.disable();
  } catch {
    // already off
  }
}

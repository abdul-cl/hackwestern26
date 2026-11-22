// Your name, email, phone and postal code for Auto-fill, kept in the phone's encrypted keychain
// (SecureStore) and only handed back after Face ID / fingerprint / passcode. Phones only: the
// browser has no keychain, so the feature just doesn't show there
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { PatientInfo } from "./types";

const KEY = "carescout_patient_details";

export async function canSaveDetails() {
  if (Platform.OS === "web") return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function hasSavedDetails() {
  if (!(await canSaveDetails())) return false;
  try {
    return !!(await SecureStore.getItemAsync(KEY));
  } catch {
    return false;
  }
}

export async function saveDetails(d: PatientInfo) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(d));
}

export async function forgetDetails() {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing saved, that's fine
  }
}

// what the unlock button should say ("Face ID", "fingerprint"...)
export async function unlockLabel() {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "Face ID" : "face unlock";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "Touch ID" : "fingerprint";
  } catch {
    // fall through
  }
  return "your passcode";
}

export type UnlockResult = { ok: true; details: PatientInfo } | { ok: false; reason: string };

// asks for Face ID / fingerprint (falls back to the phone passcode), then reads the details
export async function unlockDetails(): Promise<UnlockResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock your saved details",
      cancelLabel: "Cancel",
      fallbackLabel: "Use passcode",
    });
    if (!result.success) {
      // "not_enrolled" / "passcode_not_set" means the phone itself has no lock at all
      const noLock = result.error === "not_enrolled" || result.error === "passcode_not_set" || result.error === "not_available";
      if (!noLock) return { ok: false, reason: result.error === "user_cancel" || result.error === "system_cancel" ? "" : "Couldn't unlock. Try again." };
    }
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return { ok: false, reason: "No saved details on this phone." };
    return { ok: true, details: JSON.parse(raw) as PatientInfo };
  } catch {
    return { ok: false, reason: "Couldn't read your saved details." };
  }
}

// false when the phone has no passcode, fingerprint or face set up, so we can say the details aren't locked
export async function phoneHasLock() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

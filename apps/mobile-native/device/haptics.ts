import * as Haptics from "expo-haptics";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { createTouchFeedback } from "./touch-feedback";

const preference = "zyx-haptics-enabled";
let enabled: boolean | undefined;

export function getHapticsEnabled(): boolean {
  if (enabled === undefined) {
    try {
      const stored = Storage.getItemSync(preference)?.trim().toLowerCase();
      enabled = stored !== "false" && stored !== "0";
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

export function setHapticsEnabled(value: boolean) {
  enabled = value;
  try {
    Storage.setItemSync(preference, String(value));
  } catch {
    // Keep honoring the current session preference when the device store is unavailable.
  }
}

const emit = createTouchFeedback(getHapticsEnabled, kind => {
  if (Platform.OS === "android") {
    const api = Number(Platform.Version);
    if (kind === "selection") {
      const tick = api >= 34 ? Haptics.AndroidHaptics.Segment_Tick : Haptics.AndroidHaptics.Clock_Tick;
      return Haptics.performAndroidHapticsAsync(tick);
    }
    if (kind === "light") return Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key);
    if (api >= 30) {
      return Haptics.performAndroidHapticsAsync(kind === "success" ? Haptics.AndroidHaptics.Confirm : Haptics.AndroidHaptics.Reject);
    }
  }
  if (kind === "selection") return Haptics.selectionAsync();
  if (kind === "light") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
});

export const hapticSelection = () => emit("selection");
export const hapticLight = () => emit("light");
export const hapticSuccess = () => emit("success");
export const hapticError = () => emit("error");

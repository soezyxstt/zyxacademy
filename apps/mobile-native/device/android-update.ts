import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { EXPO_ANDROID_PACKAGE, type ExpoAndroidRelease } from "../../../packages/native-session/expo-android-update";
import { readExpoAndroidUpdate } from "./android-update-policy";

export type AndroidUpdateResult = "confirmation-opened" | "permission-required" | "cancelled" | "invalid" | "failed" | "busy";
type InstalledApp = { packageName: string; version: string; versionCode: number };
type AndroidUpdater = {
  getInstalled(): InstalledApp | null;
  downloadAndInstall(url: string, version: string, code: number, bytes: number, sha256: string): Promise<AndroidUpdateResult>;
  openInstallSettings(): Promise<boolean>;
  cancel(): Promise<void>;
  addListener(event: "onUpdateProgress", listener: (value: { percent: number }) => void): { remove(): void };
};

const native = Platform.OS === "android" && !isRunningInExpoGo()
  ? requireOptionalNativeModule<AndroidUpdater>("ZyxAndroidUpdater") : null;

export function getAndroidUpdateDevice() {
  if (!native) return null;
  const installed = native.getInstalled();
  if (!installed || installed.packageName !== EXPO_ANDROID_PACKAGE || typeof installed.version !== "string"
    || !Number.isSafeInteger(installed.versionCode) || installed.versionCode <= 0) return null;
  return {
    installed,
    check: (signal: AbortSignal) => readExpoAndroidUpdate(fetch, installed.versionCode, signal),
    install: (release: ExpoAndroidRelease) => native.downloadAndInstall(release.url, release.version, release.versionCode, release.bytes, release.sha256),
    openInstallSettings: () => native.openInstallSettings(),
    cancel: () => native.cancel(),
    subscribe: (listener: (percent: number) => void) => native.addListener("onUpdateProgress", ({ percent }) => {
      if (Number.isInteger(percent) && percent >= 0 && percent <= 100) listener(percent);
    }),
  };
}

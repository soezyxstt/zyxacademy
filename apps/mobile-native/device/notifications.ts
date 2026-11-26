import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import { AppState, Platform } from "react-native";

import {
  createNativePushController,
  type NativePushDevice,
  type NativePushPermission,
  type NativePushStatus,
} from "./notifications-controller";

type Notifications = typeof import("expo-notifications");

const androidChannels = [
  { id: "zyx_discussions", idName: "Diskusi", enName: "Discussions" },
  { id: "zyx_schedule", idName: "Jadwal", enName: "Schedules" },
  { id: "zyx_learning", idName: "Pembelajaran", enName: "Learning" },
  { id: "zyx_updates", idName: "Pembaruan", enName: "Updates" },
] as const;

function mapPermission(
  notifications: Notifications,
  permission: Awaited<ReturnType<Notifications["getPermissionsAsync"]>>,
): NativePushPermission {
  const authorization = permission.ios?.status;
  const status = authorization === notifications.IosAuthorizationStatus.NOT_DETERMINED
    || permission.status === "undetermined"
    ? "prompt"
    : permission.granted || authorization === notifications.IosAuthorizationStatus.PROVISIONAL
      || authorization === notifications.IosAuthorizationStatus.EPHEMERAL
      ? "granted"
      : "denied";
  return { status, canAskAgain: permission.canAskAgain };
}

export function createExpoNotificationController({
  getLocale = () => "id",
  onStatusChange,
}: {
  getLocale?: () => "id" | "en";
  onStatusChange?: (status: NativePushStatus | null) => void;
}) {
  const platform = Platform.OS;
  const installed = platform === "android" && !isRunningInExpoGo()
    && requireOptionalNativeModule<{ isConfigured(): boolean }>("ZyxAndroidPushConfiguration")?.isConfigured() === true;
  const registration: NativePushDevice["registration"] = installed
    ? { platform: "android", transport: "fcm", device: "expo-android" }
    : null;
  const load = () => import("expo-notifications");
  let preparedLocale: "id" | "en" | undefined;

  async function prepareChannels(notifications: Notifications) {
    const locale = getLocale();
    if (platform !== "android" || preparedLocale === locale) return;
    await Promise.all(androidChannels.map(channel =>
      notifications.setNotificationChannelAsync(channel.id, {
        name: locale === "en" ? channel.enName : channel.idName,
        importance: channel.id === "zyx_schedule"
          ? notifications.AndroidImportance.HIGH
          : notifications.AndroidImportance.DEFAULT,
        sound: "default",
      }),
    ));
    preparedLocale = locale;
  }

  const controller = createNativePushController({
    registration,
    async getPermission() {
      const notifications = await load();
      return mapPermission(notifications, await notifications.getPermissionsAsync());
    },
    async requestPermission(canPrompt) {
      const notifications = await load();
      await prepareChannels(notifications);
      if (!canPrompt()) return null;
      return mapPermission(notifications, await notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }));
    },
    async getToken() {
      const notifications = await load();
      await prepareChannels(notifications);
      const token = await notifications.getDevicePushTokenAsync();
      return token.type === platform && typeof token.data === "string" ? token.data : null;
    },
    onToken(listener) {
      let stopped = false;
      let subscription: ReturnType<Notifications["addPushTokenListener"]> | undefined;
      void load().then(notifications => {
        if (stopped) return;
        subscription = notifications.addPushTokenListener(token => {
          if (token.type === platform && typeof token.data === "string") listener(token.data);
        });
      }).catch(() => {});
      return () => {
        stopped = true;
        subscription?.remove();
      };
    },
    async clearNotifications() {
      if (!registration) return;
      const notifications = await load();
      notifications.clearLastNotificationResponse();
      await notifications.dismissAllNotificationsAsync();
    },
  }, onStatusChange);
  const subscription = registration && AppState.addEventListener("change", state => {
    if (state === "active") void controller.sync();
  });

  return {
    ...controller,
    dispose() {
      subscription?.remove();
      controller.dispose();
    },
  };
}

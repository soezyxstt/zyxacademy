import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { NotificationTriggerInput } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { createDeviceReminderController, type ReminderPermission } from "./reminder-controller";
import type { ReminderLocale, ReminderPlan } from "./reminder-plans";

export type { ReminderOutcome, ReminderPermission, ReminderSession } from "./reminder-controller";
export { DEFAULT_STUDY_REMINDER_CONFIG, normalizeStudyReminderConfig } from "./reminder-plans";
export type { ReminderLocale, StudyReminderConfig } from "./reminder-plans";

type Notifications = typeof import("expo-notifications");
const load = () => import("expo-notifications");
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const studyChannel = "zyx_learning";
const tutorChannel = "zyx_schedule";
let channelLanguage: ReminderLocale | undefined;

async function prepareChannels(notifications: Notifications, locale: ReminderLocale) {
  if (Platform.OS !== "android" || channelLanguage === locale) return;
  await Promise.all([
    notifications.setNotificationChannelAsync(studyChannel, {
      name: locale === "en" ? "Learning" : "Pembelajaran",
      importance: notifications.AndroidImportance.DEFAULT,
      sound: "default",
    }),
    notifications.setNotificationChannelAsync(tutorChannel, {
      name: locale === "en" ? "Schedules" : "Jadwal",
      importance: notifications.AndroidImportance.HIGH,
      sound: "default",
    }),
  ]);
  channelLanguage = locale;
}

function mapPermission(notifications: Notifications, value: Awaited<ReturnType<Notifications["getPermissionsAsync"]>>): ReminderPermission {
  const ios = value.ios?.status;
  const status = ios === notifications.IosAuthorizationStatus.NOT_DETERMINED || value.status === "undetermined"
    ? "prompt"
    : value.granted || ios === notifications.IosAuthorizationStatus.PROVISIONAL
      || ios === notifications.IosAuthorizationStatus.EPHEMERAL ? "granted" : "denied";
  return { status, canAskAgain: value.canAskAgain };
}

function nativeTrigger(notifications: Notifications, plan: ReminderPlan): NotificationTriggerInput {
  const trigger = plan.trigger;
  const channelId = plan.kind === "study_reminder" ? studyChannel : tutorChannel;
  const types = notifications.SchedulableTriggerInputTypes;
  switch (trigger.type) {
    case "date": return { type: types.DATE, date: trigger.time, channelId };
    case "weekly": return { type: types.WEEKLY, weekday: trigger.weekday, hour: trigger.hour, minute: trigger.minute, channelId };
    case "daily": return { type: types.DAILY, hour: trigger.hour, minute: trigger.minute, channelId };
  }
}

export const expoReminders = createDeviceReminderController({
  digest: value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  storage: {
    read: key => SecureStore.getItemAsync(key, storeOptions),
    write: (key, value) => SecureStore.setItemAsync(key, value, storeOptions),
  },
  device: {
    supported: Platform.OS === "android" || Platform.OS === "ios",
    async getPermission() {
      const notifications = await load();
      return mapPermission(notifications, await notifications.getPermissionsAsync());
    },
    async requestPermission(locale) {
      const notifications = await load();
      await prepareChannels(notifications, locale);
      return mapPermission(notifications, await notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }));
    },
    async scheduled() {
      return (await (await load()).getAllScheduledNotificationsAsync()).map(item => ({
        identifier: item.identifier,
        signature: typeof item.content.data?.zyxReminderSignature === "string"
          ? item.content.data.zyxReminderSignature : null,
      }));
    },
    async delivered() {
      return (await (await load()).getPresentedNotificationsAsync()).map(item => item.request.identifier);
    },
    async schedule(identifier, plan, signature, locale) {
      const notifications = await load();
      await prepareChannels(notifications, locale);
      await notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: plan.title,
          body: plan.body,
          sound: "default",
          data: {
            kind: plan.kind,
            url: plan.url,
            ...(plan.bookingId ? { bookingId: plan.bookingId } : {}),
            zyxReminderSignature: signature,
          },
        },
        trigger: nativeTrigger(notifications, plan),
      });
    },
    async cancel(identifier) { await (await load()).cancelScheduledNotificationAsync(identifier); },
    async dismiss(identifier) { await (await load()).dismissNotificationAsync(identifier); },
  },
});

/**
 * lib/notifications/dispatch.ts
 *
 * Platform/transport-aware push dispatch orchestration.
 * Partitions registered device tokens by transport so:
 * - "fcm" and "webpush" go to Firebase Cloud Messaging
 * - "apns" goes to Apple Push Notification service (HTTP/2 JWT) and NEVER to FCM
 * - "desktop" relies on the authenticated inbox delivery bridge (no FCM/APNs attempt)
 */

import { expoIosApnsEnvironment, isExpoIosPushLabel, type ExpoIosApnsEnvironment } from "../../packages/notifications/expo-ios-push";
import type { NotificationPayload, PushTransport, SendResult } from "./types";

export interface PushTokenTarget {
  token: string;
  transport?: PushTransport | string | null;
  device?: string | null;
}

export interface TransportBatchResult {
  succeeded: number;
  failedTokens: string[];
  errors: string[];
}

export interface DispatchAdapters {
  sendFcm: (tokens: string[], payload: NotificationPayload, display?: "expo-android") => Promise<TransportBatchResult>;
  sendApns: (tokens: string[], payload: NotificationPayload, expoEnvironment?: ExpoIosApnsEnvironment) => Promise<TransportBatchResult>;
}

export function normalizeStoredTransport(raw: PushTransport | string | null | undefined): PushTransport {
  if (raw === "apns" || raw === "webpush" || raw === "desktop" || raw === "fcm") {
    return raw;
  }
  return "fcm";
}

export async function dispatchTokensByTransport(
  targets: PushTokenTarget[],
  payload: NotificationPayload,
  adapters: DispatchAdapters,
): Promise<SendResult> {
  const fcmTokens: string[] = [];
  const apnsTokens: string[] = [];
  const expoIos: Record<ExpoIosApnsEnvironment, string[]> = { development: [], production: [] };
  let unknownExpoIosCount = 0;
  const expoAndroidTokens: string[] = [];
  let desktopCount = 0;

  for (const target of targets) {
    const transport = normalizeStoredTransport(target.transport);
    const environment = expoIosApnsEnvironment(target.device);
    if (isExpoIosPushLabel(target.device)) {
      if (transport !== "apns" || !environment) unknownExpoIosCount += 1;
      else expoIos[environment].push(target.token);
    } else if (transport === "apns") {
      apnsTokens.push(target.token);
    } else if (transport === "fcm" && target.device === "expo-android") {
      expoAndroidTokens.push(target.token);
    } else if (transport === "desktop") {
      desktopCount += 1;
    } else {
      // "fcm" and "webpush" both dispatch via FCM
      fcmTokens.push(target.token);
    }
  }

  const remoteTasks: Promise<TransportBatchResult>[] = [];
  if (fcmTokens.length > 0) {
    remoteTasks.push(adapters.sendFcm(fcmTokens, payload));
  }
  if (expoAndroidTokens.length > 0) {
    remoteTasks.push(adapters.sendFcm(expoAndroidTokens, payload, "expo-android"));
  }
  if (apnsTokens.length > 0) {
    remoteTasks.push(adapters.sendApns(apnsTokens, payload));
  }

  if (expoIos.development.length > 0) remoteTasks.push(adapters.sendApns(expoIos.development, payload, "development"));
  if (expoIos.production.length > 0) remoteTasks.push(adapters.sendApns(expoIos.production, payload, "production"));
  const results = await Promise.all(remoteTasks);

  let succeeded = 0;
  const failedTokens: string[] = [];
  const errors: string[] = unknownExpoIosCount ? ["Unknown Expo iOS push profile."] : [];

  for (const res of results) {
    succeeded += res.succeeded;
    failedTokens.push(...res.failedTokens);
    errors.push(...res.errors);
  }

  // Desktop devices receive notifications through the persisted inbox + authenticated
  // desktop notification bridge; do not attempt FCM/APNs or mark them as failed.
  const attempted = fcmTokens.length + expoAndroidTokens.length + apnsTokens.length + expoIos.development.length + expoIos.production.length + unknownExpoIosCount + desktopCount;
  succeeded += desktopCount;

  return {
    attempted,
    succeeded,
    failedTokens,
    errors,
  };
}

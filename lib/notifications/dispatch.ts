/**
 * lib/notifications/dispatch.ts
 *
 * Platform/transport-aware push dispatch orchestration.
 * Partitions registered device tokens by transport so:
 * - "fcm" and "webpush" go to Firebase Cloud Messaging
 * - "apns" goes to Apple Push Notification service (HTTP/2 JWT) and NEVER to FCM
 * - "desktop" relies on the authenticated inbox delivery bridge (no FCM/APNs attempt)
 */

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
  sendApns: (tokens: string[], payload: NotificationPayload) => Promise<TransportBatchResult>;
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
  const expoAndroidTokens: string[] = [];
  let desktopCount = 0;

  for (const target of targets) {
    const transport = normalizeStoredTransport(target.transport);
    if (transport === "apns") {
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

  const results = await Promise.all(remoteTasks);

  let succeeded = 0;
  const failedTokens: string[] = [];
  const errors: string[] = [];

  for (const res of results) {
    succeeded += res.succeeded;
    failedTokens.push(...res.failedTokens);
    errors.push(...res.errors);
  }

  // Desktop devices receive notifications through the persisted inbox + authenticated
  // desktop notification bridge; do not attempt FCM/APNs or mark them as failed.
  const attempted = fcmTokens.length + expoAndroidTokens.length + apnsTokens.length + desktopCount;
  succeeded += desktopCount;

  return {
    attempted,
    succeeded,
    failedTokens,
    errors,
  };
}

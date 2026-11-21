/**
 * lib/notifications/transport.ts
 *
 * Shared, runtime-safe helpers for push platform/transport classification,
 * token validation, and honest delivery readiness evaluation.
 */

import type {
  PushDeliveryReadiness,
  PushOsPermissionStatus,
  PushPlatform,
  PushTransport,
} from "./types";

export const PUSH_PLATFORMS: readonly PushPlatform[] = ["web", "android", "ios", "desktop"];
export const PUSH_TRANSPORTS: readonly PushTransport[] = ["fcm", "apns", "webpush", "desktop"];

const APNS_HEX_TOKEN_RE = /^[a-fA-F0-9]{64,512}$/;
const DESKTOP_TOKEN_RE = /^desktop:[a-zA-Z0-9._-]{12,256}$/;

export function normalizeOsPermissionStatus(
  raw: "granted" | "denied" | "default" | "prompt" | "unsupported",
): PushOsPermissionStatus {
  if (raw === "default" || raw === "prompt") return "prompt";
  if (raw === "granted" || raw === "denied") return raw;
  return "unsupported";
}

export function inferPlatformAndTransport(input: {
  device?: string;
  platform?: PushPlatform;
  transport?: PushTransport;
}): { platform: PushPlatform; transport: PushTransport } {
  const device = (input.device ?? "").toLowerCase();

  const platform: PushPlatform =
    input.platform ??
    (device.includes("capacitor-ios")
      ? "ios"
      : device.includes("capacitor-android")
        ? "android"
        : device.startsWith("tauri-")
          ? "desktop"
          : "web");

  let transport: PushTransport;
  if (input.transport) {
    transport = input.transport;
  } else if (platform === "ios") {
    transport = "apns";
  } else if (platform === "desktop") {
    transport = "desktop";
  } else if (platform === "android") {
    transport = "fcm";
  } else {
    transport = "webpush";
  }

  // Never allow iOS APNs device tokens to be classified as FCM accidentally,
  // nor desktop tokens as FCM/APNs.
  if (platform === "desktop" && transport !== "desktop") {
    transport = "desktop";
  }

  return { platform, transport };
}

export function isValidPushTokenForTransport(token: string, transport: PushTransport): boolean {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  if (transport === "apns") {
    return APNS_HEX_TOKEN_RE.test(trimmed);
  }
  if (transport === "desktop") {
    return DESKTOP_TOKEN_RE.test(trimmed);
  }
  // FCM and WebPush registration tokens
  return trimmed.length >= 64;
}

export function evaluateDeliveryReadiness(input: {
  osPermission: PushOsPermissionStatus;
  registered: boolean;
  transportActive: boolean;
}): PushDeliveryReadiness {
  if (input.osPermission === "unsupported") return "unsupported";
  if (input.osPermission === "denied") return "permission_denied";
  if (input.osPermission === "prompt") return "permission_required";
  if (!input.registered) return "unregistered";
  if (!input.transportActive) return "transport_inactive";
  return "ready";
}

let _lastRegisteredIdentity: { userId: string; token: string } | null = null;

export function shouldRegisterPushToken(
  current: { userId: string; token: string },
  previous: { userId: string; token: string } | null = _lastRegisteredIdentity,
): boolean {
  if (typeof window === "undefined" || !current.userId || !current.token) return false;
  if (!previous) return true;
  return previous.userId !== current.userId || previous.token !== current.token;
}

export function markPushTokenRegistered(userId: string, token: string): void {
  if (typeof window !== "undefined") _lastRegisteredIdentity = { userId, token };
}

export function clearRegisteredPushTokenIdentity(): void {
  _lastRegisteredIdentity = null;
}

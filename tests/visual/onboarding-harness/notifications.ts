import type { UnifiedNotificationDeliveryStatus, UnifiedNotificationPermission } from "@/lib/native/notifications";
import type { PushPlatform } from "@/lib/notifications/types";
import { setAccountTransitionPending } from "@/lib/auth/account-transition-state";

type FixturePermission = "prompt" | "granted" | "denied" | "unsupported";
const query = new URLSearchParams(window.location.search);
const initialPermission = query.get("permission") ?? "prompt";
let permission: FixturePermission = ["granted", "denied", "unsupported"].includes(initialPermission) ? initialPermission as FixturePermission : "prompt";
let registered = permission === "granted";
let release: (() => void) | null = null;
const platform: PushPlatform = ["ios", "android", "desktop"].includes(query.get("platform") ?? "") ? query.get("platform") as PushPlatform : "web";
const transport = platform === "ios" ? "apns" : platform === "android" ? "fcm" : platform === "desktop" ? "desktop" : "webpush";

declare global {
  interface Window {
    __tourNotifications: {
      permissionRequests: { platform: PushPlatform; userGesture: boolean }[];
      registrations: string[];
      nextPermission: UnifiedNotificationPermission;
      failRegistration: boolean;
      holdPermission: boolean;
      releasePermission: () => void;
      setPermission: (value: FixturePermission) => void;
      switchAccount: () => void;
    };
  }
}

window.__tourNotifications = {
  permissionRequests: [],
  registrations: [],
  nextPermission: "granted",
  failRegistration: false,
  holdPermission: false,
  releasePermission: () => { const done = release; release = null; done?.(); },
  setPermission: value => { permission = value; },
  switchAccount: () => setAccountTransitionPending(true),
};

export function getClientPushRegistrationMeta() {
  return { platform, transport, device: "Tour test device" };
}

export function isNotificationBridgeSupported() { return permission !== "unsupported"; }

export async function getUnifiedNotificationPermission(): Promise<UnifiedNotificationPermission> {
  return permission === "prompt" ? "default" : permission;
}

export async function getUnifiedNotificationDeliveryStatus(): Promise<UnifiedNotificationDeliveryStatus> {
  return {
    platform, transport, registered, transportActive: true, osPermission: permission,
    deliveryReadiness: permission === "unsupported" ? "unsupported" : permission === "denied" ? "permission_denied" : permission === "prompt" ? "permission_required" : registered ? "ready" : "unregistered",
  };
}

export async function requestUnifiedNotificationPermission(): Promise<UnifiedNotificationPermission> {
  window.__tourNotifications.permissionRequests.push({ platform, userGesture: navigator.userActivation.isActive });
  if (window.__tourNotifications.holdPermission) await new Promise<void>(resolve => { release = resolve; });
  const next = window.__tourNotifications.nextPermission;
  permission = next === "default" ? "prompt" : next;
  return next;
}

export async function registerUnifiedPushToken(userId: string, isCurrent: () => boolean) {
  if (!isCurrent()) return false;
  window.__tourNotifications.registrations.push(userId);
  registered = !window.__tourNotifications.failRegistration;
  return registered;
}

export async function sendDesktopNativeNotification() { return true; }

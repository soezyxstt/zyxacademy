import type { NotificationPayload } from "./types";

/** An OS notification may arrive after logout. Resolve the private row only on authenticated tap. */
export function expoPushTarget(payload: NotificationPayload): Record<string, string> {
  if (payload.notificationId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(payload.notificationId)) {
    return { notificationId: payload.notificationId };
  }
  if (payload.metadata?.quietDigest === "true" && payload.metadata.groupKey === "quiet-digest") {
    return { quietDigest: "true", groupKey: "quiet-digest" };
  }
  return {};
}

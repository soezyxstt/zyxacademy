import { LOCAL_REMINDER_PREFIX } from "./notification-response-identity";

export type ReminderDestination = "/dashboard" | "/dashboard/schedule";
export type ReminderNotification = {
  identifier: string;
  deliveredAt: number;
  trigger: string | undefined;
  data: unknown;
};
export type ReminderResponse = ReminderNotification & { actionIdentifier: string };
export type ReminderRecipient =
  | { status: "checking" | "unavailable" }
  | { status: "verified"; prefix: string; isCurrent(): boolean };

type SitemapEntry = {
  href: unknown;
  contextKey: string;
  isGenerated: boolean;
  isInternal: boolean;
  children: readonly SitemapEntry[];
};

type RouteAccess = {
  pathname: string;
  ready: boolean;
  isRegistered(path: ReminderDestination): boolean;
  navigate(path: ReminderDestination): void;
};

const maxTapAge = 24 * 60 * 60 * 1000;
const maxReadinessWait = 60_000;
const replayHistorySize = 128;
const reminderIdentifier = /^([a-f0-9]{64})\.(study_reminder|tutor_reminder)\.(.+)$/;
const studySchedule = /^(?:daily|weekly\.[1-7])$/;
const bookingId = /^[\w-]{1,256}$/;

export function normalizeNotificationDate(value: number, platform: "android" | "ios"): number {
  // Expo's UNNotification record uses seconds. Android's serializer uses millis.
  return Math.round(platform === "ios" ? value * 1000 : value);
}

function isLocalReminder(notification: ReminderNotification): boolean {
  return notification.trigger !== "push" && notification.identifier.startsWith(LOCAL_REMINDER_PREFIX);
}

function destination(notification: ReminderNotification): ReminderDestination | null {
  if (!isLocalReminder(notification)) return null;
  const suffix = reminderIdentifier.exec(notification.identifier.slice(LOCAL_REMINDER_PREFIX.length));
  if (!suffix || !notification.data || typeof notification.data !== "object") return null;
  const { kind, url, bookingId: selectedBooking } = notification.data as Record<string, unknown>;
  if (kind !== suffix[2]) return null;
  const key = suffix[3];
  if (kind === "study_reminder" && url === "/dashboard" && studySchedule.test(key)
    && (notification.trigger === "calendar" || notification.trigger === (key === "daily" ? "daily" : "weekly"))) return url;
  if (kind === "tutor_reminder" && url === "/dashboard/schedule" && selectedBooking === key && bookingId.test(key)
    && (notification.trigger === "calendar" || notification.trigger === "timeInterval" || notification.trigger === "date")) return url;
  return null;
}

export function matchesReminderResponse(left: ReminderResponse, right: ReminderResponse): boolean {
  return left.identifier === right.identifier && Object.is(left.deliveredAt, right.deliveredAt)
    && left.actionIdentifier === right.actionIdentifier && left.trigger === right.trigger;
}

export function sitemapHasReminderRoute(root: SitemapEntry | null, path: ReminderDestination): boolean {
  if (!root) return false;
  const href = typeof root.href === "string" && root.href.startsWith("/") && !root.href.startsWith("//")
    ? "/" + root.href.split("/").filter(segment => segment && !/^\([\w-]+\)$/.test(segment)).join("/")
    : null;
  // A layout or generated route can share a pathname with a screen.
  const screen = !root.isGenerated && !root.isInternal && !/(?:^|\/)_layout\.[jt]sx?$/.test(root.contextKey);
  return (screen && href === path) || root.children.some(child => sitemapHasReminderRoute(child, path));
}

export function observeReminderResponses(source: {
  subscribe(listener: (response: ReminderResponse) => void): () => void;
  readLast(): ReminderResponse | null;
  clearLast(): void;
}, consume: (response: ReminderResponse) => boolean): () => void {
  function readLast() {
    try { return source.readLast(); } catch { return null; }
  }
  const receive = (response: ReminderResponse) => {
    if (!consume(response)) return;
    const last = readLast();
    if (last && matchesReminderResponse(response, last)) {
      try { source.clearLast(); } catch { /* The in-memory history still deduplicates the response. */ }
    }
  };
  const unsubscribe = source.subscribe(receive);
  const initial = readLast();
  if (initial) receive(initial);
  return unsubscribe;
}

export function reminderPresentation(
  notification: ReminderNotification,
  recipient: ReminderRecipient,
): "default" | "reminder" | "hidden" {
  if (!isLocalReminder(notification)) return "default";
  return recipient.status === "verified" && recipient.isCurrent()
    && notification.identifier.startsWith(recipient.prefix) && destination(notification) ? "reminder" : "hidden";
}

export function createReminderResponseController({ defaultAction, now = Date.now }: {
  defaultAction: string;
  now?: () => number;
}) {
  let recipient: ReminderRecipient = { status: "checking" };
  let routes: RouteAccess | undefined;
  let pending: { response: ReminderResponse; path: ReminderDestination; receivedAt: number } | undefined;
  const seen = new Set<string>();

  function deliver() {
    if (!pending) return;
    const { response, path, receivedAt } = pending;
    if (now() - receivedAt > maxReadinessWait || recipient.status === "unavailable"
      || (recipient.status === "verified" && (!recipient.isCurrent() || !response.identifier.startsWith(recipient.prefix)))) {
      pending = undefined;
      return;
    }
    if (recipient.status !== "verified" || !routes?.ready) return;
    pending = undefined;
    if (routes.pathname !== path && routes.isRegistered(path)) routes.navigate(path);
  }

  return {
    consume(response: ReminderResponse): boolean {
      if (!isLocalReminder(response)) return false;
      const path = destination(response);
      const receivedAt = now();
      if (!path || response.actionIdentifier !== defaultAction || !Number.isFinite(response.deliveredAt)
        || response.deliveredAt > receivedAt + maxReadinessWait || receivedAt - response.deliveredAt > maxTapAge) return true;
      const key = JSON.stringify([response.identifier, response.deliveredAt, response.actionIdentifier]);
      if (seen.has(key)) return true;
      seen.add(key);
      if (seen.size > replayHistorySize) seen.delete(seen.values().next().value!);
      if (recipient.status === "verified" && (!recipient.isCurrent() || !response.identifier.startsWith(recipient.prefix))) {
        return true;
      }
      pending = { response, path, receivedAt };
      deliver();
      return true;
    },
    updateHost(nextRecipient: ReminderRecipient, nextRoutes: RouteAccess) {
      recipient = nextRecipient;
      routes = nextRoutes;
      deliver();
    },
  };
}

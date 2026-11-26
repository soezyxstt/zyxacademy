import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { Notification, NotificationResponse } from "expo-notifications";
import { usePathname, useRootNavigationState, useRouter, useSitemap, type Href } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { resolveNativeLoginReturn } from "../auth/login-intent";
import { createPushResponseController, remotePushData, type PushHost } from "./remote-response";
import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import type { NativeSessionTransport } from "../network/transport";
import { isStudyReminderAccount } from "./reminder-eligibility";
import {
  createReminderResponseController,
  normalizeNotificationDate,
  observeReminderResponses,
  reminderPresentation,
  sitemapHasReminderRoute,
  type ReminderDestination,
  type ReminderNotification,
  type ReminderRecipient,
  type ReminderResponse,
} from "./notification-response-controller";
import { localReminderSessionPrefix } from "./notification-response-identity";

const sdkDefault = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
const reminderBanner = { ...sdkDefault, shouldSetBadge: false };
const hidden = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
const checking: ReminderRecipient = { status: "checking" };
const unavailable: ReminderRecipient = { status: "unavailable" };

function readNotification(notification: Notification, platform: "android" | "ios"): ReminderNotification {
  const { request, date } = notification;
  const { trigger } = request;
  return {
    identifier: typeof request.identifier === "string" ? request.identifier : "",
    deliveredAt: normalizeNotificationDate(date, platform),
    trigger: trigger && typeof trigger === "object" && "type" in trigger ? trigger.type : undefined,
    data: trigger && "type" in trigger && trigger.type === "push" ? remotePushData(request.content.data, trigger) : request.content.data,
  };
}

export function LocalReminderResponseLifecycle() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();
  const sitemap = useSitemap();
  const router = useRouter();
  const { state, transport, revalidating } = useNativeSession();
  const { context, failed } = useNativeAccountContext();
  const [identity, setIdentity] = useState<{ session: NativeSessionTransport; prefix: string | null } | null>(null);
  const push = useRef<ReturnType<typeof createPushResponseController> | null>(null);
  const controller = useRef<ReturnType<typeof createReminderResponseController> | null>(null);

  useEffect(() => {
    if (!transport || (Platform.OS !== "ios" && Platform.OS !== "android")) return;
    let active = true;
    const finish = (prefix: string | null) => {
      if (active && transport.isCurrent()) setIdentity({ session: transport, prefix });
    };
    void localReminderSessionPrefix(transport.scope, value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value))
      .then(finish, () => finish(null));
    return () => { active = false; };
  }, [transport]);

  const recipient = useMemo<ReminderRecipient>(() => {
    if (state.status === "loading" || revalidating || (transport && !context && !failed)) return checking;
    if (!transport || state.status !== "signed-in" || !isStudyReminderAccount(context)) return unavailable;
    if (identity?.session !== transport) return checking;
    if (!identity.prefix) return unavailable;
    return {
      status: "verified",
      prefix: identity.prefix,
      isCurrent: () => transport.isCurrent() && state.expiresAt > Date.now(),
    };
  }, [context, failed, identity, revalidating, state, transport]);

  const routes = useMemo(() => ({
    pathname,
    ready: navigationReady && sitemap !== null,
    isRegistered: (path: ReminderDestination) => sitemapHasReminderRoute(sitemap, path),
    navigate: (path: ReminderDestination) => {
      try { router.push(path); } catch { /* The route may have unmounted before the action was handled. */ }
    },
  }), [navigationReady, pathname, router, sitemap]);

  const remoteHost = useMemo<PushHost | "checking" | null>(() => {
    if (state.status === "loading" || revalidating || (transport && !context && !failed)) return "checking";
    if (!transport?.isCurrent() || state.status !== "signed-in" || !context ||
      context.accountId !== state.accountId || context.sessionId !== state.sessionId) return null;
    if (!navigationReady || !sitemap || pathname === "/" || pathname === "/auth/native-finish") return "checking";
    return {
      session: transport,
      resolve(path) {
        const target = resolveNativeLoginReturn(path, context, sitemap);
        return target.status === "ready" ? target.href : target.dashboard;
      },
      navigate: path => router.navigate(path as Href),
    };
  }, [context, failed, navigationReady, pathname, revalidating, router, sitemap, state, transport]);

  const latest = useRef({ recipient, routes, remoteHost });
  useLayoutEffect(() => {
    latest.current = { recipient, routes, remoteHost };
    controller.current?.updateHost(recipient, routes);
    push.current?.update(remoteHost);
  }, [recipient, routes, remoteHost]);

  useEffect(() => {
    const platform = Platform.OS;
    if (platform !== "android" && platform !== "ios") return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("expo-notifications").then(notifications => {
      if (!active) return;
      const bridge = createReminderResponseController({ defaultAction: notifications.DEFAULT_ACTION_IDENTIFIER });
      controller.current = bridge;
      const remote = createPushResponseController(notifications.DEFAULT_ACTION_IDENTIFIER);
      push.current = remote;
      remote.update(latest.current.remoteHost);
      bridge.updateHost(latest.current.recipient, latest.current.routes);
      const compact = (response: NotificationResponse): ReminderResponse => ({
        ...readNotification(response.notification, platform),
        actionIdentifier: response.actionIdentifier,
      });
      const stop = observeReminderResponses({
        readLast() {
          const last = notifications.getLastNotificationResponse();
          return last ? compact(last) : null;
        },
        clearLast: notifications.clearLastNotificationResponse,
        subscribe(listener) {
          const subscription = notifications.addNotificationResponseReceivedListener(response => listener(compact(response)));
          return () => subscription.remove();
        },
      }, response => bridge.consume(response) || remote.consume(response));
      notifications.setNotificationHandler({
        handleNotification: async notification => {
          const presentation = reminderPresentation(readNotification(notification, platform), latest.current.recipient);
          if (presentation === "hidden") return hidden;
          return presentation === "reminder" ? reminderBanner : sdkDefault;
        },
      });
      unsubscribe = () => {
        stop();
        remote.close();
        if (push.current === remote) push.current = null;
        notifications.setNotificationHandler({ handleNotification: async () => sdkDefault });
        if (controller.current === bridge) controller.current = null;
      };
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return null;
}

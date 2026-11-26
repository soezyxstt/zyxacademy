"use client";

/** Register granted device tokens and offer a non-blocking, account-scoped permission reminder. */
import { useOnboardingTour } from "@/components/onboarding/tour-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NotificationPermissionDialog } from "./notification-permission-dialog";
import { shouldOfferNotificationPermission, rememberNotificationPermissionChoice } from "@/lib/notifications/permission-reminder";
import { useSession } from "@/lib/auth-client";
import { useAppLocale } from "@/lib/i18n/client";
import { isAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { acquirePullToRefreshLock } from "@/lib/pull-to-refresh-lock";

const CONSENT_KEY = "fcm_consent";

import {
  getUnifiedNotificationPermission,
  isNotificationBridgeSupported,
  registerUnifiedPushToken,
  requestUnifiedNotificationPermission,
} from "@/lib/native/notifications";

function isPushEnvironmentSupported(): boolean {
  return isNotificationBridgeSupported();
}

export function PushPermissionInit() {
  const tour = useOnboardingTour();
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useAppLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const { data: session, isPending } = useSession();
  const [prompt, setPrompt] = useState<{ userId: string; blocked: boolean } | null>(null);

  const userId = session?.user?.id ?? null;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAdminSurface = pathname.startsWith("/admin") || userRole === "admin";
  const activeIdentityRef = useRef({ userId: null as string | null });
  const eligibleUserId = !isPending ? userId : null;
  if (activeIdentityRef.current.userId !== eligibleUserId) {
    activeIdentityRef.current = { userId: eligibleUserId };
  }
  const inFlightUserRef = useRef<{ userId: string | null } | null>(null);

  const syncGrantedTokenForUser = useCallback(
    async (activeUserId: string, requestPermission: boolean) => {
      const identity = activeIdentityRef.current;
      const isCurrent = () => !isAccountTransitionPending()
        && activeIdentityRef.current === identity && identity.userId === activeUserId;
      if (!activeUserId || !isCurrent()) return;
      if (!requestPermission && inFlightUserRef.current === identity) return;

      inFlightUserRef.current = identity;
      const releaseSyncLock = acquirePullToRefreshLock("notification-sync");
      try {
        if (!isCurrent()) return;
        let permission = await getUnifiedNotificationPermission();
        if (!isCurrent()) return;

        if (requestPermission) {
          permission = await requestUnifiedNotificationPermission();
          if (!isCurrent()) return;
          if (permission === "denied") {
            localStorage.setItem(CONSENT_KEY, "denied");
            return;
          }
          if (permission === "granted") {
            localStorage.setItem(CONSENT_KEY, "granted");
          }
        }

        if (permission !== "granted") return;

        await registerUnifiedPushToken(activeUserId, isCurrent);

        if (!isCurrent() || isAdminSurface) return;
        const {
          isLocalReminderSchedulingSupported,
          loadStudyReminderConfig,
          refreshUpcomingTutorSessionReminders,
          syncStudyReminderNotifications,
        } = await import("@/lib/native/local-reminders");
        if (isLocalReminderSchedulingSupported() && isCurrent()) {
          const config = loadStudyReminderConfig(activeUserId);
          const currentLocale = localeRef.current;
          await syncStudyReminderNotifications(activeUserId, config, { locale: currentLocale }).catch(() => {});
          if (isCurrent()) {
            await refreshUpcomingTutorSessionReminders(activeUserId, { locale: currentLocale }).catch(() => {});
          }
        }
      } catch (err) {
        // Non-fatal; push notifications are enhancement, not core functionality
        console.warn("[FCM] Init error:", err);
      } finally {
        releaseSyncLock();
        if (inFlightUserRef.current === identity) {
          inFlightUserRef.current = null;
        }
      }
    },
    [isAdminSurface]
  );

  // 1. Granted token registration effect: runs for all authenticated roles (student, tutor, admin).
  useEffect(() => {
    if (isPending) return;

    if (!userId) {
      inFlightUserRef.current = null;
      void import("@/lib/firebase/messaging")
        .then(({ clearRegisteredPushTokenIdentity }) => {
          clearRegisteredPushTokenIdentity();
        })
        .catch(() => {});
      void import("@/lib/native/local-reminders")
        .then(({ clearAllLocalRemindersOnLogout }) => clearAllLocalRemindersOnLogout())
        .catch(() => {});
      return;
    }

    if (!isPushEnvironmentSupported()) {
      return;
    }

    let cancelled = false;
    void getUnifiedNotificationPermission().then((permission) => {
      if (cancelled) return;
      if (permission === "granted") {
        localStorage.setItem(CONSENT_KEY, "granted");
        void syncGrantedTokenForUser(userId, false);
      }
    });
    let lastRefresh = 0;
    const refreshRegistration = () => {
      if (cancelled || document.visibilityState !== "visible" || Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      void syncGrantedTokenForUser(userId, false);
    };
    const quietChanged = () => { if (!cancelled) void syncGrantedTokenForUser(userId, false); };
    window.addEventListener("focus", refreshRegistration);
    window.addEventListener("online", refreshRegistration);
    document.addEventListener("visibilitychange", refreshRegistration);
    window.addEventListener("zyx:quiet-hours-changed", quietChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshRegistration);
      window.removeEventListener("online", refreshRegistration);
      document.removeEventListener("visibilitychange", refreshRegistration);
      window.removeEventListener("zyx:quiet-hours-changed", quietChanged);
    };
  }, [isPending, userId, syncGrantedTokenForUser]);

  // Check on navigation and when returning to the app. Denied browsers need settings guidance, not another OS prompt.
  useEffect(() => {
    if (isPending || !userId || isAdminSurface || tour.blocking || !isPushEnvironmentSupported()) {
      setPrompt(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    const check = async () => {
      const attempt = ++generation;
      if (timer) clearTimeout(timer);
      try {
        const permission = await getUnifiedNotificationPermission();
        if (cancelled || attempt !== generation || isAccountTransitionPending()) return;
        if (permission === "granted") {
          setPrompt(current => current?.userId === userId ? null : current);
          return;
        }
        if (permission !== "default" && permission !== "denied") return;
        if (!shouldOfferNotificationPermission(localStorage, userId, Date.now())) return;
        const isExplicitPage = pathname.includes("/settings") || pathname.includes("/notifications");
        timer = setTimeout(() => {
          if (cancelled || attempt !== generation || isAccountTransitionPending()) return;
          if (!shouldOfferNotificationPermission(localStorage, userId, Date.now())) return;
          rememberNotificationPermissionChoice(localStorage, userId, "later", Date.now());
          setPrompt({ userId, blocked: permission === "denied" });
        }, isExplicitPage ? 2000 : 15000);
      } catch { /* Unavailable permission/storage must not block the application. */ }
    };
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(onFocus, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isPending, userId, isAdminSurface, pathname, tour.blocking]);

  const dismiss = (choice: "later" | "never") => {
    if (prompt?.userId === userId && userId) rememberNotificationPermissionChoice(localStorage, userId, choice, Date.now());
    setPrompt(null);
  };

  if (tour.blocking || !prompt || prompt.userId !== userId || isPending || !userId || isAdminSurface) return null;
  return (
    <NotificationPermissionDialog
      blocked={prompt.blocked}
      onLater={() => dismiss("later")}
      onNever={() => dismiss("never")}
      onEnable={() => {
        const blocked = prompt.blocked;
        dismiss("later");
        if (blocked) {
          router.push("/settings?tab=notifications");
          return;
        }
        void syncGrantedTokenForUser(userId, true);
      }}
    />
  );
}

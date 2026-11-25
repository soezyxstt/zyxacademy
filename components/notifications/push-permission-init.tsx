"use client";

/**
 * components/notifications/push-permission-init.tsx
 *
 * Client component that initialises FCM push notification permission
 * and token registration for authenticated users.
 *
 * Renders a custom Dialog to ask for consent before triggering the native prompt.
 *
 * Consent persistence strategy:
 * - localStorage "fcm_consent":
 *   - "granted"  -> FCM token is registered; never prompt again.
 *   - "denied"   -> the browser blocked notifications; never prompt again
 *                   (browsers do not allow re-prompting after a deny).
 *   - "later"    -> the user deferred; re-prompt after a cooldown (7 days).
 * - "fcm_later_at" stores the timestamp of the last deferral.
 *
 * Placed in the root layout so it runs on every page for authenticated users.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellIcon } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useAppLocale } from "@/lib/i18n/client";
import { isAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { acquirePullToRefreshLock } from "@/lib/pull-to-refresh-lock";

const CONSENT_KEY = "fcm_consent";
const LATER_AT_KEY = "fcm_later_at";
const LATER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const { data: session, isPending } = useSession();
  const [showPrompt, setShowPrompt] = useState(false);

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

  // 2. Permission prompt scheduling effect: route-aware delay for "default" permission only.
  useEffect(() => {
    if (isPending || !userId) {
      setShowPrompt(false);
      return;
    }

    if (!isPushEnvironmentSupported()) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void getUnifiedNotificationPermission().then((currentPermission) => {
      if (cancelled) return;

      if (currentPermission === "denied") {
        localStorage.setItem(CONSENT_KEY, "denied");
        setShowPrompt(false);
        return;
      }

      if (currentPermission === "granted") {
        localStorage.setItem(CONSENT_KEY, "granted");
        setShowPrompt(false);
        return;
      }

      if (currentPermission !== "default") {
        setShowPrompt(false);
        return;
      }

      // Permission is "default": only prompt if not in the "later" cooldown.
      const storedConsent = localStorage.getItem(CONSENT_KEY);
      if (storedConsent === "denied") return;

      if (storedConsent === "later") {
        const lastLater = Number(localStorage.getItem(LATER_AT_KEY) ?? 0);
        if (Date.now() - lastLater < LATER_COOLDOWN_MS) return;
      }

      // Delay to avoid interrupting immediate initial task on dashboard (P2-3)
      const isExplicitPage = pathname.includes("/settings") || pathname.includes("/notifications");
      const delayMs = isExplicitPage ? 2000 : 15000;
      timer = setTimeout(() => {
        setShowPrompt(true);
      }, delayMs);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPending, userId, isAdminSurface, pathname]);

  const handleAccept = async () => {
    setShowPrompt(false);
    if (!userId || isAdminSurface) return;
    await syncGrantedTokenForUser(userId, true);
  };

  const handleLater = () => {
    setShowPrompt(false);
    localStorage.setItem(CONSENT_KEY, "later");
    localStorage.setItem(LATER_AT_KEY, String(Date.now()));
  };

  if (!showPrompt || isPending || !userId || isAdminSurface) return null;

  return (
    <Dialog
      open={showPrompt}
      onOpenChange={(open) => {
        if (!open) {
          handleLater();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="gap-3 sm:pr-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <BellIcon className="size-6 text-primary" />
          </div>
          <DialogTitle>Aktifkan Notifikasi</DialogTitle>
          <DialogDescription className="space-y-2 text-body-xs">
            <p>Dapatkan info terbaru seputar belajarmu dengan mengaktifkan notifikasi push. Kami akan memberitahumu tentang:</p>
            <ul className="list-disc pl-5 space-y-1 text-body-sm text-foreground">
              <li>Kuis baru yang siap dikerjakan</li>
              <li>Pengumuman dan jadwal sesi live</li>
              <li>Pembaruan materi di kelasmu</li>
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 sm:justify-end">
          <Button variant="ghost" onClick={handleLater}>
            Nanti Saja
          </Button>
          <Button onClick={handleAccept}>
            Izinkan Notifikasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

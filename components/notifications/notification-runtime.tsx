"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { StudentAccountBoundary, type StudentAccountState } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { toast } from "@/components/ui/toast";
import { getDefaultHomeLinkForRole } from "@/lib/notifications/catalog";
import { isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";

export const ZYX_NOTIFICATIONS_CHANGED = "zyx:notifications-changed";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The application shell owns one subscription, independent of sidebar, bell,
// viewport and popover state. The fictional public demo never subscribes.
export function NotificationRuntime() {
  const experience = useStudentExperience();
  if (experience.mode === "demo") return null;
  return <StudentAccountBoundary>{account => <NotificationRuntimeForAccount account={account} />}</StudentAccountBoundary>;
}

export function NotificationRuntimeForAccount({ account }: { account: StudentAccountState }) {
  const router = useRouter();
  const transitioning = useSyncExternalStore(subscribeAccountTransition, isAccountTransitionPending, () => false);
  const userId = account.isPending ? null : account.data?.user.id ?? null;
  const fallbackUrl = getDefaultHomeLinkForRole(account.data?.user.role ?? undefined);
  const latest = useRef({ userId, fallbackUrl, router });
  latest.current = { userId, fallbackUrl, router };

  useEffect(() => {
    if (!userId || transitioning) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const isCurrent = () => !disposed && !isAccountTransitionPending() && latest.current.userId === userId;
    const refresh = () => window.dispatchEvent(new CustomEvent(ZYX_NOTIFICATIONS_CHANGED));

    void (async () => {
      const { subscribeNativeNotifications } = await import("@/lib/native/notifications");
      if (!isCurrent()) return;
      const stop = await subscribeNativeNotifications({
        defaultUrl: latest.current.fallbackUrl,
        userId,
        isCurrent,
        onForeground: ({ title, body }) => {
          if (!isCurrent()) return;
          if (title) toast(title, { description: body ?? undefined });
          refresh();
        },
        onNavigate: (url, notificationId) => {
          if (!isCurrent()) return;
          if (notificationId && UUID_PATTERN.test(notificationId)) {
            void fetch("/api/notifications/read", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ ids: [notificationId] }),
            }).then(res => { if (res.ok && isCurrent()) refresh(); }).catch(() => {});
          }
          const safeUrl = url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")
            ? url
            : latest.current.fallbackUrl;
          latest.current.router.push(safeUrl);
        },
      });
      if (!isCurrent()) stop();
      else unsubscribe = stop;
    })().catch(() => {
      if (isCurrent()) console.warn("[notifications] Could not start notification listener");
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [userId, transitioning]);

  return null;
}

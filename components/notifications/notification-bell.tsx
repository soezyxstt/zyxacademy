"use client";

/**
 * components/notifications/notification-bell.tsx
 *
 * User-facing notification inbox. Renders a bell button with an unread badge
 * and a popover listing the current user's notifications from
 * GET /api/notifications/history.
 *
 * - Clicking a notification marks it read and navigates to its deep link.
 * - "Tandai semua dibaca" clears the unread badge.
 * - The notification runtime publishes inbox refresh events.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DISCUSSION_COUNTS_CHANGED } from "@/components/discussions/discussion-count-badge";
import { ZYX_LIFECYCLE_REFRESH_EVENT } from "@/lib/native/lifecycle-refresh";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { StudentAccountBoundary, type StudentAccountState } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationRuntimeForAccount, ZYX_NOTIFICATIONS_CHANGED } from "./notification-runtime";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";
import { getDefaultHomeLinkForRole } from "@/lib/notifications/catalog";

import { NotificationInboxPanel, notificationInboxPanelSurface, type NotificationInboxRow } from "./notification-inbox-panel";

export { ZYX_NOTIFICATIONS_CHANGED } from "./notification-runtime";

interface HistoryResponse {
  notifications: NotificationInboxRow[];
  unreadCount: number;
  page: number;
  limit: number;
}

function resolveLink(row: NotificationInboxRow, fallbackUrl: string): string {
  const url = row.metadata?.url;
  return typeof url === "string" && url ? url : fallbackUrl;
}

interface NotificationBellProps {
  /** "navbar" styles for the marketing header, "sidebar" for the app shell header. */
  variant?: "navbar" | "sidebar";
}

export function NotificationBell(props: NotificationBellProps) {
  const experience = useStudentExperience();
  return <StudentAccountBoundary>{state => <>
    {props.variant === "navbar" && experience.mode !== "demo" && <NotificationRuntimeForAccount account={state} />}
    <NotificationBellContent key={state.data?.user?.id ?? "anonymous"} {...props} account={state} />
  </>}</StudentAccountBoundary>;
}

function NotificationBellContent({ variant = "sidebar", account }: NotificationBellProps & { account: StudentAccountState }) {
  const t = useTranslations("notifications");
  const { locale } = useAppLocale();
  const { data: session, isPending } = account;
  const experience = useStudentExperience();
  const demo = experience.mode === "demo";
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationInboxRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const identity = session?.user?.id;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const fallbackUrl = getDefaultHomeLinkForRole(userRole);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const unreadVersion = useRef(0);
  const historyVersion = useRef(0);

  const fetchHistory = useCallback(async () => {
    if (demo || !identity) return;
    const version = ++historyVersion.current, countVersion = ++unreadVersion.current;
    try {
      setLoading(true);
      const res = await fetch("/api/notifications/history?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      if (identity !== currentIdentity.current || version !== historyVersion.current) return;
      setRows(data.notifications);
      if (countVersion === unreadVersion.current) setUnread(data.unreadCount);
    } catch {
      // Silent; the bell is an enhancement.
    } finally {
      if (identity === currentIdentity.current && version === historyVersion.current) setLoading(false);
    }
  }, [demo, identity]);

  const fetchUnreadCount = useCallback(async () => {
    if (demo || !identity) return;
    const version = ++unreadVersion.current;
    try {
      const res = await fetch("/api/notifications/history?countOnly=true", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      if (identity !== currentIdentity.current || version !== unreadVersion.current) return;
      setUnread(data.unreadCount);
    } catch {
      // Silent; the bell is an enhancement.
    }
  }, [demo, identity]);

  useEffect(() => {
    if (demo || !identity) return;
    const refresh = () => { void (open ? fetchHistory() : fetchUnreadCount()); };
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
    window.addEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, refresh);
    window.addEventListener(ZYX_NOTIFICATIONS_CHANGED, refresh);
    return () => {
      window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
      window.removeEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, refresh);
      window.removeEventListener(ZYX_NOTIFICATIONS_CHANGED, refresh);
    };
  }, [demo, identity, open, fetchHistory, fetchUnreadCount]);

  // Fetch only unread count once on initial mount
  useEffect(() => {
    if (demo || !session?.user) return;
    void fetchUnreadCount();
  }, [session?.user, fetchUnreadCount, demo]);

  if (isPending || !session?.user) return null;

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  const markRead = async (selection: { ids: string[] } | { all: true }) => {
    if (demo) return false;
    try {
      const response = await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(selection),
      });
      if (response.ok && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(ZYX_NOTIFICATIONS_CHANGED));
      }
      return response.ok;
    } catch {
      return false;
    }
  };

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next) {
      await fetchHistory();
    }
  };

  const handleClickRow = async (row: NotificationInboxRow) => {
    if (!row.read) {
      void markRead({ ids: [row.id] });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
      setUnread((prev) => Math.max(0, prev - 1));
    }
    const url = resolveLink(row, fallbackUrl);
    if (url && url.startsWith("/")) {
      router.push(experience.href?.(url) ?? url);
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (!unread || !(await markRead({ all: true }))) return;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    setUnread(0);
  };

  const triggerClass =
    variant === "navbar"
      ? "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      : "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground cursor-pointer";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} aria-label={t("bell")} title={t("bell")}>
          <Bell className="size-4 shrink-0" aria-hidden />
          {badge ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-error px-1 text-[10px] font-bold leading-none text-white">
              {badge}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("title")} align="end" sideOffset={8}
        className={`${notificationInboxPanelSurface} w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0`}>
        <NotificationInboxPanel
          locale={locale}
          copy={{
            title: t("title"),
            markAllRead: t("markAllRead"),
            close: t("close"),
            unread: t("unread"),
            loading: t("loading"),
            empty: t("empty"),
            relative: (unit, count) => t(`relative.${unit}`, { count }),
          }}
          unread={unread}
          rows={rows}
          loading={loading}
          onMarkAllRead={handleMarkAllRead}
          onSelect={row => void handleClickRow(row)}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

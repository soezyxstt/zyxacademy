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
 * - Foreground FCM messages refresh the list and surface a toast.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Brain,
  Calendar,
  CreditCard,
  Megaphone,
  BellRing,
  ClipboardList,
  Inbox,
} from "lucide-react";
import { StudentAccountBoundary, type StudentAccountState } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface HistoryResponse {
  notifications: NotificationRow[];
  unreadCount: number;
  page: number;
  limit: number;
}

// ─── Type icon mapping ────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Bell> = {
  quiz_published: ClipboardList,
  flashcard_reminder: Brain,
  tutor_reminder: Calendar,
  payment_success: CreditCard,
  admin_broadcast: Megaphone,
  announcement: BellRing,
};

const TYPE_COLORS: Record<string, string> = {
  quiz_published: "text-brand-primary",
  flashcard_reminder: "text-tertiary-2",
  tutor_reminder: "text-tertiary-3",
  payment_success: "text-status-success",
  admin_broadcast: "text-brand-secondary",
  announcement: "text-status-warning",
};

// ─── Relative time helper ─────────────────────────────────────────────────────

function formatRelative(value: string, locale: "id" | "en", t: ReturnType<typeof useTranslations>): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("relative.justNow");
  if (mins < 60) return t("relative.minutes", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("relative.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("relative.days", { count: days });
  return date.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short" });
}

function resolveLink(row: NotificationRow): string {
  const url = row.metadata?.url;
  return typeof url === "string" && url ? url : "/dashboard";
}

interface NotificationBellProps {
  /** "navbar" styles for the marketing header, "sidebar" for the app shell header. */
  variant?: "navbar" | "sidebar";
}

export function NotificationBell(props: NotificationBellProps) {
  return <StudentAccountBoundary>{state => <NotificationBellContent {...props} account={state} />}</StudentAccountBoundary>;
}

function NotificationBellContent({ variant = "sidebar", account }: NotificationBellProps & { account: StudentAccountState }) {
  const t = useTranslations("notifications");
  const { locale } = useAppLocale();
  const { data: session, isPending } = account;
  const experience = useStudentExperience();
  const demo = experience.mode === "demo";
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (demo) return;
    try {
      setLoading(true);
      const res = await fetch("/api/notifications/history?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      setRows(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // Silent; the bell is an enhancement.
    } finally {
      setLoading(false);
    }
  }, [demo]);

  const fetchUnreadCount = useCallback(async () => {
    if (demo) return;
    try {
      const res = await fetch("/api/notifications/history?countOnly=true", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      setUnread(data.unreadCount);
    } catch {
      // Silent; the bell is an enhancement.
    }
  }, [demo]);

  // Fetch only unread count once on initial mount
  useEffect(() => {
    if (demo || !session?.user) return;
    void fetchUnreadCount();
  }, [session?.user, fetchUnreadCount, demo]);

  // Foreground FCM messages refresh the inbox if open, or refresh unread count and show a toast.
  useEffect(() => {
    if (demo || !session?.user) return;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const { onForegroundMessage } = await import("@/lib/firebase/messaging");
      if (disposed) return;
      unsubscribe = onForegroundMessage((payload) => {
        const { notification = {} } = payload;
        if (notification?.title) {
          toast(notification.title, { description: notification.body ?? undefined });
        }
        if (open) {
          void fetchHistory();
        } else {
          void fetchUnreadCount();
        }
      });
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [session?.user, open, fetchHistory, fetchUnreadCount, demo]);

  if (isPending || !session?.user) return null;

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  const markRead = async (ids: string[]) => {
    if (demo) return;
    try {
      await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
    } catch {
      // Silent.
    }
  };

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next) {
      await fetchHistory();
    }
  };

  const handleClickRow = async (row: NotificationRow) => {
    if (!row.read) {
      void markRead([row.id]);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
      setUnread((prev) => Math.max(0, prev - 1));
    }
    const url = resolveLink(row);
    if (url && url.startsWith("/")) {
      router.push(experience.href?.(url) ?? url);
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = rows.filter((r) => !r.read).map((r) => r.id);
    if (unreadIds.length === 0) return;
    void markRead(unreadIds);
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    setUnread(0);
  };

  const triggerClass =
    variant === "navbar"
      ? "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      : "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground cursor-pointer";

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
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="font-heading text-body-base font-semibold text-foreground">{t("title")}</h3>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 cursor-pointer"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              {t("markAllRead")}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-body-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border/60 zebra-no-rows overflow-y-auto">
            {rows.map((row) => {
              const TypeIcon = TYPE_ICONS[row.type] ?? Bell;
              const iconColor = TYPE_COLORS[row.type] ?? "text-muted-foreground";
              return (
                <li key={row.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => void handleClickRow(row)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
                      row.read ? "hover:bg-muted/40" : "bg-muted/30 hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        row.read ? "bg-muted/60" : "bg-brand-primary/10",
                        iconColor,
                      )}
                    >
                      <TypeIcon className="size-4 shrink-0" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-body-sm font-medium",
                            row.read ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {row.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRelative(row.createdAt, locale, t)}
                        </span>
                      </span>
                      {row.body ? (
                        <span className="mt-0.5 block truncate text-body-xs text-muted-foreground">
                          {row.body}
                        </span>
                      ) : null}
                    </span>
                    {!row.read ? (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

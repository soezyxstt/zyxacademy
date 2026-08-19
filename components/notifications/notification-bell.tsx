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

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useSession } from "@/lib/auth-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}h lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function resolveLink(row: NotificationRow): string {
  const url = row.metadata?.url;
  return typeof url === "string" && url ? url : "/dashboard";
}

interface NotificationBellProps {
  /** "navbar" styles for the marketing header, "sidebar" for the app shell header. */
  variant?: "navbar" | "sidebar";
}

export function NotificationBell({ variant = "sidebar" }: NotificationBellProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/history?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      setRows(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // Silent ; the bell is an enhancement.
    }
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    void refresh();
    refreshTimer.current = setInterval(() => {
      void refresh();
    }, 60000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [session?.user, refresh]);

  // Foreground FCM messages refresh the inbox and show a toast.
  useEffect(() => {
    if (!session?.user) return;
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
        void refresh();
      });
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [session?.user, refresh]);

  if (isPending || !session?.user) return null;

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  const markRead = async (ids: string[]) => {
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
    if (next && rows.length === 0) {
      setLoading(true);
      await refresh();
      setLoading(false);
    }
  };

  const handleClickRow = async (row: NotificationRow) => {
    if (!row.read) {
      void markRead([row.id]);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
    }
    const url = resolveLink(row);
    if (url && url.startsWith("/")) {
      router.push(url);
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = rows.filter((r) => !r.read).map((r) => r.id);
    if (unreadIds.length === 0) return;
    void markRead(unreadIds);
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
  };

  const triggerClass =
    variant === "navbar"
      ? "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      : "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground cursor-pointer";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClass} aria-label="Notifikasi" title="Notifikasi">
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
          <h3 className="font-heading text-body-base font-semibold text-foreground">Notifikasi</h3>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 cursor-pointer"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Tandai semua dibaca
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
            <p className="text-body-sm text-muted-foreground">Belum ada notifikasi.</p>
          </div>
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border/60 overflow-y-auto">
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
                          {formatRelative(row.createdAt)}
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

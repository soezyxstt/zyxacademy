"use client";

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
  MessagesSquare,
  GraduationCap,
  TrendingUp,
  BookOpen,
  CalendarClock,
  ShieldAlert,
  X,
} from "lucide-react";
import { formatNotificationTime, type NotificationRelativeCopy } from "@/lib/date-utils/notification-display";
import { cn } from "@/lib/utils";
import { notificationAppearance } from "@/packages/ui-primitives/notification-appearance";

export const notificationInboxPanelSurface = "rounded-md border border-border bg-popover text-popover-foreground shadow-md";

export interface NotificationInboxRow {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const TYPE_ICONS = {
  bell: Bell,
  "clipboard-list": ClipboardList,
  "graduation-cap": GraduationCap,
  brain: Brain,
  calendar: Calendar,
  "calendar-clock": CalendarClock,
  "credit-card": CreditCard,
  "trending-up": TrendingUp,
  "book-open": BookOpen,
  megaphone: Megaphone,
  "shield-alert": ShieldAlert,
  "bell-ring": BellRing,
  "messages-square": MessagesSquare,
} satisfies Record<ReturnType<typeof notificationAppearance>["icon"], typeof Bell>;

const TYPE_COLORS = {
  "brand-primary": "text-brand-primary",
  "brand-secondary": "text-brand-secondary",
  "tertiary-2": "text-tertiary-2",
  "tertiary-3": "text-tertiary-3",
  success: "text-status-success",
  error: "text-status-error",
  warning: "text-status-warning",
  muted: "text-muted-foreground",
} satisfies Record<ReturnType<typeof notificationAppearance>["tone"], string>;

export function NotificationInboxPanel({
  locale, copy, unread, rows, loading, onMarkAllRead, onSelect, onClose, now,
}: {
  locale: "id" | "en";
  copy: { title: string; markAllRead: string; close: string; unread: string; empty: string; loading: string; relative: NotificationRelativeCopy };
  unread: number;
  rows: readonly NotificationInboxRow[];
  loading?: boolean;
  onMarkAllRead(): void;
  onSelect(row: NotificationInboxRow): void;
  onClose(): void;
  now?: number;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-heading text-body-base font-semibold text-foreground">{copy.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {unread > 0 ? (
            <button type="button" onClick={onMarkAllRead}
              className="inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-body-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 focus-visible:outline-2 focus-visible:outline-zx-accent">
              <CheckCheck className="size-3.5" aria-hidden />
              {copy.markAllRead}
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label={copy.close}
            className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground after:absolute after:-inset-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-zx-accent">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4" role="status" aria-label={copy.loading}>
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Inbox className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="text-body-sm text-muted-foreground">{copy.empty}</p>
        </div>
      ) : (
        <ul className="max-h-[24rem] divide-y divide-border/60 zebra-no-rows overflow-y-auto">
          {rows.map((row) => {
            const appearance = notificationAppearance(row.type);
            const TypeIcon = TYPE_ICONS[appearance.icon];
            const iconColor = TYPE_COLORS[appearance.tone];
            return (
              <li key={row.id} className="p-0">
                <button
                  type="button"
                  onClick={() => onSelect(row)}
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
                    <span className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 line-clamp-2 break-words text-body-sm font-medium",
                          row.read ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {row.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatNotificationTime(row.createdAt, locale, copy.relative, now)}
                      </span>
                    </span>
                    {row.body ? (
                      <span className="mt-0.5 line-clamp-2 break-words text-body-xs text-muted-foreground">
                        {row.body}
                      </span>
                    ) : null}
                  </span>
                  {!row.read ? (
                    <>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
                      <span className="sr-only">{copy.unread}</span>
                    </>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

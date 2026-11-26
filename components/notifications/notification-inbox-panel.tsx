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
} from "lucide-react";
import { formatNotificationTime, type NotificationRelativeCopy } from "@/lib/date-utils/notification-display";
import { cn } from "@/lib/utils";

export interface NotificationInboxRow {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  quiz_published: ClipboardList,
  quiz_graded: GraduationCap,
  flashcard_reminder: Brain,
  tutor_reminder: Calendar,
  tutor_booking: CalendarClock,
  tutor_digest: ClipboardList,
  payment_success: CreditCard,
  weekly_progress: TrendingUp,
  study_reengagement: BookOpen,
  admin_broadcast: Megaphone,
  admin_alert: ShieldAlert,
  announcement: BellRing,
  discussion: MessagesSquare,
};

const TYPE_COLORS: Record<string, string> = {
  quiz_published: "text-brand-primary",
  quiz_graded: "text-status-success",
  flashcard_reminder: "text-tertiary-2",
  tutor_reminder: "text-tertiary-3",
  tutor_booking: "text-brand-primary",
  tutor_digest: "text-brand-secondary",
  payment_success: "text-status-success",
  weekly_progress: "text-status-success",
  study_reengagement: "text-brand-primary",
  admin_broadcast: "text-brand-secondary",
  admin_alert: "text-status-error",
  announcement: "text-status-warning",
  discussion: "text-brand-primary",
};

export function NotificationInboxPanel({
  locale, copy, unread, rows, loading, onMarkAllRead, onSelect, now,
}: {
  locale: "id" | "en";
  copy: { title: string; markAllRead: string; empty: string; relative: NotificationRelativeCopy };
  unread: number;
  rows: readonly NotificationInboxRow[];
  loading?: boolean;
  onMarkAllRead(): void;
  onSelect(row: NotificationInboxRow): void;
  now?: number;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-heading text-body-base font-semibold text-foreground">{copy.title}</h3>
        {unread > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 cursor-pointer"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            {copy.markAllRead}
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
          <p className="text-body-sm text-muted-foreground">{copy.empty}</p>
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
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-primary" aria-hidden />
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

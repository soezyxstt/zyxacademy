"use client";

/**
 * app/admin/notifications/_components/history-table.tsx
 *
 * Displays the paginated notification history for the admin.
 * Shows the recipient (name + id), message, type, delivery status, read status
 * and timestamp. Delivery status is derived from the persisted FCM stats:
 * - attempted === 0 -> the user had no registered device (never pushed).
 * - succeeded > 0 && failedCount === 0 -> delivered to every device.
 * - succeeded > 0 && failedCount > 0 -> delivered to some devices.
 * - succeeded === 0 && attempted > 0 -> every device failed.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, AlertTriangle, Ban } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { AdminTable } from "@/components/admin/table";
import { getNotificationHistoryAction, type NotificationHistoryRow } from "../actions";

// ─── Type labels and colors ───────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  quiz_published: "Kuis",
  flashcard_reminder: "Flashcard",
  tutor_reminder: "Tutor",
  payment_success: "Pembayaran",
  admin_broadcast: "Broadcast",
  announcement: "Pengumuman",
};

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-body-xs font-medium text-foreground">
      {label}
    </span>
  );
}

// ─── Delivery status ──────────────────────────────────────────────────────────

function DeliveryStatus({ row }: { row: NotificationHistoryRow }) {
  const { attempted, succeeded, failedCount } = row;

  if (attempted === 0) {
    return (
      <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
        <Ban className="size-3.5" />
        Tanpa perangkat
      </span>
    );
  }
  if (succeeded > 0 && failedCount === 0) {
    return (
      <span className="flex items-center gap-1 text-body-xs text-status-success">
        <CheckCircle2 className="size-3.5" />
        Terkirim
      </span>
    );
  }
  if (succeeded > 0 && failedCount > 0) {
    return (
      <span className="flex items-center gap-1 text-body-xs text-status-warning">
        <AlertTriangle className="size-3.5" />
        Sebagian
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-body-xs text-status-error">
      <AlertTriangle className="size-3.5" />
      Gagal
    </span>
  );
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  history: NotificationHistoryRow[];
  total: number;
  pageSize: number;
}

export function NotificationHistoryTable({ history: initialHistory, total, pageSize }: Props) {
  const [history, setHistory] = useState(initialHistory);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    startTransition(async () => {
      const result = await getNotificationHistoryAction(nextPage, pageSize);
      setHistory(result.rows);
      setPage(nextPage);
    });
  };

  if (total === 0) {
    return (
      <AdminEmptyState title="Belum ada notifikasi" />
    );
  }

  return (
    <div className="space-y-3">
      <AdminTable>
        {/* Header */}
        <div className="hidden md:grid grid-cols-[1.6fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30">
          <span className="text-body-xs font-semibold text-muted-foreground">Pesan</span>
          <span className="text-body-xs font-semibold text-muted-foreground">Tipe</span>
          <span className="text-body-xs font-semibold text-muted-foreground">Status</span>
          <span className="text-body-xs font-semibold text-muted-foreground">Dibaca</span>
          <span className="text-body-xs font-semibold text-muted-foreground">Waktu</span>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-border/60">
          {history.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-[1.6fr_auto_auto_auto_auto] gap-2 md:gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors"
            >
              {/* Message */}
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-foreground truncate">{row.title}</p>
                {row.body ? (
                  <p className="text-body-xs text-muted-foreground truncate mt-0.5">{row.body}</p>
                ) : null}
                <p className="text-body-xs text-muted-foreground font-mono truncate mt-1">
                  {row.userName ? `${row.userName} · ` : ""}{row.userId}
                </p>
              </div>

              {/* Type badge */}
              <div className="flex items-center">
                <TypeBadge type={row.type} />
              </div>

              {/* Delivery status */}
              <div className="flex items-center">
                <DeliveryStatus row={row} />
              </div>

              {/* Read status */}
              <div className="flex items-center">
                {row.read ? (
                  <span className="flex items-center gap-1 text-body-xs text-status-success">
                    <CheckCircle2 className="size-3.5" />
                    Dibaca
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
                    <Circle className="size-3.5" />
                    Belum
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex items-center">
                <span
                  className="text-body-xs text-muted-foreground"
                  title={new Date(row.createdAt).toLocaleString("id-ID")}
                >
                  {formatRelative(new Date(row.createdAt))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </AdminTable>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-xs text-muted-foreground">
          {total} notifikasi · halaman {page} dari {totalPages}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() => loadPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-body-sm font-medium text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() => loadPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-body-sm font-medium text-foreground"
          >
            Berikutnya
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

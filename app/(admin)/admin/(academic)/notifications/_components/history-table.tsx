"use client";

/**
 * app/admin/notifications/_components/history-table.tsx
 *
 * Displays the paginated notification history for the admin.
 */

import { CheckCircle2, Circle } from "lucide-react";
import { AdminTable } from "@/components/admin/table";

interface HistoryRow {
  id: string;
  userId: string;
  title: string;
  type: string;
  read: boolean;
  createdAt: Date;
}

interface Props {
  history: HistoryRow[];
}

// ─── Type labels and colors ───────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  quiz_published: "📝 Kuis",
  flashcard_reminder: "🧠 Flashcard",
  tutor_reminder: "📅 Tutor",
  payment_success: "✅ Pembayaran",
  admin_broadcast: "📢 Broadcast",
};

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-body-xs font-medium text-foreground">
      {label}
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

export function NotificationHistoryTable({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
        <p className="text-body-sm text-muted-foreground">
          Belum ada notifikasi yang terkirim.
        </p>
      </div>
    );
  }

  return (
    <AdminTable>
      {/* Header */}
      <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30">
        <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Judul</span>
        <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipe</span>
        <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
        <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">Waktu</span>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border/60">
        {history.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 md:gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors"
          >
            {/* Title + userId */}
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-foreground truncate">{row.title}</p>
              <p className="text-body-xs text-muted-foreground font-mono truncate mt-0.5">
                {row.userId}
              </p>
            </div>

            {/* Type badge */}
            <div className="flex items-center">
              <TypeBadge type={row.type} />
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
  );
}

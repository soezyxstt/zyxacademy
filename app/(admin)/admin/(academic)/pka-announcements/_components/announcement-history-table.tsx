import { CheckCircle2, Circle } from "lucide-react";
import type { PkaAnnouncementHistoryRow } from "../actions";

export function PkaAnnouncementHistoryTable({ history }: { history: PkaAnnouncementHistoryRow[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
        <p className="text-body-sm text-muted-foreground">Belum ada pengumuman yang dikirim.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30">
        <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Judul</span>
        <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Jadwal sesi</span>
        <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
        <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Penerima</span>
      </div>
      <ul className="divide-y divide-border/60">
        {history.map((row) => (
          <li key={row.id} className="grid grid-cols-1 gap-2 px-5 py-3.5 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_auto_auto_auto] md:gap-4">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-foreground">{row.title}</p>
            </div>
            <div className="flex items-center text-body-xs text-muted-foreground">
              {new Date(row.sessionAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            </div>
            <div className="flex items-center">
              {row.sentAt ? (
                <span className="flex items-center gap-1 text-body-xs text-status-success">
                  <CheckCircle2 className="size-3.5" />
                  Terkirim
                </span>
              ) : (
                <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
                  <Circle className="size-3.5" />
                  Draft
                </span>
              )}
            </div>
            <div className="flex items-center text-body-xs text-muted-foreground">{row.recipientCount ?? "-"} peserta</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

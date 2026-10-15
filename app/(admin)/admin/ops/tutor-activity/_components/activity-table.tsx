"use client";

import { useState } from "react";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Button } from "@/components/ui/button";
import { ActivityDetail } from "./activity-detail";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ScrollText,
  User,
} from "lucide-react";
import type { TutorActivityItem } from "../dal";

interface ActivityTableProps {
  items: TutorActivityItem[];
  hasNextPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  hasPrevPage: boolean;
  isPending?: boolean;
  limit: number;
}

export function ActivityTable({
  items,
  hasNextPage,
  onNextPage,
  onPrevPage,
  hasPrevPage,
  isPending = false,
  limit,
}: ActivityTableProps) {
  const [selectedItem, setSelectedItem] = useState<TutorActivityItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleOpenDetail = (item: TutorActivityItem) => {
    setSelectedItem(item);
    setDetailOpen(true);
  };

  const getOutcomeBadge = (outcome: TutorActivityItem["outcome"]) => {
    switch (outcome) {
      case "success":
        return <StatusBadge tone="success">Sukses</StatusBadge>;
      case "rejected":
        return <StatusBadge tone="warning">Ditolak</StatusBadge>;
      case "failed":
        return <StatusBadge tone="error">Gagal</StatusBadge>;
      case "unclassified":
      default:
        return <StatusBadge tone="muted">Unclassified</StatusBadge>;
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8">
        <AdminEmptyState
          icon={ScrollText}
          title="Tidak Ada Log Aktivitas"
          description="Belum ada catatan aktivitas tutor yang sesuai dengan filter pencarian."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      {/* Desktop & Tablet Table View (hidden on small screens) */}
      <div className="hidden md:block">
        <AdminTable>
          <table className="w-full text-left text-body-sm">
            <AdminTableHead>
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">Waktu</th>
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">Tutor</th>
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">Mata Kuliah</th>
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">Entitas & Aksi</th>
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">Detail</th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border/60">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  {/* Timestamp */}
                  <td className="px-4 py-3 text-body-xs text-muted-foreground whitespace-nowrap">
                    <FormattedDate
                      date={item.createdAt}
                      options={{ dateStyle: "medium", timeStyle: "short" }}
                    />
                  </td>

                  {/* Tutor / Actor */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 max-w-[200px]">
                      <div className="size-6 rounded bg-brand-primary/10 text-brand-primary flex items-center justify-center text-body-xs font-bold shrink-0">
                        {item.actorName ? item.actorName.charAt(0).toUpperCase() : <User className="size-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{item.actorName || "Sistem / Anonim"}</p>
                        {item.actorEmail && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{item.actorEmail}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Course */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="font-medium text-foreground truncate" title={item.courseTitle || item.courseId || ""}>
                      {item.courseTitle || item.courseId || "Lintas Kursus"}
                    </p>
                    {item.courseCode && (
                      <span className="text-[10px] font-mono text-muted-foreground">{item.courseCode}</span>
                    )}
                  </td>

                  {/* Entity & Action */}
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground shrink-0">
                        {item.entityType}
                      </span>
                      <span className="text-body-xs font-mono text-muted-foreground truncate max-w-[120px]" title={item.entityId}>
                        {item.entityId}
                      </span>
                    </div>
                    <p className="text-body-xs font-mono text-foreground truncate mt-0.5" title={item.action}>
                      {item.action}
                    </p>
                  </td>

                  {/* Outcome Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getOutcomeBadge(item.outcome)}
                  </td>

                  {/* Action / Detail */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDetail(item)}
                      className="h-8 gap-1 text-body-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="size-3.5" aria-hidden />
                      <span>Lihat</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      </div>

      {/* Mobile Stacked Rows View (shown only on small screens / 380px safe) */}
      <div className="md:hidden divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-3.5 space-y-2 min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="size-6 rounded bg-brand-primary/10 text-brand-primary flex items-center justify-center text-body-xs font-bold shrink-0">
                  {item.actorName ? item.actorName.charAt(0).toUpperCase() : <User className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-body-sm text-foreground truncate">{item.actorName || "Sistem / Anonim"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <FormattedDate date={item.createdAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                  </p>
                </div>
              </div>
              <div className="shrink-0">{getOutcomeBadge(item.outcome)}</div>
            </div>

            <div className="space-y-1.5 text-body-xs border-t border-border/60 pt-2 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">Mata Kuliah:</span>
                <span className="font-medium text-foreground truncate text-right min-w-0" title={item.courseTitle || item.courseId || ""}>
                  {item.courseTitle || item.courseId || "Lintas Kursus"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">Entitas:</span>
                <span className="font-mono text-foreground truncate text-right min-w-0" title={`${item.entityType} (${item.entityId})`}>
                  <span className="font-semibold">{item.entityType}</span>{" "}
                  <span className="text-muted-foreground">({item.entityId})</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">Aksi:</span>
                <span className="font-mono text-foreground truncate text-right min-w-0" title={item.action}>
                  {item.action}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenDetail(item)}
              className="w-full h-8 gap-1 text-body-xs font-medium"
            >
              <Eye className="size-3.5" aria-hidden />
              <span>Detail</span>
            </Button>
          </div>
        ))}
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1">
        <p className="text-body-xs text-muted-foreground">
          Menampilkan {items.length} aktivitas per halaman (maks. {limit})
        </p>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={!hasPrevPage || isPending}
            className="h-8 gap-1 text-body-xs"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            <span>Sebelumnya</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!hasNextPage || isPending}
            className="h-8 gap-1 text-body-xs"
          >
            <span>Berikutnya</span>
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <ActivityDetail
        item={selectedItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

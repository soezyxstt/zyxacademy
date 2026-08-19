"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, User, Clock } from "lucide-react";
import { formatIsoDate } from "@/lib/date-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
};

export function AuditLogDrawer({ open, onOpenChange, booking }: Props) {
  const auditLogs = booking?.auditLogs || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <History className="size-5 text-brand-primary" />
            Riwayat Aktivitas & Jejak Audit Sesi
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Transparansi seluruh riwayat pemilihan slot, perpindahan jadwal, unggah materi, dan tiket permohonan.
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 my-2">
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Kelompok: {booking.group?.name} • Tutor: {booking.slot?.tutor?.name}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {auditLogs.length} Aktivitas
              </Badge>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-body-xs text-muted-foreground italic">
                Belum ada catatan jejak audit untuk sesi ini.
              </div>
            ) : (
              <div className="relative pl-6 border-l border-border space-y-4 my-2">
                {auditLogs.map((log: any, idx: number) => (
                  <div key={log.id || idx} className="relative space-y-1">
                    {/* Timeline dot */}
                    <div className="absolute -left-[31px] top-1 size-3 rounded-full bg-brand-primary border-2 border-card" />

                    <p className="text-body-xs font-semibold text-foreground leading-snug">
                      {log.summary}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="size-3" />
                        <span>{log.actor?.name || "Sistem"}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>{formatIsoDate(new Date(log.createdAt))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Tutup
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

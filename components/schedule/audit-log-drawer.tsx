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
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
};

export function AuditLogDrawer({ open, onOpenChange, booking }: Props) {
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const formatDate = (value: Date) => new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value);
  const auditLogs = booking?.auditLogs || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-xl text-left max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <History className="size-5 text-brand-primary" />
            {t("audit.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("audit.description")}
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 my-2">
            <div className="border-b border-border pb-3 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("audit.group")}: {booking.group?.name} • {t("audit.tutor")}: {booking.slot?.tutor?.name}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {t("audit.activityCount", { count: auditLogs.length })}
              </Badge>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-body-xs text-muted-foreground italic">
                {t("audit.empty")}
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
                        <span>{log.actor?.name || t("audit.system")}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>{formatDate(new Date(log.createdAt))}</span>
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
              {t("audit.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

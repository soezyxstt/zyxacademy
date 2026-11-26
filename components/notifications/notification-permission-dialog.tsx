"use client";

import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/client";

export function NotificationPermissionDialog({ blocked, onEnable, onLater, onNever }: {
  blocked: boolean;
  onEnable: () => void;
  onLater: () => void;
  onNever: () => void;
}) {
  const t = useTranslations("student");
  return (
    <Dialog open onOpenChange={open => { if (!open) onLater(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="gap-3 pr-0">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BellRing className="size-5" aria-hidden />
          </div>
          <DialogTitle>{t("notificationPreferences.permissionReminderTitle")}</DialogTitle>
          <DialogDescription>{t(blocked ? "notificationPreferences.permissionReminderBlocked" : "notificationPreferences.permissionReminderDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" className="min-h-10 h-auto whitespace-normal sm:col-span-2" onClick={onEnable}>
            {t(blocked ? "notificationPreferences.permissionReminderSettings" : "notificationPreferences.permissionReminderEnable")}
          </Button>
          <Button type="button" variant="outline" className="min-h-10 h-auto whitespace-normal px-3" onClick={onLater}>
            {t("notificationPreferences.permissionReminderLater")}
          </Button>
          <Button type="button" variant="ghost" className="min-h-10 h-auto whitespace-normal px-3" onClick={onNever}>
            {t("notificationPreferences.permissionReminderNever")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

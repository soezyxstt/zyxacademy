"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/lib/i18n/client";

const STORAGE_KEY = "zyx_dismiss_profile_prompt";

interface CompleteProfileDialogProps {
  isProfileIncomplete: boolean;
  missingFields?: {
    faculty: boolean;
    major: boolean;
    entryYear: boolean;
  };
}
 
/**
 * Modal dialog prompting students on the dashboard to complete missing ITB academic profile fields.
 * Includes session-based dismissal tracking to prevent repeated interruptions.
 */
export function CompleteProfileDialog({
  isProfileIncomplete,
  missingFields,
}: CompleteProfileDialogProps) {
  const t = useTranslations("student");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isProfileIncomplete) return;
    try {
      const isDismissed = sessionStorage.getItem(STORAGE_KEY);
      if (!isDismissed) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, [isProfileIncomplete]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors in restricted contexts
    }
    setOpen(false);
  };

  const handleCompleteNow = () => {
    setOpen(false);
    router.push("/profile/edit");
  };

  if (!isProfileIncomplete) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleDismiss();
      else setOpen(isOpen);
    }}>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20 shrink-0">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <Badge variant="secondary" className="border-brand-primary/20 bg-brand-primary/10 text-brand-primary uppercase tracking-wider text-body-2xs font-semibold">
              {t("dashboard.profilePrompt.badge")}
            </Badge>
          </div>
        </div>

        <DialogHeader className="text-left space-y-1.5">
          <DialogTitle className="font-heading text-body-base font-bold text-foreground">
            {t("dashboard.profilePrompt.title")}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground leading-relaxed">
            {t("dashboard.profilePrompt.description")}
          </DialogDescription>
        </DialogHeader>

        {missingFields && (
          <div className="my-2 border-y border-border py-3 space-y-1.5 text-body-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("dashboard.profilePrompt.faculty")}</span>
              <span className={missingFields.faculty ? "font-semibold text-status-warning" : "text-status-success font-semibold"}>
                {missingFields.faculty ? t("dashboard.profilePrompt.missing") : t("dashboard.profilePrompt.complete")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("dashboard.profilePrompt.major")}</span>
              <span className={missingFields.major ? "font-semibold text-status-warning" : "text-status-success font-semibold"}>
                {missingFields.major ? t("dashboard.profilePrompt.missing") : t("dashboard.profilePrompt.complete")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("dashboard.profilePrompt.entryYear")}</span>
              <span className={missingFields.entryYear ? "font-semibold text-status-warning" : "text-status-success font-semibold"}>
                {missingFields.entryYear ? t("dashboard.profilePrompt.missing") : t("dashboard.profilePrompt.complete")}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-wrap items-center justify-end gap-2 pt-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="text-body-sm font-semibold"
          >
            {t("dashboard.profilePrompt.later")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCompleteNow}
            className="gap-1.5 text-body-sm font-semibold bg-brand-primary hover:bg-primary-hover text-primary-foreground"
          >
            {t("dashboard.profilePrompt.completeNow")}
            <ArrowRight className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

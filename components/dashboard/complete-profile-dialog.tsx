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
      <DialogContent className="max-w-md p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20 shrink-0">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <Badge variant="secondary" className="border-brand-primary/20 bg-brand-primary/10 text-brand-primary uppercase tracking-wider text-body-2xs font-semibold">
              Profil akademis
            </Badge>
          </div>
        </div>

        <DialogHeader className="text-left space-y-1.5">
          <DialogTitle className="font-heading text-body-base font-bold text-foreground">
            Lengkapi profil belajar Anda
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground leading-relaxed">
            Isi fakultas, jurusan, dan tahun masuk untuk rekomendasi kelas.
          </DialogDescription>
        </DialogHeader>

        {missingFields && (
          <div className="my-2 border-y border-border py-3 space-y-1.5 text-body-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fakultas ITB</span>
              <span className={missingFields.faculty ? "font-semibold text-amber-600 dark:text-amber-500" : "text-status-success font-semibold"}>
                {missingFields.faculty ? "Belum diisi" : "Sudah terisi"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Jurusan / Program studi</span>
              <span className={missingFields.major ? "font-semibold text-amber-600 dark:text-amber-500" : "text-status-success font-semibold"}>
                {missingFields.major ? "Belum diisi" : "Sudah terisi"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tahun masuk ITB</span>
              <span className={missingFields.entryYear ? "font-semibold text-amber-600 dark:text-amber-500" : "text-status-success font-semibold"}>
                {missingFields.entryYear ? "Belum diisi" : "Sudah terisi"}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-end gap-2 pt-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="text-body-sm font-semibold"
          >
            Nanti saja
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCompleteNow}
            className="gap-1.5 text-body-sm font-semibold bg-brand-primary hover:bg-primary-hover text-white"
          >
            Lengkapi sekarang
            <ArrowRight className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

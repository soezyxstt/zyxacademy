"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { EnrollmentForm } from "@/components/enrollment-form";
import { useTranslations } from "@/lib/i18n/client";

export function ActivateClassModal() {
  const t = useTranslations("student");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-md gap-1.5 h-8 text-body-sm font-semibold hover:bg-muted/70 transition-colors shrink-0"
        >
          <KeyRound className="size-3.5" />
          {t("dashboard.activateClass")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dashboard.activateClassTitle")}</DialogTitle>
          <DialogDescription>
            {t("dashboard.activateClassDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <EnrollmentForm onSuccess={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

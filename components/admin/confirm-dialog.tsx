"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type AdminConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
};

export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  icon: Icon = ShieldAlert,
  destructive = true,
  loading = false,
  onConfirm,
}: AdminConfirmDialogProps) {
  const t = useTranslations("admin.states");
  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!loading) {
          onOpenChange(val);
        }
      }}
    >
      <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg text-left">
        <DialogHeader>
          <DialogTitle
            className={cn(
              "flex items-center gap-2 font-heading text-body-base font-bold",
              destructive && "text-status-error"
            )}
          >
            <Icon className="size-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            className="rounded-lg cursor-pointer font-bold"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
            onClick={onConfirm}
            isLoading={loading}
          >
            {confirmLabel ?? t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

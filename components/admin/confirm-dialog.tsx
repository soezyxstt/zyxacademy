"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { ShieldAlert } from "lucide-react";
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
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
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
  onCloseAutoFocus,
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
      <DialogContent showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus} className="max-w-md text-left">
        <DialogHeader className="pr-0">
          <DialogTitle className="flex items-start gap-2 text-body-base">
            <Icon
              aria-hidden
              className={destructive ? "mt-0.5 size-4 shrink-0 text-status-error" : "mt-0.5 size-4 shrink-0 text-muted-foreground"}
            />
            <span className="min-w-0 wrap-break-word">{title}</span>
          </DialogTitle>
          <DialogDescription className="text-body-sm wrap-break-word">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row flex-wrap items-center justify-end">
          <Button
            variant="ghost"
            className="h-auto min-h-10 max-w-full whitespace-normal"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="h-auto min-h-10 max-w-full whitespace-normal"
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

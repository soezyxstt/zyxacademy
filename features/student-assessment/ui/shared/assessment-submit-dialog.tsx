"use client";

import { useRef } from "react";
import { AlertCircle, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AssessmentSubmitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
  title: string;
  description: string;
  answeredLabel: string;
  answeredCount: number;
  totalQuestions: number;
  flaggedWarning?: string;
  unansweredWarning?: string;
  remainingTime?: { label: string; value: string };
  reviewLabel: string;
  submitLabel: string;
};

export function AssessmentSubmitDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
  title,
  description,
  answeredLabel,
  answeredCount,
  totalQuestions,
  flaggedWarning,
  unansweredWarning,
  remainingTime,
  reviewLabel,
  submitLabel,
}: AssessmentSubmitDialogProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent
        className="max-w-sm gap-0 overflow-hidden p-0"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (reviewButton.current && !submitting) {
            event.preventDefault();
            reviewButton.current.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = previousFocus.current;
          if (target?.isConnected && !submitting) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader className="px-(--panel-padding) pt-(--panel-padding)">
          <DialogTitle className="text-body-base">{title}</DialogTitle>
          <DialogDescription className="text-body-xs">{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 px-(--panel-padding) py-(--compact-gap)">
          <dl className="divide-y divide-border/55 border-y border-border/55">
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-body-sm text-muted-foreground">{answeredLabel}</dt>
              <dd className="shrink-0 text-body-sm font-semibold tabular-nums">{answeredCount} / {totalQuestions}</dd>
            </div>
            {remainingTime && (
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-body-sm text-muted-foreground">{remainingTime.label}</dt>
                <dd className="shrink-0 font-mono text-body-sm font-semibold tabular-nums">{remainingTime.value}</dd>
              </div>
            )}
          </dl>
          {unansweredWarning && (
            <div className="flex items-start gap-2 text-body-xs">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
              <p className="m-0 text-body-xs">{unansweredWarning}</p>
            </div>
          )}
          {flaggedWarning && (
            <div className="flex items-start gap-2 text-body-xs text-muted-foreground">
              <Flag className="mt-0.5 size-4 shrink-0 text-brand-secondary" aria-hidden />
              <p className="m-0 text-body-xs">{flaggedWarning}</p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row flex-wrap justify-end gap-2 border-t border-border/55 px-(--panel-padding) py-(--row-padding)">
          <Button ref={reviewButton} type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)} className="h-10">
            {reviewLabel}
          </Button>
          <Button type="button" isLoading={submitting} onClick={onSubmit} className="h-10 bg-foreground text-background hover:bg-foreground/85">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

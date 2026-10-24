"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { Check, Copy, FileCode, Layers, Shield, User, Clock, Hash } from "lucide-react";
import type { TutorActivityItem } from "../dal";

interface ActivityDetailProps {
  item: TutorActivityItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityDetail({ item, open, onOpenChange }: ActivityDetailProps) {
  const t = useTranslations("adminOps");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!item) return null;

  const copyToClipboard = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => {
      setCopiedSection(null);
    }, 2000);
  };

  const outcomeTone =
    item.outcome === "success"
      ? "success"
      : item.outcome === "rejected"
        ? "warning"
        : item.outcome === "failed"
          ? "error"
          : "muted";

  const outcomeLabel =
    item.outcome === "success"
      ? t("tutorActivityUI.success")
      : item.outcome === "rejected"
        ? t("tutorActivityUI.rejected")
        : item.outcome === "failed"
          ? t("tutorActivityUI.failed")
          : t("tutorActivityUI.unclassified");

  const beforeJson = item.beforeSnapshot
    ? JSON.stringify(item.beforeSnapshot, null, 2)
    : null;
  const afterJson = item.afterSnapshot
    ? JSON.stringify(item.afterSnapshot, null, 2)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {t("tutorActivityUI.detailTitle")}
            </DialogTitle>
            <StatusBadge tone={outcomeTone}>{outcomeLabel}</StatusBadge>
          </div>
          <DialogDescription className="text-body-xs text-muted-foreground">
            {t("tutorActivityUI.detailDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2 text-body-sm">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.eventTime")}</span>
              </div>
              <p className="text-body-sm font-medium text-foreground">
                <FormattedDate date={item.createdAt} options={{ dateStyle: "full", timeStyle: "medium" }} />
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <Hash className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.logId")}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-body-xs font-mono text-foreground truncate max-w-[200px] break-all" title={item.id}>
                  {item.id}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(item.id, "id")}
                  title={t("tutorActivityUI.copyLogId")}
                >
                  {copiedSection === "id" ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <User className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.actor")}</span>
              </div>
              <p className="text-body-sm font-medium text-foreground">
                {item.actorName || t("tutorActivityUI.systemAnonymous")}
              </p>
              {item.actorEmail && (
                <p className="text-body-xs text-muted-foreground font-mono truncate">{item.actorEmail}</p>
              )}
              <p className="text-[10px] text-muted-foreground font-mono">{item.actorId || t("tutorActivityUI.noId")}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <Layers className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.course")}</span>
              </div>
              <p className="text-body-sm font-medium text-foreground">
                {item.courseTitle || item.courseId || t("tutorActivityUI.crossCourse")}
              </p>
              {item.courseCode && (
                <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-body-xs font-mono text-muted-foreground">
                  {item.courseCode}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <FileCode className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.entityAndAction")}</span>
              </div>
              <p className="text-body-sm font-medium text-foreground">
                <span className="font-semibold">{item.entityType}</span> : <span className="font-mono text-body-xs">{item.entityId}</span>
              </p>
              <p className="text-body-xs font-mono text-muted-foreground">{item.action}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                <Shield className="size-3.5" aria-hidden />
                <span>{t("tutorActivityUI.correlationRequestId")}</span>
              </div>
              {item.correlationId ? (
                <div className="flex items-center gap-2">
                  <code className="text-body-xs font-mono text-foreground truncate max-w-[200px] break-all" title={item.correlationId}>
                    {item.correlationId}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(item.correlationId!, "corrId")}
                    title={t("tutorActivityUI.copyCorrelationId")}
                  >
                    {copiedSection === "corrId" ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                  </Button>
                </div>
              ) : (
                <p className="text-body-xs text-muted-foreground">{t("tutorActivityUI.none")}</p>
              )}
            </div>
          </div>

          {/* Reason Section */}
          {item.reason && (
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
              <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("tutorActivityUI.reasonNotes")}
              </span>
              <p className="text-body-sm text-foreground whitespace-pre-wrap">{item.reason}</p>
            </div>
          )}

          {/* Snapshots Section */}
          <div className="space-y-3">
            <h4 className="font-heading text-body-sm font-semibold text-foreground">
              {t("tutorActivityUI.changeSnapshot")}
            </h4>

            {/* Before Snapshot */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border">
                <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("tutorActivityUI.beforeSnapshot")}
                </span>
                {beforeJson && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-body-xs gap-1.5"
                    onClick={() => copyToClipboard(beforeJson, "before")}
                  >
                    {copiedSection === "before" ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                    <span>{t("tutorActivityUI.copyJson")}</span>
                  </Button>
                )}
              </div>
              <div className="p-3">
                {beforeJson ? (
                  <pre className="max-h-56 overflow-auto rounded bg-muted/30 p-2.5 text-body-xs font-mono text-foreground">
                    <code>{beforeJson}</code>
                  </pre>
                ) : (
                  <p className="text-body-xs text-muted-foreground italic py-2">
                    {t("tutorActivityUI.noBeforeSnapshot")}
                  </p>
                )}
              </div>
            </div>

            {/* After Snapshot */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border">
                <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("tutorActivityUI.afterSnapshot")}
                </span>
                {afterJson && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-body-xs gap-1.5"
                    onClick={() => copyToClipboard(afterJson, "after")}
                  >
                    {copiedSection === "after" ? <Check className="size-3 text-status-success" /> : <Copy className="size-3" />}
                    <span>{t("tutorActivityUI.copyJson")}</span>
                  </Button>
                )}
              </div>
              <div className="p-3">
                {afterJson ? (
                  <pre className="max-h-56 overflow-auto rounded bg-muted/30 p-2.5 text-body-xs font-mono text-foreground">
                    <code>{afterJson}</code>
                  </pre>
                ) : (
                  <p className="text-body-xs text-muted-foreground italic py-2">
                    {t("tutorActivityUI.noAfterSnapshot")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

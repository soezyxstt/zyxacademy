"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Button } from "@/components/ui/button";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TutorActivityItem } from "../dal";
import { activityLabel, activitySummaryTitle } from "./activity-label";
import {
  analyzeAuditReason,
  buildActivitySnapshotSummary,
  formatSnapshotValue,
  humanizeFieldName,
  unwrapAuditSnapshot,
} from "./activity-diff";

interface ActivityDetailProps {
  item: TutorActivityItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityDetail({ item, open, onOpenChange }: ActivityDetailProps) {
  const t = useTranslations("adminOps");
  const { locale: appLocale } = useAppLocale();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  useEffect(() => {
    setTechnicalOpen(false);
    setCopiedSection(null);
  }, [item?.id, open]);

  if (!item) return null;

  const resolvedLocale = appLocale === "id" ? "id-ID" : "en-US";

  const copyToClipboard = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => {
      setCopiedSection((prev) => (prev === sectionKey ? null : prev));
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

  const title = activitySummaryTitle(item.action, item.entityType, t);
  const entityLabel = activityLabel(item.entityType, t);

  const isGlobalCourse =
    !item.courseId ||
    item.courseId.trim().toLowerCase() === "global" ||
    item.courseTitle?.trim().toLowerCase() === "global";

  const courseDisplay = isGlobalCourse
    ? t("tutorActivityUI.globalScope")
    : item.courseTitle || item.courseId || t("tutorActivityUI.globalScope");

  const reasonDisplay = analyzeAuditReason(item.reason, item.action, item.entityType);
  const snapshotSummary = buildActivitySnapshotSummary(
    item.beforeSnapshot,
    item.afterSnapshot,
  );

  const afterEnvelope = unwrapAuditSnapshot(item.afterSnapshot).envelopeMeta;
  const beforeEnvelope = unwrapAuditSnapshot(item.beforeSnapshot).envelopeMeta;
  const requestId =
    item.correlationId || afterEnvelope?.requestId || beforeEnvelope?.requestId || null;

  const formatOptions = {
    locale: resolvedLocale,
    yesLabel: t("tutorActivityUI.yes"),
    noLabel: t("tutorActivityUI.no"),
    itemsCountLabel: (count: number) => t("tutorActivityUI.itemsCount", { count }),
    fieldsCountLabel: (count: number) => t("tutorActivityUI.fieldsCount", { count }),
    moreItemsLabel: (count: number) => t("tutorActivityUI.moreCount", { count }),
  };

  const translateField = (key: string) => t(`tutorActivityUI.fields.${key}`);

  const beforeJson = item.beforeSnapshot
    ? JSON.stringify(item.beforeSnapshot, null, 2)
    : null;
  const afterJson = item.afterSnapshot
    ? JSON.stringify(item.afterSnapshot, null, 2)
    : null;

  const technicalIds: Array<{
    key: string;
    label: string;
    value: string;
    copyLabel: string;
  }> = [
    {
      key: "logId",
      label: t("tutorActivityUI.logId"),
      value: item.id,
      copyLabel: t("tutorActivityUI.copyLogId"),
    },
    ...(item.actorId
      ? [
          {
            key: "actorId",
            label: t("tutorActivityUI.actorId"),
            value: item.actorId,
            copyLabel: t("tutorActivityUI.copyActorId"),
          },
        ]
      : []),
    ...(item.entityId
      ? [
          {
            key: "entityId",
            label: t("tutorActivityUI.entityId"),
            value: item.entityId,
            copyLabel: t("tutorActivityUI.copyEntityId"),
          },
        ]
      : []),
    ...(requestId
      ? [
          {
            key: "corrId",
            label: t("tutorActivityUI.correlationRequestId"),
            value: requestId,
            copyLabel: t("tutorActivityUI.copyCorrelationId"),
          },
        ]
      : []),
  ];

  const sectionHeading =
    snapshotSummary.mode === "update"
      ? t("tutorActivityUI.changesHeading")
      : snapshotSummary.mode === "create"
        ? t("tutorActivityUI.createdDetailsHeading")
        : snapshotSummary.mode === "delete"
          ? t("tutorActivityUI.deletedDetailsHeading")
          : t("tutorActivityUI.changesHeading");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {title}
            </DialogTitle>
            <StatusBadge tone={outcomeTone}>{outcomeLabel}</StatusBadge>
          </div>
          <DialogDescription className="text-body-xs tabular-nums text-muted-foreground">
            <FormattedDate
              date={item.createdAt}
              options={{ dateStyle: "medium", timeStyle: "short" }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-body-sm">
          {/* Compact metadata row */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-y border-border py-3">
            <div className="min-w-0 space-y-0.5">
              <dt className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.actorLabel")}
              </dt>
              <dd className="min-w-0">
                <p className="text-body-sm font-medium text-foreground truncate">
                  {item.actorName || t("tutorActivityUI.systemAnonymous")}
                </p>
                {item.actorEmail && (
                  <p className="text-body-xs text-muted-foreground truncate">
                    {item.actorEmail}
                  </p>
                )}
              </dd>
            </div>

            <div className="min-w-0 space-y-0.5">
              <dt className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.course")}
              </dt>
              <dd className="min-w-0 flex flex-wrap items-center gap-1.5">
                <span className="text-body-sm font-medium text-foreground break-words">
                  {courseDisplay}
                </span>
                {!isGlobalCourse && item.courseCode && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-2xs text-muted-foreground">
                    {item.courseCode}
                  </span>
                )}
              </dd>
            </div>

            <div className="min-w-0 space-y-0.5">
              <dt className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.entity")}
              </dt>
              <dd className="text-body-sm font-medium text-foreground break-words">
                {entityLabel}
              </dd>
            </div>
          </dl>

          {/* Meaningful reason / note */}
          {(reasonDisplay.kind === "note" || reasonDisplay.kind === "code") && (
            <div
              className={cn(
                "rounded-lg border px-3.5 py-2.5 space-y-1",
                item.outcome === "failed"
                  ? "border-status-error/30 bg-status-error/5"
                  : item.outcome === "rejected"
                    ? "border-status-warning/30 bg-status-warning/5"
                    : reasonDisplay.kind === "note"
                      ? "border-border bg-muted/30"
                      : "border-border bg-card",
              )}
            >
              <p className="text-body-xs font-semibold text-muted-foreground">
                {t("tutorActivityUI.reason")}
              </p>
              <p className="text-body-sm text-foreground whitespace-pre-wrap break-words">
                {reasonDisplay.text}
              </p>
            </div>
          )}

          {/* Changes / Details section */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-heading text-body-sm font-semibold text-foreground">
                {sectionHeading}
              </h4>
              {snapshotSummary.entries.length > 0 && (
                <span className="text-body-xs tabular-nums text-muted-foreground">
                  {t("tutorActivityUI.fieldsCount", {
                    count: snapshotSummary.entries.length,
                  })}
                </span>
              )}
            </div>

            {snapshotSummary.truncated ? (
              <p className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.snapshotTruncated")}
              </p>
            ) : snapshotSummary.mode === "empty" ? (
              <p className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.noRecordedChanges")}
              </p>
            ) : snapshotSummary.mode === "update" && snapshotSummary.entries.length === 0 ? (
              <p className="text-body-xs text-muted-foreground">
                {t("tutorActivityUI.noFieldChanges")}
              </p>
            ) : snapshotSummary.mode === "update" ? (
              <dl className="divide-y divide-border/60 rounded-lg border border-border">
                {snapshotSummary.entries.map((entry) => {
                  const fieldLabel = humanizeFieldName(entry.key, translateField);
                  const beforeStr = formatSnapshotValue(entry.before, formatOptions);
                  const afterStr = formatSnapshotValue(entry.after, formatOptions);
                  return (
                    <div
                      key={entry.key}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-1 sm:gap-3 px-3.5 py-2.5"
                    >
                      <dt className="text-body-xs font-semibold text-muted-foreground break-words">
                        {fieldLabel}
                      </dt>
                      <dd className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
                        <span className="text-muted-foreground line-through decoration-muted-foreground/60 break-words">
                          {beforeStr}
                        </span>
                        <ArrowRight
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="font-medium text-foreground break-words">
                          {afterStr}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <dl className="divide-y divide-border/60 rounded-lg border border-border">
                {snapshotSummary.entries.map((entry) => {
                  const fieldLabel = humanizeFieldName(entry.key, translateField);
                  const val =
                    snapshotSummary.mode === "create" ? entry.after : entry.before;
                  const formatted = formatSnapshotValue(val, formatOptions);
                  return (
                    <div
                      key={entry.key}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-1 sm:gap-3 px-3.5 py-2.5"
                    >
                      <dt className="text-body-xs font-semibold text-muted-foreground break-words">
                        {fieldLabel}
                      </dt>
                      <dd className="min-w-0 text-body-sm text-foreground break-words">
                        {formatted}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>

          {/* Collapsible Technical Details (collapsed by default) */}
          <Collapsible
            open={technicalOpen}
            onOpenChange={setTechnicalOpen}
            className="rounded-lg border border-border"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-body-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                <span>{t("tutorActivityUI.technicalDetails")}</span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-200",
                    technicalOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-3 border-t border-border px-3.5 py-3">
                {/* Technical IDs */}
                <dl className="divide-y divide-border/50">
                  {technicalIds.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
                    >
                      <dt className="text-body-xs text-muted-foreground shrink-0">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 flex items-center gap-1.5">
                        <code
                          className="truncate font-mono text-body-xs text-foreground"
                          title={row.value}
                        >
                          {row.value}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 shrink-0"
                          onClick={() => copyToClipboard(row.value, row.key)}
                          title={row.copyLabel}
                          aria-label={row.copyLabel}
                        >
                          {copiedSection === row.key ? (
                            <Check className="size-3 text-status-success" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Raw JSON blocks (only if present) */}
                {beforeJson && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-xs font-semibold text-muted-foreground">
                        {t("tutorActivityUI.beforeSnapshot")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-body-xs gap-1.5"
                        onClick={() => copyToClipboard(beforeJson, "before")}
                      >
                        {copiedSection === "before" ? (
                          <Check className="size-3 text-status-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{t("tutorActivityUI.copyJson")}</span>
                      </Button>
                    </div>
                    <pre className="max-h-52 overflow-auto rounded bg-muted/40 p-2.5 text-body-xs font-mono text-foreground">
                      <code>{beforeJson}</code>
                    </pre>
                  </div>
                )}

                {afterJson && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-xs font-semibold text-muted-foreground">
                        {t("tutorActivityUI.afterSnapshot")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-body-xs gap-1.5"
                        onClick={() => copyToClipboard(afterJson, "after")}
                      >
                        {copiedSection === "after" ? (
                          <Check className="size-3 text-status-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{t("tutorActivityUI.copyJson")}</span>
                      </Button>
                    </div>
                    <pre className="max-h-52 overflow-auto rounded bg-muted/40 p-2.5 text-body-xs font-mono text-foreground">
                      <code>{afterJson}</code>
                    </pre>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}

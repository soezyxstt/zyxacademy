"use client";

import { useId } from "react";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type AcademicProfile = {
  faculty?: string | null;
  major?: string | null;
  entryYear?: number | null;
};

/**
 * Compact x/y meter for the saved academic profile fields that drive the dashboard completion prompt.
 */
export function ProfileCompleteness({ profile, className }: { profile: AcademicProfile; className?: string }) {
  const t = useTranslations("student");
  const id = useId();
  const fields = [
    { done: Boolean(profile.faculty), label: t("profile.completeness.faculty") },
    { done: Boolean(profile.major), label: t("profile.completeness.major") },
    { done: Boolean(profile.entryYear), label: t("profile.completeness.entryYear") },
  ];
  const total = fields.length;
  const done = fields.filter((field) => field.done).length;
  const complete = done === total;
  const missing = fields.filter((field) => !field.done).map((field) => field.label);

  return (
    <div className={cn("w-full min-w-0 space-y-1.5 sm:w-64", className)}>
      <div className="flex items-center justify-between gap-2">
        <p id={id} className="text-body-xs font-semibold text-muted-foreground">{t("profile.completeness.title")}</p>
        <span className={cn("flex items-center gap-1 font-heading text-body-sm font-bold tabular-nums", complete ? "text-status-success" : "text-foreground")}>
          {complete && <CircleCheck className="size-3.5" aria-hidden />}
          {done}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={t("profile.completeness.value", { done, total })}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", complete ? "bg-status-success" : "bg-primary")}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="text-body-xs text-muted-foreground">{t("profile.completeness.missing", { fields: missing.join(", ") })}</p>
      )}
    </div>
  );
}

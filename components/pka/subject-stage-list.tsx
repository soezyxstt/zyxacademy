"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
import { CheckCircle2, Lock, PlayCircle, SkipForward, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PkaStageState } from "@/lib/pka-simulation";

const STATUS_META: Record<PkaStageState["status"], { messageKey: string; icon: typeof Lock; className: string }> = {
  locked: { messageKey: "locked", icon: Lock, className: "text-muted-foreground" },
  unlocked: { messageKey: "ready", icon: PlayCircle, className: "text-brand-primary" },
  completed: { messageKey: "completed", icon: CheckCircle2, className: "text-status-success" },
  skipped: { messageKey: "skipped", icon: SkipForward, className: "text-status-info" },
};

export function SubjectStageList({ subject, stages }: { subject: string; stages: PkaStageState[] }) {
  const t = useTranslations("studentExtras.pka");
  return (
    <ul className="divide-y divide-border">
      {stages.map((s) => {
        const meta = STATUS_META[s.status];
        const Icon = meta.icon;
        const failed = s.status === "completed" && s.passed === false;
        const clickable = s.status === "unlocked" || s.status === "completed";

        const row = (
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", meta.className)}>
                <Icon className="size-5" />
              </span>
              <div>
                <span className="block text-body-base font-semibold text-foreground">{t("stage", { stage: s.stage })}</span>
                <span className={cn("block text-body-sm", meta.className)}>
                  {failed ? t("thresholdNotPassed") : t(meta.messageKey)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {s.bestScore != null && (
                <span className="flex items-center gap-1 text-body-sm font-semibold text-foreground">
                  {failed && <XCircle className="size-4 text-status-error" />}
                  {s.bestScore}%
                </span>
              )}
              {clickable && (
                <span className="text-body-sm font-semibold text-brand-primary">
                  {s.status === "completed" ? t("viewResult") : t("start")}
                </span>
              )}
            </div>
          </div>
        );

        const href =
          s.status === "completed" && s.attemptId
            ? `/courses/tutorial-pka/simulasi/${subject}/${s.stage}?attemptId=${s.attemptId}`
            : `/courses/tutorial-pka/simulasi/${subject}/${s.stage}`;

        return (
          <li key={s.stage}>
            {clickable ? (
              <Link href={href} className="block transition-colors duration-150 hover:bg-muted/40 rounded-lg px-2 -mx-2">
                {row}
              </Link>
            ) : (
              <div className="opacity-60">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

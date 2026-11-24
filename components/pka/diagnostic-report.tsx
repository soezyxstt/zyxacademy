import { CheckCircle2, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { PkaSubjectDiagnostic } from "@/lib/pka-simulation";

const STATUS_META: Record<PkaSubjectDiagnostic["status"], { messageKey: string; icon: typeof CheckCircle2; className: string }> = {
  not_attempted: { messageKey: "statusNotAttempted", icon: HelpCircle, className: "text-muted-foreground" },
  at_risk: { messageKey: "statusAtRisk", icon: TriangleAlert, className: "text-status-error" },
  borderline: { messageKey: "statusBorderline", icon: TriangleAlert, className: "text-status-warning" },
  solid: { messageKey: "statusSolid", icon: CheckCircle2, className: "text-status-success" },
};

export async function DiagnosticReport({ results }: { results: PkaSubjectDiagnostic[] }) {
  const t = await getTranslations("studentExtras.pka");
  const subjectLabel = (subject: PkaSubjectDiagnostic["subject"]) => {
    switch (subject) {
      case "matematika": return t("subjectMathematics");
      case "fisika": return t("subjectPhysics");
      case "kimia": return t("subjectChemistry");
    }
  };
  const reportMessage = (result: PkaSubjectDiagnostic) => {
    switch (result.status) {
      case "not_attempted": return null;
      case "at_risk": return t("reportAtRisk", { subject: subjectLabel(result.subject) });
      case "borderline": return t("reportBorderline", { subject: subjectLabel(result.subject) });
      case "solid": return t("reportSolid", { subject: subjectLabel(result.subject), stage: result.passedAtStage ?? 1 });
    }
  };
  return (
    <div className="space-y-(--major-gap)">
      <ul className="divide-y divide-border/30">
        {results.map((r) => {
          const meta = STATUS_META[r.status];
          const Icon = meta.icon;
          const status = r.status === "not_attempted" && r.attempted
            ? t("reportIncomplete", { subject: subjectLabel(r.subject) })
            : t(meta.messageKey);
          const detail = reportMessage(r);
          return (
            <li key={r.subject} className="min-w-0 py-(--row-padding)">
              <div className="flex flex-wrap items-baseline justify-between gap-x-(--related-gap) gap-y-1">
                <h2 className="min-w-0 wrap-anywhere font-heading text-body-base font-bold text-foreground">{subjectLabel(r.subject)}</h2>
                {r.bestScore != null && <span className="text-body-xs font-semibold tabular-nums text-foreground">{t("bestScore", { score: r.bestScore })}</span>}
              </div>
              <div className="mt-1 flex items-start gap-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className="text-body-sm font-semibold text-foreground">{status}</p>
                  {detail && <p className="mt-0 text-body-sm text-muted-foreground">{detail}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
  );
}

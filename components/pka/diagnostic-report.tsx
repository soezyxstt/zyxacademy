import { CheckCircle2, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { PkaSubjectDiagnostic } from "@/lib/pka-simulation";

const STATUS_META: Record<PkaSubjectDiagnostic["status"], { messageKey: string; icon: typeof CheckCircle2; className: string }> = {
  not_attempted: { messageKey: "statusNotAttempted", icon: HelpCircle, className: "text-muted-foreground border-border" },
  at_risk: { messageKey: "statusAtRisk", icon: TriangleAlert, className: "text-status-error border-status-error/30 bg-status-error/5" },
  borderline: { messageKey: "statusBorderline", icon: TriangleAlert, className: "text-status-warning border-status-warning/30 bg-status-warning/5" },
  solid: { messageKey: "statusSolid", icon: CheckCircle2, className: "text-status-success border-status-success/30 bg-status-success/5" },
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
      case "not_attempted": return result.attempted ? t("reportIncomplete", { subject: subjectLabel(result.subject) }) : t("reportNotAttempted", { subject: subjectLabel(result.subject) });
      case "at_risk": return t("reportAtRisk", { subject: subjectLabel(result.subject) });
      case "borderline": return t("reportBorderline", { subject: subjectLabel(result.subject) });
      case "solid": return t("reportSolid", { subject: subjectLabel(result.subject), stage: result.passedAtStage ?? 1 });
    }
  };
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
        {results.map((r) => {
          const meta = STATUS_META[r.status];
          const Icon = meta.icon;
          return (
            <div key={r.subject} className={cn("flex items-start gap-3 p-4", meta.className)}>
              <Icon className="size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-heading text-body-base font-bold text-foreground">{subjectLabel(r.subject)}</span>
                  <span className={cn("text-body-sm font-semibold", meta.className)}>{t(meta.messageKey)}</span>
                </div>
                <p className="mt-1 text-body-sm text-muted-foreground">{reportMessage(r)}</p>
                {r.bestScore != null && <p className="mt-1 text-body-sm text-muted-foreground">{t("bestScore", { score: r.bestScore })}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <ShieldAlert className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-body-sm text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
  );
}

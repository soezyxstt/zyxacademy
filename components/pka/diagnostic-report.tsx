import { CheckCircle2, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PKA_DISCLAIMER, PKA_SUBJECT_LABELS } from "@/lib/pka-config";
import type { PkaSubjectDiagnostic } from "@/lib/pka-simulation";

const STATUS_META: Record<PkaSubjectDiagnostic["status"], { label: string; icon: typeof CheckCircle2; className: string }> = {
  not_attempted: { label: "Belum dicoba", icon: HelpCircle, className: "text-muted-foreground border-border" },
  at_risk: { label: "Berpotensi butuh pendampingan", icon: TriangleAlert, className: "text-status-error border-status-error/30 bg-status-error/5" },
  borderline: { label: "Cukup, perlu diperkuat", icon: TriangleAlert, className: "text-status-warning border-status-warning/30 bg-status-warning/5" },
  solid: { label: "Solid", icon: CheckCircle2, className: "text-status-success border-status-success/30 bg-status-success/5" },
};

export function DiagnosticReport({ results }: { results: PkaSubjectDiagnostic[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {results.map((r) => {
          const meta = STATUS_META[r.status];
          const Icon = meta.icon;
          return (
            <div key={r.subject} className={cn("flex items-start gap-3 rounded-xl border p-4 shadow-sm", meta.className)}>
              <Icon className="size-5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-heading text-body-base font-bold text-foreground">{PKA_SUBJECT_LABELS[r.subject]}</span>
                  <span className={cn("text-body-sm font-semibold", meta.className)}>{meta.label}</span>
                </div>
                <p className="mt-1 text-body-sm text-muted-foreground">{r.message}</p>
                {r.bestScore != null && <p className="mt-1 text-body-sm text-muted-foreground">Skor terbaik: {r.bestScore}%</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <ShieldAlert className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-body-sm text-muted-foreground">{PKA_DISCLAIMER}</p>
      </div>
    </div>
  );
}

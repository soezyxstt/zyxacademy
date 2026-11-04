import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

/** Presentation only, usable by either a student assessment or an isolated transport. */
export function AssessmentResult({ title, children }: { title: string; children?: ReactNode }) {
  return <section role="status" className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div className="flex items-center gap-3">
      <CheckCircle2 className="size-5 shrink-0 text-status-success" aria-hidden="true" />
      <h2 className="font-heading text-body-base font-bold">{title}</h2>
    </div>
    {children}
  </section>;
}

import Link from "next/link";
import { CheckCircle2, Lock, PlayCircle, SkipForward, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PkaStageState } from "@/lib/pka-simulation";

const STATUS_META: Record<
  PkaStageState["status"],
  { label: string; icon: typeof Lock; className: string }
> = {
  locked: { label: "Terkunci", icon: Lock, className: "text-muted-foreground" },
  unlocked: { label: "Siap dikerjakan", icon: PlayCircle, className: "text-brand-primary" },
  completed: { label: "Selesai", icon: CheckCircle2, className: "text-status-success" },
  skipped: { label: "Dilewati (lulus di stage sebelumnya)", icon: SkipForward, className: "text-status-info" },
};

export function SubjectStageList({ subject, stages }: { subject: string; stages: PkaStageState[] }) {
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
                <span className="block text-body-base font-semibold text-foreground">Stage {s.stage}</span>
                <span className={cn("block text-body-sm", meta.className)}>
                  {failed ? "Belum lolos ambang stage ini" : meta.label}
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
                  {s.status === "completed" ? "Lihat hasil" : "Mulai"}
                </span>
              )}
            </div>
          </div>
        );

        return (
          <li key={s.stage}>
            {clickable ? (
              <Link href={`/pka/${subject}/stage/${s.stage}`} className="block transition-colors duration-150 hover:bg-muted/40 rounded-lg px-2 -mx-2">
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

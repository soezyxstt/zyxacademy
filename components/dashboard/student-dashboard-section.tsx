import type { ReactNode } from "react";
export function StudentDashboardSection({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5"><h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">{title}</h2>{actions}</div>{children}</section>;
}

import type { ReactNode } from "react";

export function TutorStudentMessage({ children }: { children: ReactNode }) {
  return <div className="flex justify-end"><div className="min-w-0 max-w-[85%] rounded-2xl bg-muted/90 text-foreground px-4 py-2.5 text-body-sm leading-relaxed shadow-2xs space-y-2">{children}</div></div>;
}
export function TutorAssistantLabel() {
  return <div className="flex items-center gap-1.5"><span className="font-heading text-body-xs font-bold text-brand-primary">Zyra</span></div>;
}

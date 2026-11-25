"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHideMobileBottomNav } from "@/components/navigation";
import { readPlaygroundHandoff } from "@/lib/coding/playground-handoff";
import { CodingWorkspace } from "./coding-workspace";

export function Playground({ courseId, learnerId }: { courseId: string; learnerId: string }) {
  useHideMobileBottomNav(true);
  const params = useSearchParams(), handoff = params.get("handoff");
  const [restored, setRestored] = useState<{ learnerId: string; courseId: string; handoff: string | null; code: string; stdin: string } | null>(null);
  useEffect(() => {
    let value: { code: string; stdin: string } | null = null;
    try {
      value = readPlaygroundHandoff(sessionStorage, handoff, { learnerId, courseId });
    } catch { /* Keep the empty editor if handoff is unavailable. */ }
    setRestored({ learnerId, courseId, handoff, code: value?.code ?? "", stdin: value?.stdin ?? "" });
  }, [courseId, handoff, learnerId]);
  // Server props can change before effects run. Never pass the previous owner's
  // initial code into the new account's draft, even for that first render.
  if (!restored || restored.learnerId !== learnerId || restored.courseId !== courseId || restored.handoff !== handoff) return <p role="status" className="text-body-sm text-muted-foreground">Memuat Playground...</p>;
  return <div className="space-y-4"><CodingWorkspace key={JSON.stringify([learnerId, courseId, handoff])} courseId={courseId} learnerId={learnerId} draftKey={`playground:${handoff ?? "default"}`} initialCode={restored.code} initialStdin={restored.stdin} interactive /></div>;
}

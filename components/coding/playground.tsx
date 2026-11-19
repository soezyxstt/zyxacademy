"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CodingWorkspace } from "./coding-workspace";

export function Playground({ courseId, learnerId }: { courseId: string; learnerId: string }) {
  const params = useSearchParams(), handoff = params.get("handoff");
  const [loaded, setLoaded] = useState(false), [code, setCode] = useState(""), [stdin, setStdin] = useState("");
  useEffect(() => {
    try {
      const value = handoff ? JSON.parse(sessionStorage.getItem(`zyx-python-handoff:${handoff}`) ?? "null") : null;
      if (value?.courseId === courseId && typeof value.code === "string" && value.code.length <= 64_000) {
        setCode(value.code);
        if (typeof value.stdin === "string" && value.stdin.length <= 8000) setStdin(value.stdin);
      }
    } catch { /* Keep the empty editor if handoff is unavailable. */ }
    setLoaded(true);
  }, [courseId, handoff]);
  if (!loaded) return <p role="status" className="text-body-sm text-muted-foreground">Memuat Playground...</p>;
  return <div className="space-y-4"><CodingWorkspace key={handoff ?? "default"} courseId={courseId} learnerId={learnerId} draftKey={`playground:${handoff ?? "default"}`} initialCode={code} initialStdin={stdin} interactive /></div>;
}

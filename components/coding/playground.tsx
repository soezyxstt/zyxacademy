"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CodingWorkspace } from "./coding-workspace";
import { Button } from "@/components/ui/button";

export function Playground({ courseId, learnerId }: { courseId: string; learnerId: string }) {
  const params = useSearchParams(), handoff = params.get("handoff");
  const [loaded, setLoaded] = useState(false), [code, setCode] = useState(""), [stdin, setStdin] = useState(""), [backHref, setBackHref] = useState<string | null>(null);
  useEffect(() => {
    try {
      const value = handoff ? JSON.parse(sessionStorage.getItem(`zyx-python-handoff:${handoff}`) ?? "null") : null;
      if (value?.courseId === courseId && typeof value.code === "string" && value.code.length <= 64_000) {
        setCode(value.code);
        if (typeof value.stdin === "string" && value.stdin.length <= 8000) setStdin(value.stdin);
        if (typeof value.backHref === "string" && value.backHref.startsWith("/courses/") && !value.backHref.startsWith("//")) setBackHref(value.backHref);
      }
    } catch { /* Keep the empty editor if handoff is unavailable. */ }
    setLoaded(true);
  }, [courseId, handoff]);
  if (!loaded) return <p role="status" className="text-body-sm text-muted-foreground">Memuat Playground...</p>;
  return <div className="space-y-4">{backHref ? <Button asChild variant="outline" className="text-body-sm"><Link href={backHref}>Kembali ke artikel</Link></Button> : null}<CodingWorkspace key={handoff ?? "default"} courseId={courseId} learnerId={learnerId} draftKey={`playground:${handoff ?? "default"}`} initialCode={code} initialStdin={stdin} interactive /></div>;
}

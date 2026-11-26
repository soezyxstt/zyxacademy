import "katex/dist/katex.min.css";
import { Suspense } from "react";
import { Activity, Zap } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AstInspectorFixture, JobsFixture } from "./reference-clients";
import { createEvaluationFixtureRequest } from "@/packages/native-parity/operations/evaluation-fixtures";
import { evaluationRead, type GenerationJobs } from "@/packages/native-parity/operations/evaluation-contract";

export default async function EvaluationReference({ searchParams }: { searchParams: Promise<{ mode?: string; theme?: string; screen?: string }> }) {
  const { mode, theme, screen } = await searchParams;
  const request = createEvaluationFixtureRequest(mode === "empty" ? "empty" : "populated");
  const snapshot = screen === "jobs" ? await request<GenerationJobs>(evaluationRead("/admin/jobs")) : undefined;
  return <main className={`${theme === "dark" ? "dark" : "light"} bg-background min-h-screen p-4 text-foreground space-y-4`}>
    {snapshot ? <>
      <AdminPageHeader icon={Zap} title="Generasi Soal" />
      <JobsFixture snapshot={snapshot} />
    </> : <>
      <AdminPageHeader icon={Activity} title="AST Inspector" />
      <Suspense><AstInspectorFixture /></Suspense>
    </>}
  </main>;
}

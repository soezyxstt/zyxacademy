import { randomUUID } from "expo-crypto";
import { useContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { courseQuizApi, type QuizInsightReport } from "../../../../../packages/academic/quiz-insight";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { TextDocumentTransport } from "./document-transport";
import { Action, DataRow, Ink, layout } from "./ui";

export function QuizAnalysisAction({ quizId, courseId, totalCompleted, refresh }: {
  quizId: string; courseId: string; totalCompleted: number; refresh(): void;
}) {
  const transport = useContext(TextDocumentTransport);
  const { canInteract, suspended } = useProtectedInteraction();
  const flight = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "denied" | "unknown" | "empty">("idle");
  useEffect(() => () => { flight.current?.abort(); flight.current = null; }, [transport, quizId, courseId]);
  async function analyze() {
    if (!canInteract() || !totalCompleted || !transport?.command || flight.current) return;
    const job = new AbortController();
    flight.current = job;
    setStatus("busy");
    try {
      const response = await transport.command(courseQuizApi(quizId, courseId, "analyze"), { method: "POST", body: {}, requestId: randomUUID() }, job.signal);
      if (job.signal.aborted || !canInteract()) return;
      if (!response.ok) {
        setStatus(response.status === 400 ? "empty" : [401,403,404].includes(response.status) ? "denied" : "unknown");
        return;
      }
      const result = await response.json() as { success?: boolean; insight?: { templateId?: string } };
      if (job.signal.aborted || !canInteract()) return;
      if (result.success !== true || result.insight?.templateId !== quizId) { setStatus("unknown"); return; }
      setStatus("idle");
      refresh();
    } catch { if (!job.signal.aborted && canInteract()) setStatus("unknown"); }
    finally { if (flight.current === job) flight.current = null; }
  }
  if (!transport?.command) return null;
  if (status === "unknown" || status === "denied") return <View style={layout.group}>
    <Ink>{status === "denied" ? "Akses analisis tidak tersedia." : "Hasil analisis belum terkonfirmasi. Periksa analisis tersimpan."}</Ink>
    <Action label="Muat ulang analisis" disabled={suspended} onPress={() => { if (canInteract()) { setStatus("idle"); refresh(); } }} />
  </View>;
  return <View style={layout.group}>
    {status === "empty" ? <Ink>Belum ada pengerjaan selesai.</Ink> : null}
    <Action label={status === "busy" ? "Menganalisis…" : "Analisis performa kuis"} disabled={suspended || !totalCompleted || status === "busy"}
      onPress={() => void analyze()} />
  </View>;
}

export function QuizInsightDetails({ report }: { report: QuizInsightReport }) {
  const ranges: Record<string,string> = { high: "Tinggi", medium: "Sedang", low: "Rendah" };
  return <>
    {report.misconceptions?.length ? <View style={layout.group}><Ink kind="strong">Miskonsepsi</Ink>
      {report.misconceptions.map((item, index) => <DataRow key={index} title={item.concept} detail={ranges[item.frequency ?? ""]}
        description={[item.description, item.targetedQuestions?.join(", ")].filter(Boolean).join("\n")} />)}</View> : null}
    {report.teachingRecommendations?.length ? <View style={layout.group}><Ink kind="strong">Rekomendasi pengajaran</Ink>
      {report.teachingRecommendations.map((item, index) => <DataRow key={index} title={item.topic} description={[item.actionItem, item.rationale].join("\n")} />)}</View> : null}
    {report.hardestQuestionsAnalysis?.length ? <View style={layout.group}><Ink kind="strong">Soal tersulit</Ink>
      {report.hardestQuestionsAnalysis.map((item, index) => <DataRow key={index} title={item.promptSnippet}
        detail={item.accuracyRate + "%"} description={[item.diagnosis, item.distractorTrap].join("\n")} />)}</View> : null}
    {report.easiestQuestionsAnalysis?.length ? <View style={layout.group}><Ink kind="strong">Soal termudah</Ink>
      {report.easiestQuestionsAnalysis.map((item, index) => <DataRow key={index} title={item.promptSnippet} detail={item.accuracyRate + "%"} description={item.reason} />)}</View> : null}
    {report.actionableNextSteps?.length ? <View style={layout.group}><Ink kind="strong">Langkah berikutnya</Ink>
      {report.actionableNextSteps.map((step, index) => <Ink key={index}>{step}</Ink>)}</View> : null}
  </>;
}

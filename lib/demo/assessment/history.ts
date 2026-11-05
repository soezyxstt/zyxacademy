import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoOverlay } from "@/lib/demo/session-overlay";
import { demoQuizEventKey, parseDemoQuizAttempt } from "./quiz";
export type DemoQuizHistoryRow = { id: string; templateId: string; status: "completed"; score: number; submittedAt: Date; durationSeconds: number | null };
export function fictionalQuizHistory(snapshot: PublicDemoSnapshot): DemoQuizHistoryRow[] {
 const templateId = snapshot.availableAssessments.find(item => item.type === "quiz")?.id;
 if (!templateId) return [];
 return snapshot.history.filter(day => day.quizzesCompleted > 0).map((day, index) => ({ id: `fictional-result-${day.date}`, templateId, status: "completed" as const, score: 72 + (index % 3) * 8, submittedAt: new Date(`${day.date}T12:00:00Z`), durationSeconds: 240 + index * 30 })).sort((a,b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}
export function localQuizHistory(snapshot: PublicDemoSnapshot, overlay: DemoOverlay, read: (key: string) => string | null): DemoQuizHistoryRow[] {
 const templateId = snapshot.availableAssessments.find(item => item.type === "quiz")?.id;
 if (!templateId) return [];
 return overlay.events.flatMap(event => {
  if (event.kind !== "quiz" || !event.id.startsWith("quiz-v2-")) return [];
  try {
   const raw = read(`zyx-demo-quiz-result:v2:${event.id}`);
   if (!raw || raw.length >= 200000) return [];
   const envelope: unknown = JSON.parse(raw);
   if (!envelope || typeof envelope !== "object" || !("identity" in envelope) || typeof envelope.identity !== "string") return [];
   const scope: unknown = JSON.parse(envelope.identity);
   if (!Array.isArray(scope) || scope[0] !== snapshot.courseId || scope[1] !== snapshot.revision || scope[2] !== 0 || !Array.isArray(scope[3]) || scope[3].length < 1 || scope[3].length > 1000) return [];
   const prefix = `${demoQuizEventKey(envelope.identity)}:`;
   const id = event.id.slice(prefix.length);
   if (!event.id.startsWith(prefix) || (id !== "latest" && !/^[a-f0-9-]{36}$/.test(id))) return [];
   const saved = parseDemoQuizAttempt(raw, envelope.identity, scope[3].length);
   return saved ? [{ id, templateId, status: "completed" as const, score: Math.round(saved.result.score / saved.result.total * 100), submittedAt: new Date(`${event.date}T12:00:00Z`), durationSeconds: null }] : [];
  } catch { return []; }
 }).reverse();
}

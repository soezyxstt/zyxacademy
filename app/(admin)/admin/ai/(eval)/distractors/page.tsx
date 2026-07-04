import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { aiQuestionBank, courses, questionOptionStats } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";

export const metadata: Metadata = {
  title: pageTitle("Analitik Distraktor"),
};

interface DistractorEntry {
  optionIndex: number;
  kind: string;
  misconceptionKoId: string | null;
  label: string;
}

const QUESTION_TOTAL_INDEX = -1;

export default async function DistractorAnalyticsPage() {
  await assertTutorOrAdmin();

  const stats = await db.select().from(questionOptionStats);

  // Group counters by question.
  const byQuestion = new Map<string, { total: number; counts: Map<number, number> }>();
  for (const row of stats) {
    const entry = byQuestion.get(row.questionId) ?? { total: 0, counts: new Map() };
    if (row.optionIndex === QUESTION_TOTAL_INDEX) {
      entry.total = row.totalAttempts;
    } else {
      entry.counts.set(row.optionIndex, row.selectedCount);
    }
    byQuestion.set(row.questionId, entry);
  }

  const questionIds = [...byQuestion.keys()];
  const questions = questionIds.length
    ? await db.select().from(aiQuestionBank).where(inArray(aiQuestionBank.id, questionIds))
    : [];
  const allCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Order by most-answered, drop questions with no attempts yet.
  const ordered = questionIds
    .map((id) => ({ id, agg: byQuestion.get(id)! }))
    .filter((x) => x.agg.total > 0 && questionMap.has(x.id))
    .sort((a, b) => b.agg.total - a.agg.total);

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Analitik Distraktor</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Analisis miskonsepsi siswa berdasarkan pilihan ganda yang salah.
        </p>
      </div>
      {ordered.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Belum ada data. Statistik terisi setelah siswa mengerjakan kuis dengan fitur ini aktif.
        </p>
      ) : (
        <div className="space-y-8">
          {ordered.map(({ id, agg }) => {
            const q = questionMap.get(id)!;
            const options = (q.options as string[]) ?? [];
            const correct = new Set((q.correctIndices as number[]) ?? []);
            const dmap = (q.distractorMap as DistractorEntry[] | null) ?? [];
            const labelByIndex = new Map(dmap.map((d) => [d.optionIndex, d]));
            return (
              <div key={id} className="space-y-3 border-b border-border pb-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-body-md font-semibold text-foreground">{q.prompt}</h2>
                  <span className="shrink-0 text-body-sm text-muted-foreground">
                    {agg.total} jawaban
                  </span>
                </div>
                <p className="text-body-sm text-muted-foreground">{courseMap[q.courseId] ?? q.courseId}</p>
                <div className="space-y-2">
                  {options.map((opt, idx) => {
                    const count = agg.counts.get(idx) ?? 0;
                    const pct = agg.total > 0 ? Math.round((count / agg.total) * 100) : 0;
                    const isCorrect = correct.has(idx);
                    const tag = labelByIndex.get(idx);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-body-sm">
                          <span className={isCorrect ? "font-semibold text-status-success" : "text-foreground"}>
                            {opt}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-md bg-muted">
                          <div
                            className={`h-full rounded-md transition-[width] duration-500 ease-out ${isCorrect ? "bg-status-success" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {!isCorrect && tag && tag.kind === "misconception" && (
                          <p className="text-body-sm text-status-warning">Miskonsepsi: {tag.label}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

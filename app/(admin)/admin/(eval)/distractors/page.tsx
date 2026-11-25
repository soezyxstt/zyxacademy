import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { db } from "@/db";
import { recordAuthorizedGlobalDisclosures } from "@/lib/gamification/question-exposure";
import { aiQuestionBank, courses, questionOptionStats } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminPageHeader } from "@/components/admin/page-header";
import { MathText } from "@/components/course/math-text";
import { Target } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return { title: pageTitle(t("metadata.distractors")) };
}

interface DistractorEntry {
  optionIndex: number;
  kind: string;
  misconceptionKoId: string | null;
  label: string;
}

const QUESTION_TOTAL_INDEX = -1;

export default async function DistractorAnalyticsPage() {
  const { user } = await assertTutorOrAdmin();

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

  const disclosedIds = new Set(ordered.map(item => item.id));
  await db.transaction(tx => recordAuthorizedGlobalDisclosures(tx, { userId: user.id, questions: questions.filter(q => disclosedIds.has(q.id)).map(q => ({ questionId: q.id, courseId: q.courseId })), requestId: crypto.randomUUID() }));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Target}
        title={<TranslatedText namespace="adminEval" messageKey="routes.distractors" />}
      />
      {ordered.length === 0 ? (
        <AdminEmptyState icon={Target} title={<TranslatedText namespace="adminEval" messageKey="distractors.emptyTitle" />} description={<TranslatedText namespace="adminEval" messageKey="distractors.emptyDescription" />} />
      ) : (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {ordered.map(({ id, agg }) => {
            const q = questionMap.get(id)!;
            const options = (q.options as string[]) ?? [];
            const correct = new Set((q.correctIndices as number[]) ?? []);
            const dmap = (q.distractorMap as DistractorEntry[] | null) ?? [];
            const labelByIndex = new Map(dmap.map((d) => [d.optionIndex, d]));
            return (
              <section key={id} className="space-y-(--compact-gap) py-(--related-gap)">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <MathText className="block min-w-0 wrap-break-word text-body-base font-semibold text-foreground" as="div">{q.prompt}</MathText>
                  <span className="shrink-0 text-body-sm text-muted-foreground">
                    {agg.total} <TranslatedText namespace="adminEval" messageKey="distractors.answers" />
                  </span>
                </div>
                <p className="text-body-xs text-muted-foreground">{courseMap[q.courseId] ?? q.courseId}</p>
                <div className="space-y-2">
                  {options.map((opt, idx) => {
                    const count = agg.counts.get(idx) ?? 0;
                    const pct = agg.total > 0 ? Math.round((count / agg.total) * 100) : 0;
                    const isCorrect = correct.has(idx);
                    const tag = labelByIndex.get(idx);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-body-sm">
                          <MathText className={isCorrect ? "font-semibold text-status-success" : "text-foreground"} as="span">
                            {opt}
                          </MathText>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-md bg-muted">
                          <div
                            className={`h-full rounded-md transition-[width] duration-500 ease-out ${isCorrect ? "bg-status-success" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {!isCorrect && tag && tag.kind === "misconception" && (
                          <p className="text-body-xs text-foreground"><TranslatedText namespace="adminEval" messageKey="distractors.misconception" /> {tag.label}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

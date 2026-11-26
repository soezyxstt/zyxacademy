import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QuizListClient } from "@/app/(student)/courses/[id]/quiz/quiz-list-client";
import { TryoutListClient } from "@/app/(student)/courses/[id]/tryout/tryout-list-client";
import { StudentQuizListView } from "@/components/course/student-quiz-list-view";
import { StudentTryoutsView } from "@/components/course/student-tryouts-view";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import learning from "@/messages/id/learning.json";
import schedule from "@/messages/id/schedule.json";
import type { AssessmentPage } from "@/packages/native-parity/student/assessment/contract";

type AssessmentList = Extract<AssessmentPage, { rows: unknown }>;

const input = document.getElementById("assessment-list-input");
if (!input?.textContent) throw new Error("Missing assessment list input");
const data: AssessmentList = JSON.parse(input.textContent);
const [, , courseId, kind] = location.pathname.split("/");
if (location.pathname !== `/courses/${courseId}/${kind}` || data.kind !== `${kind}-list`) {
  throw new Error("Assessment list input does not match the requested route");
}

function Activation() {
  return <div className="mb-3 border-l-2 border-brand-secondary/60 py-2 pl-3">
    <div className="grid gap-(--related-gap) md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
      <div>
        <h3 className="font-heading text-body-base font-bold text-brand-secondary">
          <TranslatedText namespace="learning" messageKey="quizPage.activationTitle" />
        </h3>
        <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
          <TranslatedText namespace="learning" messageKey={kind === "quiz" ? "quizPage.activationDescription" : "tryoutPage.activationDescription"} />
        </p>
      </div>
      <EnrollmentForm className="w-full" />
    </div>
  </div>;
}

function QuizList() {
  return <StudentQuizListView id={courseId} courseTitle={data.courseTitle} access="all">
    <Reveal>
      {!data.fullAccess && <Activation />}
      <QuizListClient courseId={courseId} hasFullContentAccess={data.fullAccess}
        accessTier={data.fullAccess ? "standard" : "free"} freeEligibleTemplateIds={[]}
        templates={data.rows.map(row => ({
          id: row.id, title: row.title, visibility: row.visibility ?? "paid", category: "premium",
          selectionRules: { count: row.questionCount, chapterIds: [] },
          timeLimitSeconds: row.durationSeconds, manualStatus: "scheduled",
          openAt: row.openAt ? new Date(row.openAt) : null, closeAt: row.closeAt ? new Date(row.closeAt) : null,
        }))}
        attempts={data.rows.flatMap(row => row.bestScore === undefined ? [] : [{
          id: `${row.id}-completed`, templateId: row.id, status: "completed", score: row.bestScore,
        }])}
      />
    </Reveal>
  </StudentQuizListView>;
}

function TryoutList() {
  return <StudentTryoutsView courseTitle={data.courseTitle}>
    <Reveal>
      {!data.fullAccess && <Activation />}
      <TryoutListClient courseId={courseId} hasFullContentAccess={data.fullAccess}
        tryouts={data.rows.map(row => ({
          id: row.id, title: row.title, courseId, type: "tryout", status: "published",
          settings: { timeLimitMinutes: (row.durationSeconds ?? 5400) / 60, maxAttempts: row.maxAttempts }, questions: [],
          questionCount: row.questionCount ?? 0, openAt: row.openAt, closeAt: row.closeAt,
        }))}
      />
    </Reveal>
  </StudentTryoutsView>;
}

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ learning, schedule }}>
    <main>{kind === "quiz" ? <QuizList /> : <TryoutList />}</main>
  </NextIntlClientProvider>,
);

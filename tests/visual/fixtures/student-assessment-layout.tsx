import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PkaRegistrationForm } from "@/app/(student)/courses/tutorial-pka/_components/registration-form";
import { ApplicationPage } from "@/components/application-page";
import { StudentCourseResultsList, type StudentResultRow } from "@/components/course/student-course-results-list";
import { StudentQuizGateway } from "@/components/course/student-quiz-gateway";
import learning from "@/messages/id/learning.json";
import studentExtras from "@/messages/id/studentExtras.json";
import ui from "@/messages/id/ui.json";

const state = new URLSearchParams(window.location.search).get("state");
const submissions: StudentResultRow[] = [
  { id: "completed", examTitle: "Kuis limit dan kekontinuan fungsi", examType: "quiz", status: "completed", score: 85, submittedAt: "2030-01-02T02:00:00Z" },
  { id: "pending", examTitle: "Tryout turunan dan penerapannya untuk sains dan rekayasa", examType: "tryout", status: "pending_review", score: null, submittedAt: "2030-01-03T02:00:00Z" },
];

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ learning, studentExtras, ui }}>
    <main>
      {state === "registration" ? (
        <ApplicationPage><PkaRegistrationForm googleEmail="pelajar@example.test" defaultName="Pelajar Contoh" /></ApplicationPage>
      ) : state === "empty" || state === "results" ? (
        <ApplicationPage><StudentCourseResultsList id="fixture" allSubmissions={state === "empty" ? [] : submissions} /></ApplicationPage>
      ) : (
        <StudentQuizGateway
          id="fixture"
          courseTitle="Matematika I"
          template={{ id: "limit", title: "Kuis limit", selectionRules: { count: 8 }, timeLimitSeconds: 900, maxAttempts: state === "exhausted" ? 1 : 2 }}
          completedAttempts={[{ id: "completed", score: 85, submittedAt: new Date("2030-01-02T02:00:00Z"), durationSeconds: 78 }]}
          inProgressAttempt={state === "exhausted" ? null : { id: "in-progress" }}
          questionsCount={8}
          startAction={null}
        />
      )}
    </main>
  </NextIntlClientProvider>,
);

import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QuizStartButton } from "@/app/(student)/courses/[id]/quiz/[quizId]/quiz-start-button";
import { StudentQuizGateway } from "@/components/course/student-quiz-gateway";
import learning from "@/messages/id/learning.json";
import { assessmentApiPath, type AssessmentPage } from "@/packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest, quizGatewayEvidence, quizGatewayScenario } from "@/packages/native-parity/student/assessment/fixtures";

async function render() {
  const state = new URLSearchParams(location.search).get("state");
  const scenario = quizGatewayEvidence.states.find(value => value === state);
  if (!scenario || location.pathname !== assessmentFixturePaths.quiz) throw new Error("Unknown quiz gateway fixture");

  const request = createAssessmentFixtureRequest(quizGatewayScenario(scenario));
  const response = await request(assessmentApiPath(assessmentFixturePaths.quiz));
  const data: AssessmentPage = await response.json();
  if (!response.ok || data.kind !== "quiz-detail") throw new Error("Quiz gateway fixture is unavailable");
  const { assessment, history } = data;
  const { questionCount } = assessment;
  if (questionCount === null) throw new Error("Quiz gateway fixture question count is unavailable");
  const courseId = location.pathname.split("/")[2];

  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale={quizGatewayEvidence.locale} timeZone="Asia/Jakarta" messages={{ learning }}>
      <main>
        <StudentQuizGateway id={courseId} courseTitle={data.courseTitle}
          template={{ id: assessment.id, title: assessment.title, selectionRules: { count: questionCount },
            timeLimitSeconds: assessment.durationSeconds, maxAttempts: assessment.maxAttempts }}
          completedAttempts={history.map(({ id, score, submittedAt, durationSeconds }) => ({
            id, score, submittedAt: submittedAt ? new Date(submittedAt) : null, durationSeconds: durationSeconds ?? null,
          }))}
          inProgressAttempt={assessment.activeAttemptId ? { id: assessment.activeAttemptId } : null}
          questionsCount={questionCount}
          startAction={<QuizStartButton courseId={courseId} templateId={assessment.id} />}
        />
      </main>
    </NextIntlClientProvider>,
  );
}

void render();

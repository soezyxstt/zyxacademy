import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { QuizPlayer } from "@/components/course/quiz-player";
import learning from "@/messages/id/learning.json";
import { quizPlayerEvidence, quizPlayerFixture } from "@/packages/native-parity/student/assessment/quiz-player-fixture";

const { courseId, attemptId, locale, path } = quizPlayerEvidence;
const { assessment, player } = quizPlayerFixture;
if (location.pathname + location.search !== path) throw new Error("Unknown quiz player fixture route");

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={locale} timeZone="Asia/Jakarta" messages={{ learning }}>
    <main>
      <CoursePageShell title={assessment.title} hideHeader>
        <QuizPlayer courseId={courseId} attemptId={attemptId} initialAnswers={player.answers}
          startedAtMs={player.startAt ? Date.parse(player.startAt) : undefined}
          exam={{ id: assessment.id, title: assessment.title,
            settings: { timeLimitSeconds: player.durationSeconds, canGoBack: player.canGoBack, requireAllAnswered: player.requireAllAnswered },
            questions: player.questions.map((question, index) => ({ ...question, order: index + 1 })) }}
          transport={{ submit: async () => { throw new Error("Player reference captures drafts before submission"); } }} />
      </CoursePageShell>
    </main>
  </NextIntlClientProvider>,
);

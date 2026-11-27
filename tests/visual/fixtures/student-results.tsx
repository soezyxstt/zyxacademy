import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseResultsList } from "@/components/course/student-course-results-list";
import { TranslatedText } from "@/components/i18n/translated-text";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { getStudentMobileBackHref } from "@/components/navigation/student/student-nav-model";
import learning from "@/messages/id/learning.json";
import student from "@/messages/id/student.json";
import { assessmentApiPath, type AssessmentPage } from "@/packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, resultsEvidence, resultsScenario } from "@/packages/native-parity/student/assessment/fixtures";
import { createStudentFixtureRequest } from "@/packages/native-parity/student/fixture-request";

async function render() {
  const stateParam = new URLSearchParams(location.search).get("state");
  const state = resultsEvidence.states.find(value => value === stateParam);
  const path = assessmentFixturePaths.results;
  if (!state || location.pathname !== path) throw new Error("Unknown Student results fixture");

  const request = createStudentFixtureRequest(resultsScenario(state));
  const response = await request(assessmentApiPath(path));
  const data = await response.json() as AssessmentPage;
  if (!response.ok || data.kind !== "results" || !data.fullAccess) throw new Error("Student results fixture is unavailable");
  const courseId = path.split("/")[2];
  const submissions = data.results.map(({ id, assessmentTitle, kind, status, score, submittedAt }) => {
    if (!submittedAt) throw new Error("The results capture requires submitted timestamps");
    return { id, examTitle: assessmentTitle, examType: kind, status, score, submittedAt };
  });

  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale={resultsEvidence.locale} timeZone={resultsEvidence.timeZone} messages={{ learning, student }}>
      <MobileChromeProvider>
        <MobileTopNavbar title={student.routeTitles.examResults} backHref={getStudentMobileBackHref(path)} />
        <main>
          <CoursePageShell title={<TranslatedText namespace="learning" messageKey="results.title" values={{ course: data.courseTitle }} />}>
            <StudentCourseResultsList id={courseId} allSubmissions={submissions} />
          </CoursePageShell>
        </main>
      </MobileChromeProvider>
    </NextIntlClientProvider>,
  );
}

void render();

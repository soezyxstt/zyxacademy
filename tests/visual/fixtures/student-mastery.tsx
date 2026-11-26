import { createRoot } from "react-dom/client";
import { Target } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { ConceptMap } from "@/components/course/concept-map";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { getStudentMobileBackHref } from "@/components/navigation/student/student-nav-model";
import learning from "@/messages/id/learning.json";
import { createStudentFixtureRequest } from "@/packages/native-parity/student/fixture-request";
import { learningApi, type LearningData } from "@/packages/native-parity/student/learning/contracts";

async function render() {
  const courseId = "matematika-1";
  const path = `/courses/${courseId}/mastery`;
  const scenario = new URLSearchParams(location.search).get("scenario");
  if (location.pathname !== path || (scenario !== "enrolled" && scenario !== "empty")) throw new Error("Invalid mastery fixture route");

  const request = createStudentFixtureRequest(scenario);
  const response = await request(learningApi + "?" + new URLSearchParams({ view: "mastery", courseId, locale: "id" }));
  const data: LearningData = await response.json();
  if (!response.ok || data.view !== "mastery" || data.state !== "ready") throw new Error("Invalid mastery fixture response");
  const map = <ConceptMap courseId={courseId} groups={data.groups} />;

  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ learning }}>
      <MobileChromeProvider>
        <MobileTopNavbar title={data.courseTitle} backHref={getStudentMobileBackHref(path)} />
        <main>
          <CoursePageShell title={learning.mastery.title.replace("{course}", data.courseTitle)} icon={Target}>
            {data.groups.length ? map : <div className="flex min-h-[50vh] flex-col items-center justify-center">{map}</div>}
          </CoursePageShell>
        </main>
      </MobileChromeProvider>
    </NextIntlClientProvider>,
  );
}

void render();

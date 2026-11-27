import { createRoot } from "react-dom/client";
import { BarChart3, Compass } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClientProvider } from "@tanstack/react-query";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { StudentCourseProgressView } from "@/components/course/student-course-progress-view";
import { StudyPathTimeline } from "@/components/course/study-path-timeline";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { getStudentMobileBackHref } from "@/components/navigation/student/student-nav-model";
import { createQueryClient, syncQueryAccount } from "@/lib/query/client";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import { learningRequestPath, type LearningData } from "@/packages/native-parity/student/learning/contracts";

async function render() {
  const courseId = "matematika-1";
  const view = location.pathname.split("/").at(-1);
  if (view !== "progress" && view !== "path") throw new Error("Unexpected reference path");
  const response = await fetch(`${learningRequestPath(view, { id: courseId }, {})}&locale=id`);
  const data: LearningData = await response.json();
  if (!response.ok || data.state !== "ready" || (data.view !== "progress" && data.view !== "path") || data.view !== view) {
    throw new Error("Unexpected learning reference response");
  }
  const client = createQueryClient();
  syncQueryAccount(client, "fixture-student");
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ learning, studentCourse }}>
        <MobileChromeProvider>
          <MobileTopNavbar title={data.courseTitle} backHref={getStudentMobileBackHref(location.pathname)} />
          <main>
            <CoursePageShell title={learning[view].title.replace("{course}", data.courseTitle)} icon={view === "path" ? Compass : BarChart3}>
              {data.view === "path" ? <StudyPathTimeline courseId={courseId} /> :
                <StudentCourseProgressView courseId={courseId} statistics={data.statistics} activities={data.activities} />}
            </CoursePageShell>
          </main>
        </MobileChromeProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

void render();

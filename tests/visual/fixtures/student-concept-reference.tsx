import ConceptExplorerPage from "@/app/(student)/courses/[id]/concept/[slug]/page";
import { NextIntlClientProvider } from "next-intl";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { getStudentMobileBackHref } from "@/components/navigation/student/student-nav-model";
import learning from "@/messages/id/learning.json";
import schedule from "@/messages/id/schedule.json";
import studentCourse from "@/messages/id/studentCourse.json";

export async function renderConceptReference(courseId: string, slug: string, courseTitle: string) {
  const pathname = `/courses/${courseId}/concept/${slug}`;
  const page = await ConceptExplorerPage({ params: Promise.resolve({ id: courseId, slug }) });
  return <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ learning, schedule, studentCourse }}>
    <MobileChromeProvider>
      <MobileTopNavbar title={courseTitle} backHref={getStudentMobileBackHref(pathname)} />
      <main>{page}</main>
    </MobileChromeProvider>
  </NextIntlClientProvider>;
}

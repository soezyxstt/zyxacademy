import {
  buildCourseMobileTabs, getActiveCourseIdFromPathname, getActiveStudentBottomTab, getStudentMobileBackHref,
  getStudentMobileRouteTitle, isCourseTabActive, isStudentRootHub, resolveCourseSwitchHref, studentMobileHrefs,
  type StudentCourseSummary,
} from "../../../components/navigation/student/student-nav-model";
import { PKA_COURSE_ID } from "../../../lib/pka-config";
import en from "../../../messages/en/student.json";
import id from "../../../messages/id/student.json";

const messages = { en, id };
const readerOrTool = new Set([
  "/courses/[id]/material/[materialId]", "/courses/tutorial-pka/material/[materialId]",
  "/courses/[id]/solutions/[collectionId]", "/courses/[id]/playground",
  "/courses/[id]/live", "/courses/[id]/live/host",
]);

export function studentNavigation(href: string, pattern: string, locale: keyof typeof messages) {
  const url = new URL(href, "https://zyx.invalid");
  const { pathname } = url;
  const { mobile, navigation, routeTitles } = messages[locale];
  const active = getActiveStudentBottomTab(pathname);
  const translatedTitle = getStudentMobileRouteTitle(pathname, key => routeTitles[key.split(".")[1] as keyof typeof routeTitles]);
  const title = active === "discuss" ? (locale === "en" ? "Discussion" : mobile.discuss)
    : pathname === "/achievements" ? navigation.achievements
    : pathname === "/pet" ? "Pet"
    : translatedTitle ?? routeTitles.dashboard;
  return {
    active, title, labels: mobile, targets: studentMobileHrefs,
    homeLabel: `${navigation.dashboard} Zyx`,
    backTo: isStudentRootHub(pathname) ? null : getStudentMobileBackHref(pathname),
    hideBottom: readerOrTool.has(pattern) || (active === "discuss" && Boolean(url.searchParams.getAll("thread").at(-1))),
  };
}

export function studentCourseId(pathname: string) {
  const segment = getActiveCourseIdFromPathname(pathname);
  if (!segment || segment === PKA_COURSE_ID) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

export function studentCourseTabs(href: string, courseId: string, locale: keyof typeof messages, showLive: boolean) {
  const { navigation, mobile } = messages[locale];
  const id = encodeURIComponent(courseId);
  const tabs = buildCourseMobileTabs({
    courseId: id, isPka: false, showLive,
    labels: {
      ...navigation, playground: "Playground", studyPath: mobile.studyPathShort,
      examResults: mobile.examResultsShort, live: mobile.liveShort, diagnosticReport: mobile.diagnosticShort,
    },
  });
  return { tabs, activeId: tabs.find(tab => isCourseTabActive(tab, href, id))?.id ?? null };
}

export function studentCourseSwitchTarget(href: string, currentId: string, targetId: string) {
  if (currentId === targetId) return null;
  return resolveCourseSwitchHref(href, encodeURIComponent(currentId), encodeURIComponent(targetId));
}

export function studentCourseChoices(active: StudentCourseSummary, enrolled: readonly StudentCourseSummary[]) {
  const matches = new Map(enrolled.map(course => [course.id, course]));
  if (!matches.has(active.id)) return [active, ...matches.values()];
  return [...matches.values()].map(course => course.id === active.id ? active : course);
}

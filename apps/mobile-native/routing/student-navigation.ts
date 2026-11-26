import {
  getActiveStudentBottomTab, getStudentMobileBackHref, getStudentMobileRouteTitle, isStudentRootHub, studentMobileHrefs,
} from "../../../components/navigation/student/student-nav-model";
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

import {
  ADMIN_MORE_CATEGORIES, adminMobileHrefs, getActiveAdminBottomTab, getAdminDetailTitleKey,
  getAdminMobileBackHref, isAdminFocusEditorRoute, isAdminRootHub, isAdminSubTabActive,
} from "../../../components/navigation/admin/admin-nav-model";
import {
  findAssignedTutorCourse, getActiveTutorBottomTab, getActiveTutorCourseIdFromPathname, getTutorDetailRouteTitleKey,
  getTutorMobileBackHref, isTutorQuizFormOrDetailRoute, isTutorRootHub, resolveTutorCourseSwitchHref,
  tutorMobileHrefs, type TutorCourseSummary,
} from "../../../components/navigation/tutor/tutor-nav-model";
import { getRouteTitle } from "../../../components/navigation/route-title-model";
import enAdmin from "../../../messages/en/admin.json";
import idAdmin from "../../../messages/id/admin.json";
import enTutor from "../../../messages/en/tutor.json";
import idTutor from "../../../messages/id/tutor.json";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { isPersonalAccountRoute } from "../../../packages/student-community/account-access";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "../auth/login-intent";

type Scope = Pick<NativeAccountContext, "locale" | "roles">;
type Role = "admin" | "tutor";
const labels = {
  en: { admin: enAdmin, tutor: enTutor },
  id: { admin: idAdmin, tutor: idTutor },
};

function message(catalog: unknown, key: string) {
  let value = catalog;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string" ? value : undefined;
}

function pathnameOf(href: string) {
  return href.split(/[?#]/, 1)[0];
}

const adminFocusRoutes = [
  /^\/admin\/quizzes\/(?:new|[^/]+\/edit)$/,
  /^\/admin\/materials\/(?:manual|review\/(?:idea|product)\/[^/]+)$/,
];
const tutorQuizEditor = /^\/tutor\/[^/]+\/quizzes\/(?:new|[^/]+\/edit)$/;

export function staffNavigation(role: Role, href: string, locale: Scope["locale"]) {
  const pathname = pathnameOf(href);
  const catalog = labels[locale];
  const accountTitles: Record<string, readonly [string, string]> = {
    "/profile": ["Profil", "Profile"],
    "/profile/edit": ["Edit profil", "Edit profile"],
    "/settings": ["Pengaturan", "Settings"],
    "/settings/notifications": ["Preferensi notifikasi", "Notification preferences"],
    "/settings/notifications/browser": ["Notifikasi browser", "Browser notifications"],
  };
  const personalAccount = isPersonalAccountRoute(pathname);
  const fallbackTitle = personalAccount ? accountTitles[pathname][locale === "id" ? 0 : 1]
    : getRouteTitle(pathname, role, key => message(catalog, key));
  const accountBack = pathname === "/settings/notifications/browser" ? "/settings/notifications"
    : pathname === "/settings/notifications" ? "/settings" : pathname === "/profile/edit" ? "/profile" : `/${role}`;
  const closeLabel = locale === "id" ? "Tutup" : "Close";
  if (role === "admin") {
    const detail = getAdminDetailTitleKey(pathname);
    const editor = adminFocusRoutes.some(pattern => pattern.test(pathname));
    return {
      role, labels: catalog.admin.mobile, closeLabel, targets: adminMobileHrefs,
      active: getActiveAdminBottomTab(pathname),
      title: detail ? catalog.admin.mobile.detailTitles[detail] : fallbackTitle,
      homeLabel: catalog.admin.navigation.dashboard,
      backTo: personalAccount ? accountBack : /^\/admin\/quizzes\//.test(pathname) ? "/admin/quizzes"
        : pathname.startsWith("/admin/materials/review/") ? "/admin/materials/review"
        : pathname === "/admin/materials/manual" ? "/admin/materials"
        : isAdminRootHub(pathname) ? null : getAdminMobileBackHref(pathname),
      hideBottom: editor || isAdminFocusEditorRoute(pathname),
    } as const;
  }
  const detail = getTutorDetailRouteTitleKey(pathname);
  const backTo = getTutorMobileBackHref(pathname);
  return {
    role, labels: catalog.tutor.mobile, closeLabel, targets: tutorMobileHrefs,
    active: getActiveTutorBottomTab(pathname),
    title: detail ? catalog.tutor.routeTitles[detail] : fallbackTitle,
    homeLabel: catalog.tutor.routeTitles.dashboardTitle,
    backTo: personalAccount ? accountBack : isTutorRootHub(pathname) ? null : backTo === pathname ? tutorMobileHrefs.home : backTo,
    hideBottom: isTutorQuizFormOrDetailRoute(pathname) && tutorQuizEditor.test(pathname),
  } as const;
}

type StaffShortcut = { id: string; href: string; label: string; selected: boolean };

export function adminMoreSections(href: string, scope: Scope, sitemap: NativeRouteNode | null) {
  if (!scope.roles.includes("admin")) return [];
  const pathname = pathnameOf(href);
  const catalog = labels[scope.locale];
  const groups = ADMIN_MORE_CATEGORIES.flatMap(category => {
    const items: StaffShortcut[] = [...category.items, ...(category.archivedItems ?? [])].flatMap(item => {
      const target = resolveNativeProtectedDestination(item.href, scope, sitemap);
      const namespace = item.labelSource === "nav" ? catalog.admin.navigation : item.labelSource === "mobile" ? catalog.admin.mobile
        : item.labelSource === "discussion" ? catalog.tutor.schedule : catalog.admin.routeTitles;
      const label = message(namespace, item.labelKey);
      return target && label ? [{ id: item.id, href: target.href, label, selected: isAdminSubTabActive(item, pathname) }] : [];
    });
    return items.length ? [{ id: category.id, title: catalog.admin.mobile[category.titleKey], items }] : [];
  });
  return groups;
}

export function adminOtherRoleEntries(scope: Scope, sitemap: NativeRouteNode | null) {
  if (!scope.roles.includes("admin")) return [];
  const { studentView, tutorView } = labels[scope.locale].admin.mobile;
  return [{ href: "/dashboard", label: studentView }, { href: "/tutor", label: tutorView }]
    .filter(item => Boolean(resolveNativeProtectedDestination(item.href, scope, sitemap)));
}

export function tutorClassEntries(
  href: string, courses: readonly TutorCourseSummary[], scope: Scope, sitemap: NativeRouteNode | null,
) {
  if (!scope.roles.includes("tutor")) return [];
  const currentId = getActiveTutorCourseIdFromPathname(href);
  const active = findAssignedTutorCourse(courses, currentId && decodeURIComponent(currentId));
  const unique = new Map(courses.filter(row => row.courseId && row.title).map(row => [row.courseId, row]));
  return [...unique.values()].flatMap(course => {
    const encoded = encodeURIComponent(course.courseId);
    const root = `/tutor/${encoded}`;
    const preferred = unique.size === 1 ? root : resolveTutorCourseSwitchHref(href, currentId, encoded);
    const target = resolveNativeProtectedDestination(preferred, scope, sitemap)
      ?? resolveNativeProtectedDestination(root, scope, sitemap);
    return target ? [{ id: course.courseId, href: target.href, label: course.title, selected: active?.courseId === course.courseId }] : [];
  });
}

export function tutorClassCopy(locale: Scope["locale"]) {
  const { mobile, navigation } = labels[locale].tutor;
  return {
    title: mobile.switchCourse,
    empty: navigation.noCourses,
    loading: locale === "id" ? "Memuat kelas…" : "Loading classes…",
    failed: locale === "id" ? "Kelas belum dapat dimuat." : "Could not load classes.",
    retry: locale === "id" ? "Coba lagi" : "Try again",
  };
}

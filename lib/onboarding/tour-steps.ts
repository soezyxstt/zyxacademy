import type { TourRole } from "./tour-state";

export type TourStep = {
  id: string;
  /** Prepare a known safe surface; the user still activates the actual control. */
  path?: string;
  selector: string;
  href?: string;
  reveal?: { selector: string; copy: "more" | "viewMenu" | "accountMenu" | "zyraMenu" | "searchMenu" | "slotMenu" | "profileMenu" | "homeMenu" | "generalMenu" }[];
};

const anchor = (id: string) => `[data-tour="${id}"]`;
const link = (href: string) => `a[href="${href}"]`;
const navigationLink = (href: string) => `nav ${link(href)}`;
const more = { selector: '[data-slot="tabs-more-trigger"]', copy: "more" as const };
const accountReveal = { selector: anchor("account"), copy: "accountMenu" as const };

/** All URLs are internal and course IDs are encoded as a single path segment. */
export function getTourSteps(role: TourRole, courseId: string | null, mobile: boolean): TourStep[] {
  const root = role === "tutor" ? "/tutor" : "/dashboard";
  const profileReveal = { selector: link("/profile"), copy: "profileMenu" as const };
  const account: TourStep = { id: "account", selector: anchor("account"), reveal: role === "student" && mobile ? [profileReveal] : undefined };
  const preferences: TourStep = { id: "preferences", selector: link("/settings"), href: "/settings", reveal: [accountReveal, ...(role === "student" && mobile ? [profileReveal] : [])] };
  const notifications: TourStep = { id: "notifications", path: "/settings/notifications", selector: anchor("notification-permission") };
  if (role === "student") {
    if (courseId) {
      const course = `/courses/${encodeURIComponent(courseId)}`;
      return [
        { id: "documents", path: course, selector: link(`${course}/material`), href: `${course}/material`, reveal: [more] },
        { id: "quiz", path: `${course}/material`, selector: link(`${course}/quiz`), href: `${course}/quiz`, reveal: [more] },
        { id: "flashcards", path: `${course}/quiz`, selector: link(`${course}/flashcard`), href: `${course}/flashcard`, reveal: [more] },
        { id: "zyra", path: `${course}/flashcard`, selector: anchor("zyra") },
        { id: "zyraClose", path: `${course}/flashcard`, selector: anchor("zyra-close"), reveal: [{ selector: anchor("zyra"), copy: "zyraMenu" }] },
        { id: "schedule", selector: navigationLink("/dashboard/schedule"), href: "/dashboard/schedule", reveal: [{ selector: link(root), copy: "homeMenu" }] },
        { id: "discussions", path: "/dashboard/schedule", selector: navigationLink("/dashboard/discussions"), href: "/dashboard/discussions" },
        account,
        preferences,
        notifications,
      ];
    }
    return [
      { id: "courses", path: root, selector: navigationLink("/courses"), href: "/courses" },
      { id: "schedule", path: "/courses", selector: navigationLink("/dashboard/schedule"), href: "/dashboard/schedule" },
      { id: "nextWeek", path: "/dashboard/schedule", selector: anchor("schedule-next") },
      { id: "discussions", path: "/dashboard/schedule", selector: navigationLink("/dashboard/discussions"), href: "/dashboard/discussions" },
      { id: "search", path: "/dashboard/discussions", selector: anchor("search"), reveal: [{ selector: anchor("search-page"), copy: "searchMenu" }] },
      { id: "searchClose", path: "/dashboard/discussions", selector: anchor("search-close"), reveal: [{ selector: anchor("search"), copy: "searchMenu" }, { selector: anchor("search-page"), copy: "searchMenu" }] },
      account,
      preferences,
      { id: "language", path: "/settings", selector: anchor("language"), reveal: [{ selector: anchor("settings-general"), copy: "generalMenu" }, more] },
      notifications,
    ];
  }

  const schedule = "/tutor/schedule";
  const scheduleChoice = (id: "sessions" | "tickets"): TourStep => ({
    id,
    path: schedule,
    selector: anchor(`tutor-${id}`),
    reveal: [{ selector: anchor("tutor-schedule-view"), copy: "viewMenu" }, more],
  });
  if (courseId) {
    const course = `/tutor/${encodeURIComponent(courseId)}`;
    return [
      { id: "course", path: root, selector: `#main-content ${link(course)}`, href: course },
      { id: "documents", path: course, selector: link(`${course}/materials`), href: `${course}/materials`, reveal: [more] },
      { id: "quizzes", path: `${course}/materials`, selector: link(`${course}/quizzes`), href: `${course}/quizzes`, reveal: [more] },
      { id: "grading", path: `${course}/quizzes`, selector: link(`${course}/quizzes/grading`), href: `${course}/quizzes/grading`, reveal: [more] },
      { id: "schedule", selector: navigationLink(schedule), href: schedule, reveal: [{ selector: link(root), copy: "homeMenu" }] },
      scheduleChoice("tickets"),
      { id: "discussions", path: schedule, selector: navigationLink("/tutor/discussions"), href: "/tutor/discussions" },
      account,
      preferences,
      notifications,
    ];
  }
  return [
    { id: "schedule", path: root, selector: navigationLink(schedule), href: schedule },
    { id: "addSlot", path: schedule, selector: anchor("tutor-add-slot") },
    { id: "cancelSlot", path: schedule, selector: anchor("tutor-cancel-slot"), reveal: [{ selector: anchor("tutor-add-slot"), copy: "slotMenu" }] },
    scheduleChoice("sessions"),
    scheduleChoice("tickets"),
    { id: "discussions", path: schedule, selector: navigationLink("/tutor/discussions"), href: "/tutor/discussions" },
    { id: "docs", path: "/tutor/docs", selector: link("/tutor/docs/ruang-kerja-tutor"), href: "/tutor/docs/ruang-kerja-tutor" },
    account,
    preferences,
    notifications,
  ];
}

export function findVisibleTourTarget(selector: string, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const box = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" &&
      !element.closest('[hidden], [aria-hidden="true"]') && !element.matches(':disabled, [aria-disabled="true"]')) return element;
  }
  return null;
}

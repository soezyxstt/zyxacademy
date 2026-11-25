export { StudentMobileTopNav } from "./student-mobile-top-nav";
export { StudentMobileBottomNav } from "./student-mobile-bottom-nav";
export {
  CourseMobileTabNav,
  type CourseMobileTabNavProps,
} from "./course-mobile-tab-nav";
export {
  StudentMobileCourseSheet,
  type StudentMobileCourseSheetProps,
} from "./student-mobile-course-sheet";
export {
  buildCourseMobileTabs,
  getActiveCourseIdFromPathname,
  getActiveStudentBottomTab,
  getStudentMobileBackHref,
  isCourseTabActive,
  isStudentRootHub,
  resolveCourseSwitchHref,
  type CourseMobileTabDescriptor,
  type CourseMobileTabLabels,
  type StudentBottomNavTabId,
  type StudentCourseSummary,
} from "./student-nav-model";

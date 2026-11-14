export function studentScheduleRedirect(isAdmin: boolean, isTutor: boolean, hasCourse: boolean) {
  if (isAdmin) return hasCourse ? null : "/admin/schedules";
  if (isTutor) return "/tutor/schedule";
  return null;
}

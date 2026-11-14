import { expect, test } from "bun:test";
import { studentScheduleRedirect } from "../../lib/schedule/student-schedule-redirect";

test("course context keeps an admin in the student schedule while other role redirects remain", () => {
  expect(studentScheduleRedirect(true, false, true)).toBeNull();
  expect(studentScheduleRedirect(true, true, true)).toBeNull();
  expect(studentScheduleRedirect(true, false, false)).toBe("/admin/schedules");
  expect(studentScheduleRedirect(false, true, true)).toBe("/tutor/schedule");
  expect(studentScheduleRedirect(false, false, false)).toBeNull();
});

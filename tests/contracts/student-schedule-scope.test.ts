import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { scopeStudentSchedule } from "../../lib/schedule/student-schedule-scope";
import { matchesScheduleCourse } from "../../lib/schedule/course-filter";

const data = {
  user: { id: "current-account", role: "admin" },
  availableSlots: [
    { id: "a-slot", tutor: { tutorCourses: [{ courseId: "legacy-a" }] } },
    { id: "canonical-slot", matchedCourseIds: ["a", "legacy-a"], tutor: { tutorCourses: [] } },
    { id: "revoked-slot", matchedCourseIds: [], tutor: { tutorCourses: [{ courseId: "legacy-a" }] } },
    { id: "b-slot", tutor: { tutorCourses: [{ course: { id: "b" } }] } },
  ],
  groupBookings: [{ id: "a-booking", courseId: "a" }, { id: "b-booking", courseId: "b" }],
  academicSchedules: [{ id: "a-exam", courseId: "legacy-a" }, { id: "b-exam", courseId: "b" }, { id: "global", courseId: null }],
  enrollments: [{ course: { id: "a" } }, { course: { id: "b" } }],
  groups: [{ id: "mixed", courses: [{ courseId: "legacy-a" }, { course: { id: "b" } }] }, { id: "b-only", courses: [{ courseId: "b" }] }],
};

test("Student calendar keeps the global student payload regardless of the account's admin role", () => {
  expect(scopeStudentSchedule(data, [])).toBe(data);
  const page = readFileSync("app/(student)/dashboard/schedule/page.tsx", "utf8");
  const actions = readFileSync("app/(student)/dashboard/schedule/actions.ts", "utf8");
  expect(page).not.toContain("/admin/schedules");
  expect(page).not.toContain("/tutor/schedule");
  expect(page).toContain("selectedCourse.allIds");
  expect(actions).not.toContain("FORBIDDEN_STUDENT_SCHEDULE");
});

test("selecting a course keeps events under its compatible ID and excludes other courses", () => {
  expect(matchesScheduleCourse("legacy-a", "a", ["a", "legacy-a"])).toBe(true);
  expect(matchesScheduleCourse("a", "legacy-a", ["a", "legacy-a"])).toBe(true);
  expect(matchesScheduleCourse("b", "a", ["a", "legacy-a"])).toBe(false);
  expect(matchesScheduleCourse("legacy-a", "a")).toBe(false);
  expect(matchesScheduleCourse(null, "a", ["a", "legacy-a"])).toBe(false);
});

test("course calendar excludes other courses and global events while accepting canonical and legacy IDs", () => {
  const scoped = scopeStudentSchedule(data, ["a", "legacy-a"]);
  expect(scoped.availableSlots?.map(row => row.id)).toEqual(["a-slot", "canonical-slot"]);
  expect(scoped.groupBookings?.map(row => row.id)).toEqual(["a-booking"]);
  expect(scoped.academicSchedules?.map(row => row.id)).toEqual(["a-exam"]);
  expect(scoped.enrollments).toEqual([{ course: { id: "a" } }]);
  expect(scoped.groups).toEqual([{ id: "mixed", courses: [{ courseId: "legacy-a" }] }]);
  expect(scoped.user).toBe(data.user);
  expect(data.groupBookings).toHaveLength(2);
  expect(data.groups[0].courses).toHaveLength(2);
  expect(scopeStudentSchedule(data, ["b"]).groupBookings?.map(row => row.id)).toEqual(["b-booking"]);
});

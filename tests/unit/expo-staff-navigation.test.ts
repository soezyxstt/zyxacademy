import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { adminMoreSections, adminOtherRoleEntries, staffNavigation, tutorClassEntries } from "../../apps/mobile-native/routing/staff-navigation";

function sitemap(...paths: string[]): NativeRouteNode {
  return {
    href: "/", contextKey: "./_layout.tsx", isGenerated: false, isInternal: false,
    children: paths.map(href => ({ href, contextKey: `.${href}.tsx`, isGenerated: false, isInternal: false, children: [] })),
  };
}

const admin = { locale: "en", roles: ["admin"] } as const;
const tutor = { locale: "id", roles: ["tutor"] } as const;
const mounted = readFileSync("plans/native-parallel/routes.tsv", "utf8").trim().split("\n").slice(1)
  .map(row => "/" + row.split("\t")[1].split("/").slice(1, -1).filter(segment => !segment.startsWith("(")).join("/"));

test("Admin and Tutor reuse the mobile role labels and the mounted home, course, people, ops and discussion destinations", () => {
  const adminNav = staffNavigation("admin", "/admin/ops/web-analytics?period=30", "en");
  expect(adminNav).toMatchObject({ role: "admin", active: "ops", title: "Web analytics", labels: { bottomNavLabel: "Admin navigation" } });
  expect(adminNav.targets).toEqual({ home: "/admin", courses: "/admin/courses", people: "/admin/users", ops: "/admin/ops/web-analytics" });
  const tutorNav = staffNavigation("tutor", "/tutor/discussions?thread=open", "id");
  expect(tutorNav).toMatchObject({ role: "tutor", active: "discuss", title: "Diskusi", backTo: null });
  expect(tutorNav.targets).toEqual({ home: "/tutor", schedule: "/tutor/schedule", discuss: "/tutor/discussions" });
  for (const path of [...Object.values(adminNav.targets), ...Object.values(tutorNav.targets)]) {
    expect(mounted).toContain(path);
  }
});

test("staff editors hide bottom navigation and preserve localized titles and safe fallback back targets", () => {
  expect(staffNavigation("admin", "/admin/courses/physics/quizzes/quiz/edit", "en"))
    .toMatchObject({ active: "courses", title: "Edit quiz", hideBottom: true, backTo: "/admin/courses/physics/quizzes" });
  expect(staffNavigation("admin", "/admin/quizzes/new", "id"))
    .toMatchObject({ hideBottom: true, backTo: "/admin/quizzes" });
  expect(staffNavigation("admin", "/admin/forms/intake", "en"))
    .toMatchObject({ hideBottom: false, backTo: "/admin/forms" });
  expect(staffNavigation("tutor", "/tutor/physics/quizzes/new?draft=1", "id"))
    .toMatchObject({ active: "classes", title: "Buat kuis baru", hideBottom: true, backTo: "/tutor/physics/quizzes" });
  expect(staffNavigation("tutor", "/tutor/physics/quizzes/template/attempts", "en"))
    .toMatchObject({ title: "Student attempts", hideBottom: false });
  expect(staffNavigation("tutor", "/tutor/physics", "en").backTo).toBe("/tutor");
});

test("Admin More exposes only mounted modules of the caller's role and gates role switching", () => {
  const discovered = sitemap("/admin/discussions", "/admin/users", "/admin/blog", "/tutor", "/dashboard");
  const options = adminMoreSections("/admin/blog/new", admin, discovered).flatMap(group => group.items);
  expect(options).toMatchObject([
    { href: "/admin/discussions", label: "Discussion", selected: false },
    { href: "/admin/blog", selected: true },
  ]);
  expect(adminMoreSections("/admin/blog", tutor, discovered)).toEqual([]);
  expect(adminOtherRoleEntries(admin, discovered)).toEqual([]);
  expect(adminOtherRoleEntries({ ...admin, roles: ["admin", "tutor"] }, discovered))
    .toEqual([{ href: "/tutor", label: "Tutor" }]);
  expect(adminOtherRoleEntries({ ...admin, roles: ["admin", "murid"] }, sitemap("/tutor"))).toEqual([]);
});

test("Tutor Classes offers only assigned courses and preserves compatible sections when switching", () => {
  const courses = [
    { courseId: "new-physics", legacyCourseId: "physics", title: "Physics" },
    { courseId: "algebra", title: "Algebra" },
  ];
  const discovered = sitemap("/tutor/[courseId]", "/tutor/[courseId]/quizzes/grading");
  expect(tutorClassEntries("/tutor/physics/quizzes/grading?attemptId=old", courses, tutor, discovered)).toEqual([
    { id: "new-physics", href: "/tutor/new-physics/quizzes/grading", label: "Physics", selected: true },
    { id: "algebra", href: "/tutor/algebra/quizzes/grading", label: "Algebra", selected: false },
  ]);
  expect(tutorClassEntries("/tutor/physics/quizzes/grading", courses.slice(0, 1), tutor, discovered)[0]?.href).toBe("/tutor/new-physics");
  expect(tutorClassEntries("/tutor", courses, admin, discovered)).toEqual([]);
  expect(tutorClassEntries("/tutor", [{ courseId: "../admin", title: "Invalid" }], tutor, discovered)).toEqual([]);
});

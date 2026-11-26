import assert from "node:assert/strict";
import { fixtureCookie } from "./cookie.mjs";

const origin = "http://127.0.0.1:3314";
const assigned = "academic-course-1";
const unassigned = "academic-course-3";
let checks = 0;

async function read(role, path, expected = 200) {
  const response = await fetch(origin + "/api/native/" + path, {
    headers: role ? { cookie: fixtureCookie(role) } : {}, redirect: "manual",
  });
  assert.equal(response.status, expected, `${role ?? "anonymous"} ${path}`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const data = await response.json();
  checks++;
  console.log(role ?? "anonymous", path, response.status);
  return data;
}

const dashboard = "academic/tutor/dashboard";
await read(null, dashboard, 401);
await read("student", dashboard, 403);
await read("admin", dashboard, 403);
const home = await read("tutor", dashboard);
assert.deepEqual(home.courses.map(course => course.courseId).sort(), [assigned, "academic-course-2"]);

const tutorCourse = (id, section) => `academic/tutor/courses/${id}/${section}`;
const roster = await read("tutor", tutorCourse(assigned, "participants"));
assert.equal(roster.participants[0].name, "Nadia Lestari");
assert.deepEqual((await read("tutor", tutorCourse("academic-course-2", "participants"))).participants, []);
for (const section of ["participants", "analytics", "grading"]) {
  await read("tutor", tutorCourse(unassigned, section), 403);
}
await read("tutor", tutorCourse(assigned, "analytics"));
await read("tutor", tutorCourse(assigned, "grading"));

const catalog = "academic/admin/courses";
assert.equal((await read("admin", catalog)).length, 3);
assert.equal((await read("admin", catalog + "/biologi-dasar")).course.id, assigned);
await read("admin", catalog + "/missing", 404);
await read("tutor", catalog, 403);
await read("student", catalog, 403);
for (const section of ["analytics", "results", "documents", "review", "questions", "settings", "videos", "flashcards", "leaderboard"]) {
  await read("admin", catalog + "/biologi-dasar/" + section);
}

const tutorSupport = "academic/tutor-support/";
for (const section of ["schedule", "discussions"]) await read("tutor", tutorSupport + section);
for (const section of ["materials", "videos", "live", "discussions"]) {
  await read("tutor", tutorSupport + `courses/${assigned}/${section}`);
  await read("tutor", tutorSupport + `courses/${unassigned}/${section}`, 403);
}
for (const section of ["users", "groups", "tokens", "notifications", "schedules", "registrations", "announcements", "sessions"]) {
  await read("admin", "academic-administration/" + section);
}
await read("tutor", "academic-administration/users", 403);
await read("student", "academic-administration/tokens", 403);
for (const section of ["quizzes", "grading"]) {
  await read("tutor", `academic-assessment/tutor/${assigned}/${section}`);
  await read("tutor", `academic-assessment/tutor/${unassigned}/${section}`, 403);
}
await read("admin", "academic-assessment/admin/biologi-dasar/quizzes");
await read("admin", "academic-assessment/admin/biologi-dasar/tryouts");
await read("student", `academic-assessment/tutor/${assigned}/grading`, 403);
console.log(`${checks} HTTP checks passed`);

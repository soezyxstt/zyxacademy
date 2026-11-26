import assert from "node:assert/strict";
import test from "node:test";
import { biologyCourse, courseFixtures, physicsCourse } from "./fixtures";
import { createAdminCourseFixtureStore, type CourseFixtureStore } from "./fixture-store";
import { adminCoursePath, filterAdminCourses, resolveAdminCourseAlias, summarizeCourseAttempts } from "./model";

test("combines search and category without replacing the list filter on detail lookup", () => {
  const courses = courseFixtures.map(({ course }) => course);
  const filter = { search: "  biOLOGi ", category: "Biologi" };
  const result = () => filterAdminCourses(courses, filter.search, filter.category).map((course) => course.slug);
  assert.deepEqual(result(), [biologyCourse.slug]);
  assert.equal(adminCoursePath(result()[0]), "/admin/courses/biologi-dasar");
  assert.deepEqual(result(), [biologyCourse.slug]);
  assert.deepEqual(filterAdminCourses(courses, "pewarisan", "Biologi").map((course) => course.id), [biologyCourse.id]);
  assert.deepEqual(filterAdminCourses(courses, physicsCourse.id, "Biologi"), []);
});

test("course URLs distinguish slug from identifiers and honor web aliases", () => {
  assert.equal(resolveAdminCourseAlias(biologyCourse.slug, "analytics"), "/admin/courses/biologi-dasar/results");
  assert.equal(resolveAdminCourseAlias(biologyCourse.slug, "materials"), "/admin/courses/biologi-dasar/documents");
  assert.equal(resolveAdminCourseAlias(biologyCourse.slug, "missing"), null);
  assert.equal(resolveAdminCourseAlias(biologyCourse.slug, "__proto__"), null);
  assert.equal(adminCoursePath("with spaces", "documents", "document/id"), "/admin/courses/with%20spaces/documents/document%2Fid");
});

test("course fixture preserves a failed command across retry and commits it once", () => {
  const store = createAdminCourseFixtureStore("error");
  const source = store.getSnapshot()[0];
  const changes: string[] = [];
  const unsubscribe = store.subscribe(() => changes.push(store.getSnapshot()[0].course.title));
  const command: Parameters<CourseFixtureStore["mutate"]>[0] = {
    requestId: store.nextId(), role: "admin", slug: biologyCourse.slug, operation: "update", revision: source.revision,
    apply: (current) => current ? { ...current, course: { ...current.course, title: "Biologi Molekuler" } } : undefined,
  };
  assert.deepEqual(store.mutate({ ...command, role: "tutor" }), { status: "denied" });
  assert.deepEqual(store.mutate({ ...command, apply: () => "Judul wajib diisi." }), { status: "validation", message: "Judul wajib diisi." });
  assert.deepEqual(store.mutate(command), { status: "retry" });
  assert.equal(store.getSnapshot()[0], source);
  assert.deepEqual(changes, []);
  assert.deepEqual(store.mutate(command), { status: "saved" });
  assert.deepEqual(store.mutate(command), { status: "saved" });
  assert.deepEqual(changes, ["Biologi Molekuler"]);
  assert.equal(store.getSnapshot()[0].revision, source.revision + 1);
  assert.deepEqual(store.mutate({ ...command, requestId: store.nextId() }), { status: "conflict", revision: source.revision + 1 });
  assert.equal(createAdminCourseFixtureStore("populated").getSnapshot()[0].course.title, biologyCourse.title);
  unsubscribe();
});

test("simulated demo selection is unique and archived courses stay absent", () => {
  const store = createAdminCourseFixtureStore("populated");
  const [biology, physics] = store.getSnapshot();
  for (const data of [biology, physics]) {
    const result = store.mutate({
      requestId: store.nextId(), role: "admin", operation: "update", slug: data.course.slug, revision: data.revision,
      apply: (current) => current ? { ...current, isDemo: true } : undefined,
    });
    assert.deepEqual(result, { status: "saved" });
  }
  assert.deepEqual(store.getSnapshot().filter((entry) => entry.isDemo).map((entry) => entry.course.slug), [physics.course.slug]);
  assert.deepEqual(store.mutate({
    requestId: store.nextId(), role: "admin", operation: "delete", slug: physics.course.slug, revision: physics.revision + 1,
    apply: () => undefined,
  }), { status: "saved" });
  assert.equal(store.getSnapshot().some((entry) => entry.course.id === physics.course.id), false);
});

test("quiz statistics count zero scores and exclude unfinished attempts from scores", () => {
  assert.deepEqual(summarizeCourseAttempts(courseFixtures[0].attempts), {
    started: 4, completed: 3, completion: 75, average: 50, passRate: 33, duration: 336,
  });
  assert.deepEqual(summarizeCourseAttempts([{ score: 65, duration: 10 }]), {
    started: 1, completed: 1, completion: 100, average: 65, passRate: 0, duration: 10,
  });
  assert.deepEqual(summarizeCourseAttempts([]), {
    started: 0, completed: 0, completion: 0, average: 0, passRate: 0, duration: 0,
  });
});

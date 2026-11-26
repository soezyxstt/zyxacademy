import assert from "node:assert/strict";
import { createCourseFixtureRequest } from "../../../../packages/native-parity/student/courses/fixtures";

// Mirrors app/visual-fixtures/course-catalog/catalog-fixture.tsx. Fail closed
// if the native fixture drifts before computing a pixel comparison.
const result = await createCourseFixtureRequest("catalog-parity")("/api/native/student/courses?view=catalog");
assert.equal(result.status, 200);
const actual = await result.json();
const premium = { category: "premium", startsAt: null, endsAt: null };
const defaults = { description: "", materialsCount: 0, quizzesCount: 0, tryoutsCount: 0, pricing: premium };
const expected = [
  { ...defaults, id: "bk1101", title: "Berpikir Komputasi", category: "TPB", hasFullContentAccess: true },
  { ...defaults, id: "fi1101", title: "Fisika Dasar I", category: "TPB", materialsCount: 1, hasFullContentAccess: false },
  { ...defaults, id: "ma1101", title: "Matematika I", category: "TPB", materialsCount: 6, quizzesCount: 2, hasFullContentAccess: true },
  { ...defaults, id: "ma1102", title: "Matematika Lanjut untuk Sains dan Rekayasa", category: "TPB", tryoutsCount: 1, hasFullContentAccess: true,
    pricing: { category: "limited_time_free", startsAt: "2030-01-01T00:00:00.000Z", endsAt: "2030-01-03T00:00:00.000Z" } },
  { ...defaults, id: "tutorial-pka", title: "Tutorial PKA", category: "PKA", hasFullContentAccess: false },
];
const normalize = (course: Record<string, any>) => ({
  id: course.id, title: course.title, category: course.category, description: course.description,
  materialsCount: course.materialsCount, quizzesCount: course.quizzesCount, tryoutsCount: course.tryoutsCount,
  hasFullContentAccess: course.hasFullContentAccess,
  pricing: { category: course.pricing?.category,
    startsAt: course.pricing?.startsAt == null ? null : new Date(course.pricing.startsAt).toISOString(),
    endsAt: course.pricing?.endsAt == null ? null : new Date(course.pricing.endsAt).toISOString() },
});
assert.equal(actual.targetCategory, null);
assert.equal(new Date(actual.asOf).toISOString(), "2030-01-02T00:00:00.000Z");
assert.deepEqual(actual.courses.map(normalize), expected);
console.log("Catalog source data, pricing, scope and reference instant match.");

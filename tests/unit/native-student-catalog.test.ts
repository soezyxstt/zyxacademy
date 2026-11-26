import { expect, test } from "bun:test";
import { catalogCopy, getCatalogGroups, getCatalogOffer, getCatalogOfferWindow, getCatalogRow, nextCatalogOfferChange } from "../../apps/mobile-native/features/student/courses/catalog-model";
import { matchStudentRoute, studentPathWithQuery } from "../../apps/mobile-native/features/student/routes";
import { learningEndpoint, type CatalogData, type CourseData } from "../../packages/native-parity/student/courses/contract";
import { createCourseFixtureRequest } from "../../packages/native-parity/student/courses/fixtures";

async function catalogFixture() {
  const request = createCourseFixtureRequest("catalog-parity");
  const response = await request(learningEndpoint({ view: "catalog" }));
  expect(response.status).toBe(200);
  return { request, data: await response.json() as CatalogData };
}

test("catalog uses the same groups and addressable tabs as the web fixture", async () => {
  const { data } = await catalogFixture();
  const all = getCatalogGroups(data.courses, {});
  expect(all.active).toBe("all");
  expect(all.visible.map(group => [group.id, group.courses.length])).toEqual([["tpb", 4], ["pka", 1]]);
  expect(getCatalogGroups(data.courses, { jurusan: "tpb" }).visible.map(group => group.id)).toEqual(["tpb"]);
  expect(getCatalogGroups(data.courses, { jurusan: "pka" }).visible.map(group => group.courses[0].id)).toEqual(["tutorial-pka"]);
  expect(getCatalogGroups(data.courses, { category: "TPB", q: "lanjut" }).visible[0].courses.map(course => course.id)).toEqual(["ma1102"]);
  expect(getCatalogGroups(data.courses, { jurusan: "pka", q: "lanjut" }).visible).toEqual([]);
});

test("clearing a legacy catalog search keeps the selected major and other link parameters", async () => {
  const { data } = await catalogFixture();
  const path = "/courses?jurusan=tpb&source=first&source=second&q=no-match#catalog";
  const route = matchStudentRoute(path)!;
  expect(getCatalogGroups(data.courses, route.query).visible).toEqual([]);
  const cleared = studentPathWithQuery(route.path, { q: undefined });
  expect(cleared).toBe("/courses?jurusan=tpb&source=first&source=second#catalog");
  expect(getCatalogGroups(data.courses, matchStudentRoute(cleared)!.query).visible.map(group => group.id)).toEqual(["tpb"]);
  expect(studentPathWithQuery("/courses?q=", { q: undefined })).toBe("/courses");
});

test("catalog formats badge, counts, special PKA copy and locks from fixture metadata", async () => {
  const { data, request } = await catalogFixture();
  const english = catalogCopy("en-GB");
  const indonesian = catalogCopy("id-ID");
  expect(english.all(data.courses.length)).toBe("All (5)");
  expect(english.count(1, "course")).toBe("1 course");
  expect(english.count(4, "course")).toBe("4 courses");
  expect(indonesian.count(4, "course")).toBe("4 mata kuliah");
  const rows = data.courses.map(course => getCatalogRow(course, english));
  expect(rows.map(row => row.badge.initials)).toEqual(["BK", "FI", "MA", "ML", "PKA"]);
  expect(rows.map(row => row.summary)).toEqual(["Coming soon", "1 material", "6 materials · 2 quizzes", "1 tryout", english.row.pkaSummary]);
  expect(rows.map(row => row.hasContent)).toEqual([false, true, true, true, true]);
  expect(rows.map(row => row.lockedLabel)).toEqual([null, "Limited access", null, null, "Registration required"]);
  const details = await request(learningEndpoint({ view: "course", courseId: "ma1101" }));
  expect(details.status).toBe(200);
  expect((await details.json() as CourseData).course.id).toBe("ma1101");
});

test("timed offers follow Jakarta hours, compact date ranges and offer boundaries", async () => {
  const { data } = await catalogFixture();
  const course = data.courses.find(course => course.id === "ma1102")!;
  const window = getCatalogOfferWindow(course)!;
  expect(getCatalogOffer(window, "en-GB", new Date("2029-12-31T23:59:59Z"))).toEqual({ state: "offerUpcoming", schedule: "1-3 Jan 2030 (07:00 WIB)" });
  expect(getCatalogOffer(window, "en-GB", new Date(data.asOf!))).toEqual({ state: "offerActive", schedule: "1-3 Jan 2030 (07:00 WIB)" });
  expect(getCatalogOffer(window, "id-ID", window.end)).toEqual({ state: "offerEnded", schedule: "1-3 Jan 2030 (07:00 WIB)" });
  expect(getCatalogOffer({ ...window, end: new Date("2030-01-03T11:00:00Z") }, "en-GB", window.start).schedule).toBe("1 Jan 2030 07:00 - 3 Jan 2030 18:00 WIB");
  expect(nextCatalogOfferChange(data, window.start.getTime() - 1)).toBe(window.start.getTime());
  expect(nextCatalogOfferChange(data, window.start.getTime())).toBe(window.end.getTime());
  expect(nextCatalogOfferChange(data, window.end.getTime())).toBeNull();
});

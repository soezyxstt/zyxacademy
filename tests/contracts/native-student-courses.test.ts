import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  canShowOfflineCourse, coursesEndpoint, dashboardPreviewPath, learningEndpoint, materialPath, materialRowPath, normalizeMaterialTab,
  type CatalogData, type CourseData, type DashboardData, type LearningQuery, type MaterialListData, type MaterialDetailData,
} from "@/packages/native-parity/student/courses/contract";
import { createCourseFixtureRequest } from "@/packages/native-parity/student/courses/fixtures";
import { materialReferenceScenarios } from "@/packages/native-parity/student/courses/material-reference";
import { createStudentFixtureRequest } from "@/packages/native-parity/student/fixture-request";
import { matchStudentRoute, studentMaterialReaderTarget } from "@/apps/mobile-native/features/student/routes";

const authGuard = mock(async (_request: Request): Promise<{ userId: string } | Response> => ({ userId: "learner-a" }));
const loadCourse = mock(async (_student: string, _query: LearningQuery): Promise<unknown> => ({ view: "catalog", courses: [], targetCategory: null }));
const redeem = mock(async (_token: string, _student: string, _surface: string) => ({ success: true }));

mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: authGuard }));
mock.module("@/lib/student/native-course-data", () => ({ loadNativeCourseData: loadCourse }));
mock.module("@/lib/groups/redeem-token", () => ({ redeemGroupToken: redeem }));

const { GET, POST } = await import("@/app/api/native/student/courses/route");

const request = (path: string, init?: RequestInit) => new Request(`https://native.example${path}`, init);

afterEach(() => {
  authGuard.mockClear();
  loadCourse.mockClear();
  redeem.mockClear();
});

describe("native Student course routes", () => {
  test("verifies live session before reads and activates only the bound Student", async () => {
    authGuard.mockResolvedValueOnce(Response.json({ error: "ACCOUNT_CHANGED" }, { status: 409 }));
    expect((await GET(request(learningEndpoint({ view: "catalog" })))).status).toBe(409);
    expect(loadCourse).not.toHaveBeenCalled();

    authGuard.mockResolvedValueOnce(Response.json({ error: "STUDENT_REQUIRED" }, { status: 403 }));
    expect((await POST(request(coursesEndpoint))).status).toBe(403);
    expect(redeem).not.toHaveBeenCalled();

    const result = await POST(request(coursesEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: " Zyx-example " }) }));
    expect(result.status).toBe(200);
    expect(redeem).toHaveBeenCalledWith("Zyx-example", "learner-a", "dashboard");
  });

  test("validates unique route parameters and never accepts a Student identity from the client payload", async () => {
    expect((await GET(request(`${coursesEndpoint}?view=material-detail&courseId=c`))).status).toBe(400);
    expect((await GET(request(`${coursesEndpoint}?view=catalog&view=dashboard`))).status).toBe(400);
    expect((await GET(request(`${coursesEndpoint}?view=course&courseId=c%2Fprivate`))).status).toBe(400);
    expect((await GET(request(`${coursesEndpoint}?view=dashboard&studentId=learner-b`))).status).toBe(400);
    expect((await POST(request(coursesEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "valid", studentId: "learner-b" }) }))).status).toBe(400);
    expect((await POST(request(coursesEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "a".repeat(2500) }) }))).status).toBe(400);
    expect(loadCourse).not.toHaveBeenCalled();
    expect(redeem).not.toHaveBeenCalled();
  });

  test("returns scoped denials without caching and passes only the bound account and validated identifiers", async () => {
    loadCourse.mockResolvedValueOnce({ status: 403 });
    const path = learningEndpoint({ view: "material-detail", courseId: "math", materialId: "bab-2" });
    const result = await GET(request(path));
    expect(result.status).toBe(403);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toEqual({ error: "COURSE_ACCESS_DENIED" });
    expect(loadCourse).toHaveBeenCalledWith("learner-a", { view: "material-detail", courseId: "math", materialId: "bab-2" });
  });
});

describe("native Student course fixtures", () => {
  const courseId = "matematika-1";
  const dashboard = learningEndpoint({ view: "dashboard" });
  const materialList = learningEndpoint({ view: "material-list", courseId });
  const materialDetail = (materialId: string) => learningEndpoint({ view: "material-detail", courseId, materialId });

  test.each([["unenrolled", "Bima"], ["revoked", "Citra"]] as const)(
    "replays the signed dashboard chapter action for %s and keeps premium content locked",
    async (state, firstName) => {
      const learner = createStudentFixtureRequest(`dashboard-parity-${state}`);
      const home: DashboardData = await (await learner(dashboard)).json();
      expect(home.firstName).toBe(firstName);
      expect(home.enrolled).toEqual([]);
      const preview = home.preview!.courses[0];
      const target = matchStudentRoute(dashboardPreviewPath(preview))!;
      expect(target.path).toBe("/courses/matematika-1/material/dokumen-1");
      const opened = await learner(learningEndpoint({ view: "material-detail", courseId: target.params.id, materialId: target.params.materialId }));
      expect(opened.status).toBe(200);
      const detail: MaterialDetailData = await opened.json();
      expect(detail.material).toMatchObject({ id: "dokumen-1", title: "Sistem bilangan real", locked: false });
      const catalog: CatalogData = await (await learner(learningEndpoint({ view: "catalog" }))).json();
      expect(catalog.courses).toMatchObject([{ id: courseId, hasFullContentAccess: false }]);
      const course: CourseData = await (await learner(learningEndpoint({ view: "course", courseId }))).json();
      expect(course.course.hasFullContentAccess).toBeFalse();
      const list: MaterialListData = await (await learner(materialList)).json();
      expect(list.materials.find(row => row.id === "dokumen-4")?.locked).toBeTrue();
      const premium: MaterialDetailData = await (await learner(materialDetail("dokumen-4"))).json();
      expect(premium.material.locked).toBeTrue();
      expect(await (await learner(dashboard)).json()).toEqual(home);
    },
  );

  test("traverses the enrolled path from dashboard to a selectable document", async () => {
    const learner = createCourseFixtureRequest("enrolled");
    const home = await (await learner(dashboard)).json();
    expect(home.enrolled[0].id).toBe(courseId);
    expect((await learner(learningEndpoint({ view: "course", courseId }))).status).toBe(200);
    const data: MaterialListData = await (await learner(materialList)).json();
    const first = data.materials[0];
    expect(first.locked).toBeFalse();
    expect(materialRowPath(courseId, first)).toBe("/courses/matematika-1/material/pengantar");
    expect((await learner(materialDetail(first.id))).status).toBe(200);
  });

  test("unenrolled and revoked learners can use the free preview while premium readers stay locked", async () => {
    for (const scenario of ["unenrolled", "revoked"] as const) {
      const learner = createCourseFixtureRequest(scenario);
      const before = await (await learner(dashboard)).json();
      expect(before.enrolled).toHaveLength(scenario === "revoked" ? 1 : 0);
      const locked: MaterialDetailData = await (await learner(materialDetail("catatan-fungsi"))).json();
      const preview: MaterialDetailData = await (await learner(materialDetail("pengantar"))).json();
      expect(locked.material.locked).toBeTrue();
      expect(locked.material.completed).toBeFalse();
      expect(preview.material.locked).toBeFalse();
      expect((await (await learner(dashboard)).json()).enrolled).toEqual([]);
      expect(Object.keys(locked.material).sort()).toEqual(["completed", "group", "id", "kind", "locked", "title"]);
    }
  });

  test("replays product material identities and preserves the permitted preview after a locked reader", async () => {
    for (const scenario of materialReferenceScenarios) {
      const learner = createCourseFixtureRequest(scenario);
      const list: MaterialListData = await (await learner(materialList)).json();
      const premium = list.materials.find(row => row.id === "dokumen-4")!;
      const route = matchStudentRoute(materialRowPath(courseId, premium))!;
      expect(route.params.materialId).toBe("dokumen-4");
      const reader: MaterialDetailData = await (await learner(materialDetail(route.params.materialId))).json();
      expect(reader.material).toMatchObject({ id: premium.id, title: premium.title, locked: scenario !== "course-material-enrolled" });
      const target = studentMaterialReaderTarget(route, reader);
      if (scenario === "course-material-enrolled") {
        expect(target).toMatchObject({ kind: "article", courseId, materialId: "dokumen-4" });
      } else {
        expect(target).toBeNull();
      }
      expect((await learner(materialDetail("missing"))).status).toBe(404);
      const preview: MaterialDetailData = await (await learner(materialDetail("dokumen-1"))).json();
      const previewRoute = matchStudentRoute(materialPath(courseId, "dokumen-1"))!;
      expect(studentMaterialReaderTarget(previewRoute, preview)).toMatchObject({ kind: "article", courseId, materialId: "dokumen-1" });
    }
  });

  test("recovers from a transient offline read and creates enough rows to exercise scrolling", async () => {
    const offline = createCourseFixtureRequest("offline");
    await expect(offline(dashboard)).rejects.toThrow("Network request failed");
    expect((await offline(dashboard)).status).toBe(200);

    const long = createCourseFixtureRequest("long-content");
    const data: MaterialListData = await (await long(materialList)).json();
    expect(data.materials.length).toBeGreaterThan(30);
    expect(data.materials.findIndex(({ id }) => id === "bab-24")).toBeGreaterThan(20);
  });

  test("shows still-leased metadata on transport failure and excludes authoritative access denials", () => {
    expect(canShowOfflineCourse("material-list", "course-a", "course-a", "offline", { kind: "loading" })).toBeTrue();
    expect(canShowOfflineCourse("material-detail", "course-a", "course-a", "ready", { kind: "error", status: 503 })).toBeTrue();
    expect(canShowOfflineCourse("material-detail", "course-a", "course-a", "offline", { kind: "ready" })).toBeFalse();
    for (const status of [400, 401, 403, 404, 409]) expect(canShowOfflineCourse("material-detail", "course-a", "course-a", "offline", { kind: "error", status })).toBeFalse();
    expect(canShowOfflineCourse("material-list", "course-a", "course-a", "revoked", { kind: "error", status: 0 })).toBeFalse();
    expect(canShowOfflineCourse("material-list", "course-a", "course-b", "offline", { kind: "error", status: 0 })).toBeFalse();
  });

  test("encodes navigation identifiers and reading positions while honoring the question bank alias", () => {
    expect(materialPath("a+b", "c d", "x&y")).toBe("/courses/a%2Bb/material/c%20d?section=x%26y");
    expect(normalizeMaterialTab("bank-soal")).toBe("bank_soal");
    expect(normalizeMaterialTab("invalid")).toBe("all");
  });
});

import { expect, mock, test } from "bun:test";
import { readingAccess } from "@/apps/mobile-native/offline/reading-access";
import type { NativeOfflineMetadataSnapshot } from "@/apps/mobile-native/offline/metadata-store";
import type { NativeOfflineResourceDescriptor } from "@/apps/mobile-native/offline/sync-contract";
import { createStudentOfflineCourseLifecycle, offlineCourseTarget, selectAuthorizedOfflineMaterial, studentOfflineCourses } from "@/apps/mobile-native/features/student/offline-courses";

const scope = { origin: "https://student.example", accountId: "student-a", sessionId: "session-a", locale: "en" } as const;
const article: NativeOfflineResourceDescriptor = {
  key: '["article","math","limits"]',
  courseId: "math", id: "limits", kind: "article", title: "Limits", chapterIds: ["chapter-1"], revision: "r2", updatedAt: 10, estimatedBytes: 500,
};
const snapshot: NativeOfflineMetadataSnapshot = {
  cursor: null,
  knownCourseIds: ["math", "tutorial-pka"],
  courses: [
    { id: "math", title: "Matematika I", leaseExpiresAt: 250, manifestLeaseExpiresAt: 220, materials: [article] },
    { id: "tutorial-pka", title: "Tutorial PKA", leaseExpiresAt: 250, manifestLeaseExpiresAt: 220, materials: [
      { ...article, courseId: "tutorial-pka" },
    ] },
  ],
};

test("matches ordinary course and reading paths without falling back to generic protected routes", () => {
  expect(offlineCourseTarget("/dashboard")).toEqual({ kind: "library" });
  expect(offlineCourseTarget("/courses/math/material?tab=diktat")).toEqual({ kind: "course", courseId: "math" });
  expect(offlineCourseTarget("/courses/math/material/limits?section=theorem%20one&page=3")).toEqual({
    kind: "material", courseId: "math", materialId: "limits", section: "theorem one", page: 3,
  });
  for (const path of ["/settings", "/courses/math/quiz/1", "/courses/tutorial-pka/material/limits", "/courses/math/material/.."]) {
    expect(offlineCourseTarget(path)).toEqual({ kind: "unavailable" });
  }
});

test("the handoff requires a unique matching leased descriptor and caps the reader deadline", () => {
  const target = { kind: "material", courseId: "math", materialId: "limits", section: "theorem one", page: 3 } as const;
  const input = { scope, snapshot, target, verifiedUntil: 200, now: 100 };
  expect(selectAuthorizedOfflineMaterial(input)).toEqual({
    scope, resource: article, leaseExpiresAt: 200, section: "theorem one", page: 3,
  });
  expect(selectAuthorizedOfflineMaterial({ ...input, verifiedUntil: 300 })?.leaseExpiresAt).toBe(220);
  expect(selectAuthorizedOfflineMaterial({ ...input, now: 200 })).toBeNull();
  expect(selectAuthorizedOfflineMaterial({ ...input, verifiedUntil: 300, now: 220 })).toBeNull();
  expect(selectAuthorizedOfflineMaterial({ ...input, target: { ...target, materialId: "different" } })).toBeNull();
  expect(selectAuthorizedOfflineMaterial({ ...input, target: { ...target, courseId: "tutorial-pka" } })).toBeNull();

  const withMaterials = (materials: NativeOfflineResourceDescriptor[]) => ({ ...snapshot, courses: [{ ...snapshot.courses[0], materials }] });
  expect(selectAuthorizedOfflineMaterial({ ...input, snapshot: withMaterials([article, { ...article, kind: "diktat" }]) })).toBeNull();
  expect(selectAuthorizedOfflineMaterial({ ...input, snapshot: withMaterials([{ ...article, courseId: "different" }]) })).toBeNull();
  expect(selectAuthorizedOfflineMaterial({ ...input, snapshot: withMaterials([{ ...article, kind: "course_outline" }]) })).toBeNull();
  expect(studentOfflineCourses(snapshot, 220)).toEqual([expect.objectContaining({ id: "math", materials: [] })]);
  expect(studentOfflineCourses(snapshot, 250)).toEqual([]);
});

test("cold offline metadata loads through the session scope with no network transport", async () => {
  const now = Date.now;
  const access = readingAccess({
    identity: { ...scope, expiresAt: now() + 60_000 }, locale: "en", foreground: true, offline: true,
    liveStudent: false, denied: false, revalidating: false, now: now(),
  });
  expect(access.scope).toEqual(scope);
  if (!access.scope) throw new Error("Expected offline reading scope");

  const currentSnapshot = { ...snapshot, courses: snapshot.courses.map(course => ({
    ...course, leaseExpiresAt: now() + 60_000, manifestLeaseExpiresAt: now() + 60_000,
  })) };
  const read = mock(async () => currentSnapshot);
  const driver = createStudentOfflineCourseLifecycle(access.scope, read, now);
  try {
    driver.register(null);
    driver.setEnvironment({ foreground: true, online: false, verified: true, expiresAt: access.verifiedUntil });
    await driver.retry();
    expect(read).toHaveBeenCalledWith(scope);
    expect(driver.getSnapshot().status).toBe("offline");
    expect(studentOfflineCourses(driver.getSnapshot().snapshot, now()).map(course => course.id)).toEqual(["math"]);
    driver.markRevoked();
    expect(driver.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
    await driver.retry();
    expect(driver.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
  } finally { driver.dispose(); }
});

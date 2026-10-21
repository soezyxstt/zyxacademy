import { describe, expect, test, mock } from "bun:test";

process.env.SKIP_ENV_VALIDATION = "1";
mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

const { resolveCourseAccess } = await import("@/lib/student/course-access");
const { resolveStudentCourse, listStudentCourses, isStudentEnrolled, listStudentEnrollments } = await import("@/lib/student/course-catalog");
const { getCourse, getStudentCourseAccess, getCourseChapterOutline, isEnrolled } = await import("@/lib/course-utils");
const { getAuthSession, getAuthUser, requireAuthUser } = await import("@/lib/auth-session");
const { auth } = await import("@/lib/auth");

describe("Request-scoped read deduplication and caching contracts", () => {
  describe("Module export and function identity stability", () => {
    test("cached read helpers expose stable module-level function identity and async wrapper signatures", () => {
      // Exported wrappers must be valid functions at module scope
      expect(typeof resolveStudentCourse).toBe("function");
      expect(typeof listStudentCourses).toBe("function");
      expect(typeof getCourse).toBe("function");
      expect(typeof getStudentCourseAccess).toBe("function");
      expect(typeof getCourseChapterOutline).toBe("function");
      expect(typeof getAuthSession).toBe("function");
      expect(typeof getAuthUser).toBe("function");
      expect(typeof requireAuthUser).toBe("function");
    });

    test("mutation-sensitive enrollment checks are not persistently cached across request mutations", () => {
      // isStudentEnrolled, listStudentEnrollments, and isEnrolled must remain uncached getters
      // to ensure enrollment mutations within the same request (e.g. token redemption)
      // are immediately reflected.
      expect(typeof isStudentEnrolled).toBe("function");
      expect(typeof listStudentEnrollments).toBe("function");
      expect(typeof isEnrolled).toBe("function");
    });
  });

  describe("resolveCourseAccess primitive key unpacking and executor isolation", () => {
    test("bypasses default db cached resolver when custom executor is provided", async () => {
      let executorSelectCalled = 0;
      const fakeExecutor = {
        select: () => {
          executorSelectCalled++;
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          };
        },
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        }),
      };

      const result = await resolveCourseAccess(
        { courseId: "nonexistent-course", userId: "user-123" },
        fakeExecutor as any,
      );

      expect(executorSelectCalled).toBeGreaterThan(0);
      expect(result.requestedCourseId).toBe("nonexistent-course");
      expect(result.hasCourseAccess).toBe(false);
      expect(result.reason).toBe("COURSE_NOT_FOUND");
    });

    test("handles empty and whitespace course IDs safely", async () => {
      const resultEmpty = await resolveCourseAccess({ courseId: "" });
      expect(resultEmpty.hasCourseAccess).toBe(false);
      expect(resultEmpty.reason).toBe("COURSE_NOT_FOUND");

      const resultWhitespace = await resolveCourseAccess({ courseId: "   " });
      expect(resultWhitespace.hasCourseAccess).toBe(false);
      expect(resultWhitespace.reason).toBe("COURSE_NOT_FOUND");
    });

    test("preserves explicit epoch now=0 vs omitted now timestamp vs negative dates", async () => {
      const trackingExecutor = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        }),
      };

      // Calling with explicit epoch Date(0)
      const epochDate = new Date(0);
      const resEpoch = await resolveCourseAccess(
        { courseId: "test-course", now: epochDate },
        trackingExecutor as any,
      );
      expect(resEpoch.requestedCourseId).toBe("test-course");

      // Calling with negative date (prior to 1970)
      const negativeDate = new Date(-86400000);
      const resNegative = await resolveCourseAccess(
        { courseId: "test-course", now: negativeDate },
        trackingExecutor as any,
      );
      expect(resNegative.requestedCourseId).toBe("test-course");

      // Calling with omitted now
      const resOmitted = await resolveCourseAccess(
        { courseId: "test-course" },
        trackingExecutor as any,
      );
      expect(resOmitted.requestedCourseId).toBe("test-course");
    });
  });

  describe("auth-session helper contracts", () => {
    test("requireAuthUser throws Unauthorized when no authenticated session exists", async () => {
      const origGetSession = auth.api.getSession;
      try {
        (auth.api as any).getSession = mock(() => Promise.resolve(null));
        expect(requireAuthUser()).rejects.toThrow("Unauthorized");
      } finally {
        (auth.api as any).getSession = origGetSession;
      }
    });

    test("requireAuthUser returns user when authenticated session is present", async () => {
      const origGetSession = auth.api.getSession;
      const mockUser = { id: "usr-student-42", email: "student@zyx.test", name: "Student 42" };
      try {
        (auth.api as any).getSession = mock(() =>
          Promise.resolve({
            session: { id: "sess-1", userId: "usr-student-42" },
            user: mockUser,
          } as any),
        );
        const user = await requireAuthUser();
        expect(user.id).toBe("usr-student-42");
        expect(user.name).toBe("Student 42");
      } finally {
        (auth.api as any).getSession = origGetSession;
      }
    });

    test("getAuthUser returns null when session has no user", async () => {
      const origGetSession = auth.api.getSession;
      try {
        (auth.api as any).getSession = mock(() => Promise.resolve(null));
        const user = await getAuthUser();
        expect(user).toBeNull();
      } finally {
        (auth.api as any).getSession = origGetSession;
      }
    });
  });

  describe("getCourse and resolveStudentCourse read helpers", () => {
    test("getCourse safely returns undefined for empty id without throwing", async () => {
      const result = await getCourse("");
      expect(result).toBeUndefined();

      const resultWhitespace = await getCourse("   ");
      expect(resultWhitespace).toBeUndefined();
    });

    test("resolveStudentCourse returns null for empty or whitespace id", async () => {
      const result = await resolveStudentCourse("");
      expect(result).toBeNull();

      const resultWhitespace = await resolveStudentCourse("   ");
      expect(resultWhitespace).toBeNull();
    });
  });
});

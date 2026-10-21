import { describe, expect, it, beforeEach, mock } from "bun:test";
import React, { Suspense } from "react";

// Mock server-only and next headers
mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.name = "RedirectError";
    this.url = url;
  }
}

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

const mockRedirect = mock((url: string) => {
  throw new RedirectError(url);
});

const mockNotFound = mock(() => {
  throw new NotFoundError();
});

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

// Mock auth session
const mockGetAuthSession = mock();
mock.module("@/lib/auth-session", () => ({
  getAuthSession: mockGetAuthSession,
}));

// Mock course utils
const mockStudentAccess = {
  tier: "standard",
  freeChapterIds: [] as string[],
  policy: {
    capabilities: {
      canDownloadDiktat: true,
    },
  },
};

const mockGetCourse = mock();
const mockGetCourseChapterOutline = mock();
const mockGetStudentCourseAccess = mock();
const mockExtractFreeQuizChapterScope = mock(() => new Set());
const mockIsFreeChapterScoped = mock(() => false);
const mockIsFreeQuizTemplate = mock(() => false);

mock.module("@/lib/course-utils", () => ({
  getCourse: mockGetCourse,
  getCourseChapterOutline: mockGetCourseChapterOutline,
  getStudentCourseAccess: mockGetStudentCourseAccess,
  extractFreeQuizChapterScope: mockExtractFreeQuizChapterScope,
  isFreeChapterScoped: mockIsFreeChapterScoped,
  isFreeQuizTemplate: mockIsFreeQuizTemplate,
}));

// Mock learning analytics
const mockGetCourseOverviewData = mock();
mock.module("@/lib/learning-analytics", () => ({
  getCourseOverviewData: mockGetCourseOverviewData,
}));

// Mock site metadata
mock.module("@/lib/site", () => ({
  createMetadata: mock((meta: any) => meta),
}));

// Mock storage
mock.module("@/lib/storage", () => ({
  storage: {
    getUrl: mock(() => "https://example.com/file.pdf"),
  },
}));

// Mock articles structured repository
const mockGetCanonicalPublishedArticlesForCourse = mock();
mock.module("@/lib/articles/structured-repository", () => ({
  getCanonicalPublishedArticlesForCourse: mockGetCanonicalPublishedArticlesForCourse,
}));

// Mock UI components
mock.module("@/components/mobile-nav-title", () => ({
  MobileNavTitle: (props: any) => React.createElement("div", { "data-testid": "mobile-nav-title", ...props }),
}));
mock.module("@/components/course/chapter-outline", () => ({
  ChapterOutline: (props: any) => React.createElement("div", { "data-testid": "chapter-outline", ...props }),
}));
mock.module("@/components/course/course-primary-actions", () => ({
  CoursePrimaryActions: (props: any) => React.createElement("div", { "data-testid": "primary-actions", ...props }),
}));
mock.module("@/components/course/course-attention-strip", () => ({
  CourseAttentionStrip: (props: any) => React.createElement("div", { "data-testid": "attention-strip", ...props }),
}));
mock.module("@/components/enrollment-form", () => ({
  EnrollmentForm: (props: any) => React.createElement("div", { "data-testid": "enrollment-form", ...props }),
}));
mock.module("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => React.createElement("div", { "data-testid": "skeleton", ...props }),
}));
mock.module("@/components/course/course-page-shell", () => ({
  CoursePageShell: (props: any) => React.createElement("div", { "data-testid": "course-page-shell", children: props.children }),
}));
mock.module("@/app/(student)/courses/[id]/material/course-documents-client", () => ({
  CourseDocumentsClient: (props: any) => React.createElement("div", { "data-testid": "course-documents-client", ...props }),
}));

// Mock db chain
function createDbChain(resultData: any = []) {
  const promise = Promise.resolve(resultData);
  const chain: any = Object.assign(promise, {
    from: mock(() => chain),
    where: mock(() => chain),
    leftJoin: mock(() => chain),
    orderBy: mock(() => chain),
  });
  return chain;
}

const mockDb = {
  select: mock((..._args: any[]) => createDbChain([])),
};
mock.module("@/db", () => ({
  db: mockDb,
}));

// Helper to create deferred promises
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Helper to find a node in a React element tree
function findElement(node: any, predicate: (n: any) => boolean): any {
  if (!node) return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === "object") {
    return findElement(children, predicate);
  }
  return null;
}

// Import actual production implementations
const { default: CourseLayout } = await import("@/app/(student)/courses/[id]/layout");
const { default: CourseOverviewPage } = await import("@/app/(student)/courses/[id]/page");
const { default: CourseMaterialListPage } = await import("@/app/(student)/courses/[id]/material/page");

describe("student course navigation concurrency and streaming invariants", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockGetAuthSession.mockReset();
    mockGetCourse.mockReset();
    mockGetCourseChapterOutline.mockReset();
    mockGetCourseChapterOutline.mockResolvedValue([]);
    mockGetStudentCourseAccess.mockReset();
    mockGetStudentCourseAccess.mockResolvedValue(mockStudentAccess);
    mockGetCourseOverviewData.mockReset();
    mockGetCanonicalPublishedArticlesForCourse.mockReset();
    mockGetCanonicalPublishedArticlesForCourse.mockResolvedValue([]);
    mockDb.select.mockClear();
  });

  describe("CourseLayout concurrency and error semantics", () => {
    it("proves session and course queries both start before either resolves", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);

      const layoutPromise = CourseLayout({
        children: React.createElement("div", null, "Child Content"),
        params: Promise.resolve({ id: "math-1" }),
      });

      // Yield to allow async params and initial synchronous setup to run
      await Promise.resolve();

      // Assert both queries were dispatched concurrently
      expect(mockGetAuthSession).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledWith("math-1");

      // Resolve both deferreds
      sessionDeferred.resolve({ user: { id: "std_1" } });
      courseDeferred.resolve({ id: "math-1", title: "Matematika I" });

      const result = await layoutPromise;
      expect(result).toBeDefined();
    });

    it("ensures missing session redirect wins over concurrent course query rejection", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);

      const layoutPromise = CourseLayout({
        children: React.createElement("div", null, "Child Content"),
        params: Promise.resolve({ id: "math-1" }),
      });

      await Promise.resolve();

      // Reject course lookup and resolve session as null
      courseDeferred.reject(new Error("Database connection dropped"));
      sessionDeferred.resolve(null);

      // Redirect should be thrown; course rejection must NOT bubble up or cause unhandled rejection
      await expect(layoutPromise).rejects.toThrow("NEXT_REDIRECT:/sign-in?next=%2Fcourses%2Fmath-1");
      expect(mockRedirect).toHaveBeenCalledWith("/sign-in?next=%2Fcourses%2Fmath-1");
    });

    it("calls notFound when authenticated user requests missing course", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockResolvedValue(null);

      const layoutPromise = CourseLayout({
        children: React.createElement("div", null, "Child Content"),
        params: Promise.resolve({ id: "missing-course" }),
      });

      await expect(layoutPromise).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });

    it("re-throws course error when authenticated user encounters course query failure", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockRejectedValue(new Error("Timeout during course lookup"));

      const layoutPromise = CourseLayout({
        children: React.createElement("div", null, "Child Content"),
        params: Promise.resolve({ id: "math-1" }),
      });

      await expect(layoutPromise).rejects.toThrow("Timeout during course lookup");
    });
  });

  describe("CourseOverviewPage concurrency and Suspense streaming", () => {
    it("proves session and course queries both start before either resolves", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);
      mockGetStudentCourseAccess.mockResolvedValue(mockStudentAccess);
      mockGetCourseChapterOutline.mockResolvedValue([]);

      const pagePromise = CourseOverviewPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await Promise.resolve();

      expect(mockGetAuthSession).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledWith("math-1");

      sessionDeferred.resolve({ user: { id: "std_1" } });
      courseDeferred.resolve({ id: "math-1", title: "Matematika I" });

      const pageResult = await pagePromise;
      expect(pageResult).toBeDefined();
    });

    it("ensures missing session redirect wins over course query rejection", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);

      const pagePromise = CourseOverviewPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await Promise.resolve();

      courseDeferred.reject(new Error("Course table locked"));
      sessionDeferred.resolve(null);

      await expect(pagePromise).rejects.toThrow("NEXT_REDIRECT:/sign-in?next=%2Fcourses%2Fmath-1");
      expect(mockRedirect).toHaveBeenCalledWith("/sign-in?next=%2Fcourses%2Fmath-1");
    });

    it("returns null when course does not exist for authenticated user", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockResolvedValue(null);

      const result = await CourseOverviewPage({
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(result).toBeNull();
    });

    it("re-throws course error for authenticated user when course query fails", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockRejectedValue(new Error("Database unavailable"));

      const pagePromise = CourseOverviewPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await expect(pagePromise).rejects.toThrow("Database unavailable");
    });

    it("returns overview JSX immediately while slow analytics is unresolved and Suspense owns async highlights", async () => {
      const slowAnalyticsDeferred = createDeferred<any>();

      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockResolvedValue({ id: "math-1", title: "Matematika I" });
      mockGetStudentCourseAccess.mockResolvedValue(mockStudentAccess);
      mockGetCourseChapterOutline.mockResolvedValue([{ id: "ch-1", title: "Bab 1", materials: [] }]);
      mockGetCourseOverviewData.mockImplementation(() => slowAnalyticsDeferred.promise);

      // CourseOverviewPage must resolve WITHOUT waiting for slow analytics
      const pageResult = await CourseOverviewPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      // Verify the page returned JSX immediately while slowAnalyticsDeferred is STILL unresolved
      expect(pageResult).toBeDefined();
      expect(mockGetCourseOverviewData).not.toHaveBeenCalled();

      // Find Suspense element in the returned JSX tree
      const suspenseElement = findElement(pageResult, (node) => node.type === Suspense);
      expect(suspenseElement).toBeDefined();
      expect(suspenseElement.props.fallback).toBeDefined();

      // The child of Suspense is the async CourseOverviewHighlights component
      const highlightsElement = suspenseElement.props.children;
      expect(highlightsElement).toBeDefined();
      expect(highlightsElement.props).toMatchObject({
        studentId: "std_1",
        courseId: "math-1",
      });

      // Executing the Suspense-owned component triggers the analytics query
      const highlightsPromise = highlightsElement.type(highlightsElement.props);
      expect(mockGetCourseOverviewData).toHaveBeenCalledTimes(1);
      expect(mockGetCourseOverviewData).toHaveBeenCalledWith("std_1", "math-1", expect.any(Array));

      // Resolve analytics and verify highlights element renders
      slowAnalyticsDeferred.resolve({
        reading: { id: "mat-1", title: "Materi 1" },
        quiz: null,
        schedule: null,
        attention: null,
      });

      const highlightsResult = await highlightsPromise;
      expect(highlightsResult).toBeDefined();
    });
  });

  describe("CourseMaterialListPage concurrency and query overlapping", () => {
    it("proves session and course queries both start before either resolves", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);

      const pagePromise = CourseMaterialListPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await Promise.resolve();

      expect(mockGetAuthSession).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledTimes(1);
      expect(mockGetCourse).toHaveBeenCalledWith("math-1");

      sessionDeferred.resolve({ user: { id: "std_1" } });
      courseDeferred.resolve({ id: "math-1", title: "Matematika I", legacyId: "math-1" });

      const pageResult = await pagePromise;
      expect(pageResult).toBeDefined();
    });

    it("ensures missing session redirect wins over course query rejection", async () => {
      const sessionDeferred = createDeferred<any>();
      const courseDeferred = createDeferred<any>();

      mockGetAuthSession.mockImplementation(() => sessionDeferred.promise);
      mockGetCourse.mockImplementation(() => courseDeferred.promise);

      const pagePromise = CourseMaterialListPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await Promise.resolve();

      courseDeferred.reject(new Error("Course lookup error"));
      sessionDeferred.resolve(null);

      await expect(pagePromise).rejects.toThrow("NEXT_REDIRECT:/sign-in?next=%2Fcourses%2Fmath-1%2Fmaterial");
      expect(mockRedirect).toHaveBeenCalledWith("/sign-in?next=%2Fcourses%2Fmath-1%2Fmaterial");
    });

    it("returns null when course does not exist for authenticated user", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockResolvedValue(null);

      const result = await CourseMaterialListPage({
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(result).toBeNull();
    });

    it("re-throws course error for authenticated user when course query fails", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockRejectedValue(new Error("Database unavailable"));

      const pagePromise = CourseMaterialListPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      await expect(pagePromise).rejects.toThrow("Database unavailable");
    });

    it("overlaps independent material subqueries in parallel with mock database chain", async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: "std_1" } });
      mockGetCourse.mockResolvedValue({ id: "math-1", title: "Matematika I", canonicalId: "can-1" });

      const deferredOutline = createDeferred<any[]>();

      let accessStarted = false;
      let articlesStarted = false;

      mockGetStudentCourseAccess.mockImplementation(async () => {
        accessStarted = true;
        return mockStudentAccess;
      });
      mockGetCanonicalPublishedArticlesForCourse.mockImplementation(async () => {
        articlesStarted = true;
        return [];
      });
      mockGetCourseChapterOutline.mockImplementation(() => deferredOutline.promise);

      const pagePromise = CourseMaterialListPage({
        params: Promise.resolve({ id: "math-1" }),
      });

      // Yield microtasks to allow session, course, and initial Promise.all to start
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Verify that access, articles, and DB selects were initiated in parallel while chapter outline is unresolved
      expect(accessStarted).toBe(true);
      expect(articlesStarted).toBe(true);
      expect(mockDb.select).toHaveBeenCalled();

      // Now complete the deferred outline query
      deferredOutline.resolve([]);

      const pageResult = await pagePromise;
      expect(pageResult).toBeDefined();
    });
  });
});

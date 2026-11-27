import { courseFixtures, emptyCourseFixture, summarizeCourse, type CourseFixture } from "./fixtures";

export type CourseFixtureScenario = "populated" | "empty" | "error";
type CourseOperation = "create" | "update" | "delete";
type CourseRole = "admin" | "tutor" | "student";

export type CourseMutationResult =
  | { status: "saved" }
  | { status: "validation"; message: string }
  | { status: "conflict"; revision: number | null }
  | { status: "denied" | "retry" };

type CourseMutation = {
  requestId: string;
  role: CourseRole;
  slug: string;
  operation: CourseOperation;
  revision: number | null;
  apply: (course: CourseFixture | undefined, id: string) => CourseFixture | string | undefined;
};

export type CourseFixtureStore = ReturnType<typeof createAdminCourseFixtureStore>;

export function createAdminCourseFixtureStore(scenario: CourseFixtureScenario) {
  let courses = scenario === "empty" ? courseFixtures.map((entry) => ({
    ...emptyCourseFixture({ ...entry.course, chapterCount: 0, materialCount: 0, quizCount: 0 }),
    canonicalOnly: entry.canonicalOnly,
  })) : courseFixtures;
  let serial = 0;
  let interrupted = scenario === "error";
  const listeners = new Set<() => void>();
  const receipts = new Map<string, Pick<CourseMutation, "operation" | "slug" | "revision" | "apply">>();

  return {
    nextId: () => `local-course-${++serial}`,
    getSnapshot: () => courses,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    mutate(command: CourseMutation): CourseMutationResult {
      if (command.role !== "admin") return { status: "denied" };
      const receipt = receipts.get(command.requestId);
      if (receipt) {
        const sameRequest = receipt.slug === command.slug && receipt.operation === command.operation && receipt.revision === command.revision && receipt.apply === command.apply;
        return sameRequest ? { status: "saved" } : { status: "validation", message: "Identitas penyimpanan sudah digunakan." };
      }

      const current = courses.find((entry) => entry.course.slug === command.slug);
      if (command.operation === "create" && current) {
        return { status: "validation", message: "ID mata kuliah sudah terdaftar." };
      }
      if ((current?.revision ?? null) !== command.revision || (command.operation !== "create" && !current)) {
        return { status: "conflict", revision: current?.revision ?? null };
      }
      const next = command.apply(current, command.requestId);
      if (typeof next === "string") return { status: "validation", message: next };
      if (command.operation === "create" && next && courses.some((entry) => entry.course.id === next.course.id)) {
        return { status: "validation", message: "ID mata kuliah sudah terdaftar." };
      }
      if ((next && next.course.slug !== command.slug) || (!next && command.operation !== "delete")) {
        return { status: "validation", message: "Mata kuliah tidak sesuai." };
      }
      if (interrupted) {
        interrupted = false;
        return { status: "retry" };
      }

      if (next) {
        const data = summarizeCourse({ ...next, revision: (current?.revision ?? 0) + 1 });
        courses = current ? courses.map((entry) => entry === current ? data : entry) : [...courses, data];
        if (data.isDemo) {
          courses = courses.map((entry) => entry !== data && entry.isDemo
            ? { ...entry, isDemo: false, revision: entry.revision + 1 }
            : entry);
        }
      } else {
        courses = courses.filter((entry) => entry !== current);
      }
      const result = { status: "saved" } as const;
      receipts.set(command.requestId, { operation: command.operation, slug: command.slug, revision: command.revision, apply: command.apply });
      listeners.forEach((listener) => listener());
      return result;
    },
  };
}

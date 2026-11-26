import {
  coursesEndpoint,
  type CourseCard, type CourseData, type MaterialListData, type MaterialRow,
} from "./contract";

export const courseFixtureScenarios = ["enrolled", "unenrolled", "revoked", "offline", "long-content"] as const;
export type CourseFixtureScenario = (typeof courseFixtureScenarios)[number];

export const studentCourseCases = [
  { id: "student-course-enrolled", component: "CourseScreen", theme: "light", scenario: "enrolled", initialPath: "/dashboard" },
  { id: "student-course-unenrolled", component: "CourseScreen", theme: "light", scenario: "unenrolled", initialPath: "/dashboard" },
  { id: "student-course-revoked", component: "CourseScreen", theme: "light", scenario: "revoked", initialPath: "/dashboard" },
  { id: "student-course-offline", component: "CourseScreen", theme: "dark", scenario: "offline", initialPath: "/dashboard" },
  { id: "student-course-long-content", component: "CourseScreen", theme: "light", scenario: "long-content", initialPath: "/dashboard" },
] as const;

const math = {
  id: "matematika-1",
  title: "Matematika I",
  category: "TPB",
  description: "Sistem bilangan real, fungsi, limit, turunan, dan integral.",
  hasFullContentAccess: true,
  materialsCount: 3,
  quizzesCount: 4,
  tryoutsCount: 1,
} satisfies CourseCard;

const physics = {
  id: "fisika-1",
  title: "Fisika Dasar I",
  category: "TPB",
  description: "Mekanika, getaran, gelombang, dan termodinamika.",
  hasFullContentAccess: false,
  materialsCount: 8,
  quizzesCount: 12,
  tryoutsCount: 3,
} satisfies CourseCard;

const documents: ReadonlyArray<MaterialRow> = [
  { id: "pengantar", title: "Sistem bilangan real", group: "materi", kind: "article", completed: false, locked: false, chapterIds: ["bab-1"], meta: "8 menit baca" },
  { id: "catatan-fungsi", title: "Fungsi serta domain dan range", group: "materi", kind: "article", completed: false, locked: false, chapterIds: ["bab-2"], meta: "12 menit baca" },
  { id: "diktat-fungsi", title: "Diktat fungsi dan grafik", group: "diktat", kind: "article", completed: false, locked: false, chapterIds: ["bab-2"] },
  { id: "latihan-fungsi", title: "Kuis fungsi", group: "bank_soal", kind: "quiz", completed: false, locked: false, chapterIds: ["bab-2"], meta: "10 soal" },
];

const longRows: ReadonlyArray<MaterialRow> = Array.from({ length: 30 }, (_, index) => {
  const ordinal = index + 3;
  const chapter = `bab-${ordinal}`;
  return {
    id: chapter,
    title: `${ordinal}. Menentukan domain fungsi komposisi dan menjelaskan syarat pada setiap tahap perhitungan`,
    group: "materi",
    kind: "article",
    chapterIds: [chapter],
    completed: false,
    locked: false,
    meta: "18 menit baca",
  };
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

export function createCourseFixtureRequest(scenario: CourseFixtureScenario): (path: string, init?: RequestInit) => Promise<Response> {
  let firstRead = true;
  let activated = false;
  return async (path, init) => {
    const url = new URL(path, "https://student.fixture.invalid");
    if (url.origin !== "https://student.fixture.invalid" || url.pathname !== coursesEndpoint) return json({ error: "FIXTURE_NOT_FOUND" }, 404);
    if (init?.signal?.aborted) throw new Error("ABORTED");
    if (init?.method === "POST") {
      let token: unknown;
      try {
        token = JSON.parse(String(init.body)).token;
      } catch {
        return json({ success: false, errorCode: "invalid" }, 400);
      }
      if (token !== "Zyx-FIXTURE1-10-1") return json({ success: false, errorCode: "invalid" }, 422);
      if (activated) return json({ success: false, errorCode: "alreadyMember" }, 422);
      activated = true;
      return json({ success: true });
    }

    if (scenario === "offline" && firstRead) {
      firstRead = false;
      throw new TypeError("Network request failed");
    }

    const enrolled = activated || (scenario !== "unenrolled" && scenario !== "revoked");
    const allDocuments = scenario === "long-content" ? [...documents, ...longRows] : [...documents];
    const course = { ...math, hasFullContentAccess: enrolled, materialsCount: allDocuments.length };
    const rows = allDocuments.map((item) => ({ ...item, locked: !enrolled && !item.chapterIds.includes("bab-1") }));
    const chapters = [...new Set(rows.flatMap((row) => row.chapterIds))].map((id, index) => ({
      id,
      title: ["Sistem bilangan real", "Fungsi dan grafik"][index] ?? `Bab ${index + 1}`,
      aliases: [id],
    }));

    const view = url.searchParams.get("view");
    if (view === "dashboard") return json({
      view, firstName: "Nara", enrolled: enrolled ? [course] : [], recommended: enrolled ? [physics] : [course, physics],
      continueReading: enrolled ? [{ courseId: math.id, courseTitle: math.title, materialId: "pengantar", title: "Sistem bilangan real", completionPercent: 36 }] : [],
    });
    if (view === "catalog") return json({ view, targetCategory: "TPB", courses: [course, physics] });
    if (url.searchParams.get("courseId") !== course.id) return json({ error: "COURSE_RESOURCE_NOT_FOUND" }, 404);
    if (view === "course") return json({
      view, course, actions: [],
      chapters: chapters
        .filter((_, index) => enrolled || index === 0)
        .map(({ id, title }) => ({
          id, title, materialId: rows.find((row) => row.chapterIds.includes(id))?.id ?? null,
          completionPercent: id === "bab-1" ? 36 : 0, completed: false,
        })),
    } satisfies CourseData);
    if (view === "material-list") return json({ view, course, chapters, materials: rows } satisfies MaterialListData);
    if (view === "material-detail") {
      const selected = rows.find((row) => row.id === url.searchParams.get("materialId"));
      if (!selected || (selected.kind !== "article" && selected.kind !== "pdf")) return json({ error: "COURSE_RESOURCE_NOT_FOUND" }, 404);
      const { id, title, kind, group, completed, locked } = selected;
      return json({ view, course, material: { id, title, kind, group, completed, locked } });
    }
    return json({ error: "INVALID_LEARNING_QUERY" }, 400);
  };
}

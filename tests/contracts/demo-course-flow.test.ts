import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("public demo course contract", () => {
  test("resolves one active selected course and only published content", () => {
    const resolver = source("app/(marketing)/demo/demo-data.ts");
    expect(resolver).toContain("eq(mataKuliah.status, \"active\")");
    expect(resolver).toContain("eq(demoColumn, true)");
    expect(resolver).toContain("orderBy(asc(mataKuliah.title), asc(mataKuliah.id))");
    expect(resolver).toContain("if (rows.length !== 1) return null");
    expect(resolver).toContain("const selected = rows[0]");
    expect(resolver).toContain('if (selected.status !== "active") return null');
    expect(resolver).toContain("resolveCanonicalCourse(selected.legacyCourseId ?? selected.id)");
    expect(resolver).toContain("if (mappedRows.length !== 1 || mappedRows[0]?.id !== row.id) return null");
    expect(resolver).toContain("if (legacyRows.length !== 1) return null");
    const canonicalResolver = resolver.slice(
      resolver.indexOf("async function resolveCanonicalCourse"),
      resolver.indexOf("async function getSelectedCourse"),
    );
    const selectedResolver = resolver.slice(
      resolver.indexOf("async function getSelectedCourse"),
      resolver.indexOf("async function buildCourseSummary"),
    );
    expect(canonicalResolver).not.toContain(".limit(1)");
    expect(selectedResolver).not.toContain(".limit(1)");
    expect(resolver).toContain("getCanonicalPublishedArticle(course.id, record.id)");
    expect(resolver).toContain("eq(artikel.status, \"published\")");
    expect(resolver).toContain("eq(diktatMateri.status, \"published\")");
    expect(resolver).toContain("eq(setFlashcard.status, \"published\")");
    expect(resolver).toContain("eq(flashcard.status, \"published\")");
    expect(resolver).toContain("eq(soal.status, \"published\")");
    expect(resolver).toContain(".limit(5)");
    expect(resolver).toContain(".slice(0, 3)");
    expect(resolver).toContain("chapterNumber: chapter.orderIndex,");
    expect(resolver).not.toContain("chapter.orderIndex + 1");
    expect(resolver).not.toContain("gemini");
    expect(resolver).not.toContain("GoogleGenerativeAI");
  });

  test("keeps the public route noindex and shows a safe empty state", () => {
    const dashboard = source("app/(marketing)/demo/page.tsx");
    const detail = source("app/(marketing)/demo/[view]/page.tsx");
    const empty = source("components/demo/demo-empty-state.tsx");
    expect(dashboard).toContain("index: false");
    expect(dashboard).toContain("follow: false");
    expect(detail).toContain("index: false");
    expect(detail).toContain("follow: false");
    expect(dashboard).toContain("if (!content) return <DemoEmptyState />");
    expect(detail).toContain("if (!content) return <DemoEmptyState />");
    expect(empty).toContain("Demo belum tersedia");
  });

  test("keeps quiz submission stateless and answer keys server-only", () => {
    const api = source("app/api/demo/quiz/route.ts");
    const quiz = source("components/demo/demo-quiz.tsx");
    const data = source("app/(marketing)/demo/demo-data.ts");
    expect(api).toContain("export async function POST");
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(api).not.toContain("db.insert");
    expect(api).not.toContain("correctIndices");
    expect(api).toContain("questionIds");
    expect(api).toContain("questionSetToken");
    expect(api).toContain("verifyDemoQuestionSetToken");
    expect(api).toContain("sameQuestionOrder");
    expect(quiz).toContain('fetch("/api/demo/quiz"');
    expect(quiz).toContain("questionSetToken");
    expect(quiz).not.toContain("Kuis singkat");
    expect(quiz).toContain("hasil hanya muncul setelah dikirim.");
    expect(data).toContain("function toPublicContent");
    expect(data).toContain("quiz: pieces.quiz.map(({ id, prompt, options, multiple })");
    expect(data).toContain("DEMO_QUESTION_SET_TOKEN_VERSION");
    expect(data).toContain("quizSetToken");
    expect(data).toContain("version: soal.version");
    expect(data).toContain("questionVersions");
    expect(data).toContain("sameQuestionVersions(payload.questionVersions, expected.questionVersions)");
    expect(data).toContain("sameQuestionOrder(payload.questionIds, expected.questionIds)");
    expect(api).toContain("expectedQuestionVersions");
  });

  test("guards admin selection and clears the singleton in one transaction", () => {
    const actions = source("app/(admin)/admin/(academic)/courses/actions.ts");
    const settings = source("components/admin/course-detail/settings-tab.tsx");
    expect(actions).toContain("export async function setDemoCourse");
    expect(actions).toContain("await assertAdmin()");
    expect(actions).toContain("getDemoCourseEligibility(canonicalCourse.id)");
    expect(actions).toContain("await db.transaction(async (tx)");
    expect(actions).toContain("eq(mataKuliah.isDemo, true)");
    expect(actions).toContain("set({ isDemo: enabled");
    expect(actions).toContain("if (matchingCanonicalCourses.length !== 1)");
    expect(actions).toContain("if (mappedCourses.length !== 1 || mappedCourses[0]?.id !== canonicalCourse.id)");
    expect(actions).toContain("if (legacyCourses.length !== 1)");
    const selection = actions.slice(
      actions.indexOf("export async function setDemoCourse"),
      actions.indexOf("// ─────────────────────────────────────────────────────────────────────────────", actions.indexOf("export async function setDemoCourse") + 1),
    );
    expect(selection).not.toContain(".limit(1)");
    expect(settings).toContain("setDemoCourse(course.id, !course.isDemo)");
    expect(settings).toContain("!course.demoEligibility?.eligible");
  });

  test("points landing CTAs and package copy at the agreed flow", () => {
    expect(source("components/landing/landing-hero.tsx")).toContain('<Link href="/demo">Coba demo</Link>');
    expect(source("components/landing/landing-closing-cta.tsx")).toContain('<Link href="/demo">Coba demo</Link>');
    const plans = source("lib/plan-tiers.ts");
    expect(plans).toContain("Bab 1 dan Bab 2 di setiap mata kuliah");
    expect(plans).toContain("Diktat dapat dibaca, tanpa unduhan");
    expect(plans).toContain("1 pertanyaan Zyra per hari");
    expect(source("components/landing/landing-faq.tsx")).toContain("Bisa melihat fitur sebelum membuat akun?");
  });

  test("returns demo visitors to the selected course after sign-in", () => {
    const shell = source("components/demo/demo-shell.tsx");
    const dashboard = source("app/(marketing)/demo/page.tsx");
    const detail = source("app/(marketing)/demo/[view]/page.tsx");
    expect(shell).toContain("demoCoursePath(course.id)");
    expect(shell).toContain("return `/courses/${encodeURIComponent(courseId)}`");
    expect(shell).not.toContain("Mode demo");
    expect(dashboard).toContain("demoCoursePath(content.course.id)");
    expect(detail).toContain("const nextPath = demoCoursePath(content.course.id)");
    for (const component of [
      "components/demo/demo-article-view.tsx",
      "components/demo/demo-diktat-view.tsx",
      "components/demo/demo-flashcards.tsx",
      "components/demo/demo-quiz.tsx",
      "components/demo/demo-zyra.tsx",
    ]) {
      expect(source(component)).not.toMatch(/DemoAuthCta nextPath="\/demo/);
    }
  });
});

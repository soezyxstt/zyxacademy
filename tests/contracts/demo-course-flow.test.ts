import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("public demo course contract", () => {
  test("resolves allowlisted active courses and published first-chapter products", () => {
    const resolver = source("lib/demo/legacy-eligibility.ts");
    const publicData = source("app/(marketing)/demo/demo-data.ts");
    expect(publicData).toContain("getPublicDemoSnapshots()");
    expect(publicData).toContain("resolvePublicFreeFirstChapter(row.snapshot.courseId, selection)");
    expect(resolver).toContain('eq(mataKuliah.status, "active")');
    expect(resolver).toContain("if (rows.length !== 1) return null");
    expect(resolver).toContain("if (mappedRows.length !== 1 || mappedRows[0]?.id !== row.id) return null");
    expect(resolver).toContain("if (legacyRows.length !== 1) return null");
    for (const product of ["artikel", "diktatMateri", "setFlashcard", "flashcard", "soal"]) {
      expect(resolver).toContain(`eq(${product}.status, "published")`);
    }
    expect(resolver).toContain("fetchSharedCanonicalArticle(course.id, record.id)");
    expect(resolver).toContain("chapterNumber: chapter.orderIndex");
    expect(resolver).not.toContain("chapter.orderIndex + 1");
  });

  test("keeps the public route noindex and shows a safe empty state", () => {
    const dashboard = source("app/(marketing)/demo/page.tsx");
    const detail = source("app/(marketing)/demo/[view]/page.tsx");
    const empty = source("components/demo/demo-empty-state.tsx");
    expect(dashboard).toContain("noIndex: true");
    expect(detail).toContain("noIndex: true");
    const metadata = source("lib/site.ts");
    expect(metadata).toMatch(/noIndex[\s\S]*index: false[\s\S]*follow: false/);
    expect(dashboard).toContain("if (!experiences.length) return <DemoEmptyState />");
    expect(detail).toContain("if (!defaults.length) return <DemoEmptyState />");
    expect(empty).toContain('t("demo.emptyTitle")');
    expect(JSON.parse(source("messages/id/marketing.json")).demo.emptyTitle).toBe("Demo belum tersedia");
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
    const adapter = source("lib/demo/assessment/quiz.ts");
    expect(adapter).toContain('fetch("/api/demo/quiz"');
    expect(adapter).toContain("questionSetToken");
    expect(quiz).toContain("QuizPlayer");
    expect(quiz).toContain("DemoQuizResults");
    expect(data).toContain("quiz: pieces.quiz.map(({ id, prompt, options, multiple })");
    expect(data).toContain("matchesDemoQuizScope(value, expected)");
    expect(data).toContain("timingSafeEqual(actual, wanted)");
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
    expect(source("components/landing/landing-hero.tsx")).toContain('<LocalizedPublicLink href="/demo">{t("home.tryDemo")}</LocalizedPublicLink>');
    expect(source("components/landing/landing-closing-cta.tsx")).toContain('<LocalizedPublicLink href="/demo">{t("home.tryDemo")}</LocalizedPublicLink>');
    expect(JSON.parse(source("messages/id/marketing.json")).home.tryDemo).toBe("Coba demo");
    const plans = source("lib/plan-tiers.ts");
    expect(plans).toContain("Bab pertama di setiap mata kuliah");
    expect(plans).toContain("Diktat dapat dibaca, tanpa unduhan");
    expect(plans).toContain("1 pertanyaan Zyra per hari");
    expect(source("components/landing/landing-faq.tsx")).toContain('"faq.preview"');
    expect(JSON.parse(source("messages/id/marketing.json")).faq.preview.question).toBe("Bisa melihat fitur sebelum membuat akun?");
  });

  test("returns demo visitors to the selected course after sign-in", () => {
    const shell = source("components/demo/demo-shell.tsx");
    const detail = source("app/(marketing)/demo/[view]/page.tsx");
    expect(source("lib/demo/routes.ts")).toContain("return `/courses/${encodeURIComponent(courseId)}`");
    expect(shell).not.toContain("Mode demo");
    expect(shell).toContain("demoSignInHref(nextPath)");
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

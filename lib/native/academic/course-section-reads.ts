import "server-only";
import { getCourseDetailData, getCourseSettingsData } from "@/app/(admin)/admin/(academic)/courses/actions";
import { getCourseFlashcardsData } from "@/app/(admin)/admin/(academic)/courses/flashcard-actions";
import { loadMaterialWorkspaceData } from "@/app/(admin)/admin/(academic)/materials/data";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { matchesCourseIdentity, resolveCourseIdentity } from "@/lib/admin/course-identity";
import { listAdminCourseMaterials } from "@/lib/admin/course-material-preview";
import { readAdminQuizInsight } from "@/lib/admin/quiz-insight-read-model";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { isAdminCourseLiveSection, type AdminCourseSectionResult, type CourseDocumentRow } from "@/packages/native-parity/academic/courses/sections";

const documentCategories = { materi: "Materi", soal: "Soal", solusi: "Pembahasan", diktat: "Diktat" };
const quizCategories = { daily: "Harian", weekly: "Mingguan", chapter: "Bab", premium: "Premium", simulation: "Simulasi" };

function documentRow(row: CourseMaterial): CourseDocumentRow {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    category: row.docCategory ? documentCategories[row.docCategory] : row.kind === "pdf" ? "PDF" : "Materi",
    tab: row.tabGroup ?? (row.kind === "pdf" ? "pdf" : "materi"),
    chapterIds: [...new Set([...(row.chapterIds ?? []), ...(row.chapterId ? [row.chapterId] : [])])],
    status: row.status ?? null,
    year: row.year ?? null,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function indices(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item) && item >= 0) : [];
}

/** Same authorization and underlying readers used by the browser course routes. */
export async function readAdminCourseSection(slug: string, section: string, itemId?: string): Promise<AdminCourseSectionResult | null> {
  const { user } = await assertAdmin();
  if (!isAdminCourseLiveSection(section, itemId)) return null;
  const identity = await resolveCourseIdentity(slug);
  if (!identity) return null;
  const course = { id: identity.primaryId, slug: identity.slug, title: identity.title, category: identity.category };

  if (section === "analytics" && itemId) {
    const result = await readAdminQuizInsight(itemId, user.id, identity.allIds);
    if (!result) return null;
    const { template, summary, questionAnalysis, latestAiInsight } = result;
    const { scoreRanges, ...metrics } = summary;
    return {
      type: "quiz-insight",
      course,
      quiz: { id: template.id, title: template.title, category: quizCategories[template.category], status: template.status },
      summary: { ...metrics, scoreRanges: Object.values(scoreRanges) },
      questions: questionAnalysis.map((row) => ({
        questionId: row.questionId, prompt: row.prompt, options: strings(row.options), correctIndices: indices(row.correctIndices),
        totalAnswers: row.totalAnswers, accuracyRate: row.accuracyRate, optionCounts: row.optionCounts,
      })),
      latestInsight: latestAiInsight ? { summary: latestAiInsight.summary, sampleSize: latestAiInsight.sampleSize } : null,
    };
  }

  if (section === "settings") {
    const data = await getCourseSettingsData(slug);
    if (!data) return null;
    return {
      type: "settings", course, description: data.description, isDemo: data.isDemo,
      pricing: { category: data.pricing.category, startsAt: data.pricing.startsAt?.toISOString() ?? null, endsAt: data.pricing.endsAt?.toISOString() ?? null },
      demoChecks: (data.demoEligibility?.checks ?? []).map(({ label, ready, count }) => ({ label, ready, count })),
    };
  }

  if (section === "videos") {
    const data = await getCourseVideosData(slug);
    if (!data) return null;
    return {
      type: "videos", course, playlists: data.playlists.map(({ id, title, description, videos }) => ({
        id, title, description, videos: videos.map(({ id, title, description, locked, videoUrl }) => ({
          id, title, description, playable: !locked && Boolean(videoUrl),
        })),
      })),
    };
  }

  if (section === "flashcards") {
    const data = await getCourseFlashcardsData(slug);
    if (!data) return null;
    return {
      type: "flashcards", course,
      chapters: data.chapters.map(({ id, title }) => ({ id, title })),
      sets: data.sets.map(({ id, title, status, chapterId, cards }) => ({
        id, title, status, chapterId, cards: cards.map(({ id, front, back, explanation }) => ({ id, front, back, explanation })),
      })),
    };
  }

  const data = await getCourseDetailData(slug, section === "questions");
  if (!data) return null;
  const chapters = data.chapters.map(({ id, title }) => ({ id, title }));

  if (section === "analytics" || section === "results") {
    const { totalAttempts, avgScore, passRate } = data.stats;
    return {
      type: section, course, stats: { totalAttempts, avgScore, passRate },
      quizzes: data.quizzes.map((quiz) => ({
        id: quiz.id, title: quiz.title, category: quizCategories[quiz.category], status: quiz.status,
        totalAttempts: quiz.totalAttempts, avgScore: quiz.avgScore, passRate: quiz.passRate,
        hasInsight: Boolean(quiz.lastAiInsight),
      })),
    };
  }

  if (section === "documents") {
    const aliases = new Map(data.chapters.flatMap((chapter) => chapter.legacyChapterId ? [[chapter.legacyChapterId, chapter.id]] : []));
    const materials = (await listAdminCourseMaterials(identity)).map((material) => ({
      ...material,
      chapterIds: material.chapterIds?.map((id) => aliases.get(id) ?? id),
      chapterId: material.chapterId ? aliases.get(material.chapterId) ?? material.chapterId : undefined,
    }));
    if (itemId) {
      const matches = materials.filter((material) => material.id === itemId);
      return matches.length === 1 ? { type: "document", course, chapters, document: documentRow(matches[0]) } : null;
    }
    return { type: "documents", course, chapters, documents: materials.map(documentRow) };
  }

  if (section === "review") {
    const workspace = await loadMaterialWorkspaceData({ courseIds: identity.allIds });
    return {
      type: "review", course,
      bundles: [
        ...(workspace.ideaEnabled ? workspace.initialIdeaImports : []).filter((row) => matchesCourseIdentity(row.courseId, identity)).map((row) => ({
          id: row.id, type: "idea" as const, title: row.bundleTitle ?? row.bundleId, subtitle: row.chapterLabel ?? null, status: row.status,
        })),
        ...(workspace.productEnabled ? workspace.initialProductImports : []).filter((row) => matchesCourseIdentity(row.courseId, identity)).map((row) => ({
          id: row.id, type: "product" as const, title: row.bundleTitle ?? row.bundleId, subtitle: row.chapterLabel ?? null, status: row.status,
        })),
      ],
    };
  }

  return {
    type: "questions", course, chapters,
    questions: data.questions.map((question) => ({
      id: question.id, prompt: question.prompt, explanation: question.explanation,
      options: strings(question.options), correctIndices: indices(question.correctIndices),
      chapterId: question.chapterId, difficulty: question.difficulty, origin: question.origin,
    })),
  };
}

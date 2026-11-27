import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { aiQuestionBank, knowledgeObjects, quizTemplates, soal, studentQuizAttempts } from "@/db/schema";
import { getCourseDetailData, getCourseSettingsData } from "@/app/(admin)/admin/(academic)/courses/actions";
import { getCourseFlashcardsData } from "@/app/(admin)/admin/(academic)/courses/flashcard-actions";
import { loadMaterialWorkspaceData } from "@/app/(admin)/admin/(academic)/materials/data";
import { readQuestionDeleteRevisions } from "@/lib/academic/admin-question-delete";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { matchesCourseIdentity, resolveCourseIdentity } from "@/lib/admin/course-identity";
import { readAdminCourseLeaderboard } from "@/lib/admin/leaderboard-course-read-model";
import { listAdminCourseMaterials } from "@/lib/admin/course-material-preview";
import { parseQuizInsight } from "@/packages/academic/quiz-insight";
import { readAdminQuizInsight } from "@/lib/admin/quiz-insight-read-model";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { isAdminCourseLiveSection, type AdminCourseSectionResult, type CourseDocumentRow } from "@/packages/native-parity/academic/courses/sections";

import { flashcardRevision, flashcardSetRevision } from "@/lib/academic/flashcard-admin-revisions";
import { videoEntryRevision, videoPlaylistRevision } from "@/lib/video/catalog-revisions";
import { currentDemoCourse } from "@/lib/demo/course-selection";
import { findAdminCoursePdf } from "./course-pdf";
import { readCoursePdfTitleEdit } from "./course-material-service";
import { readCourseSettingsEditView } from "./course-settings-service";

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
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : "") : [];
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
    const { template, summary, questionAnalysis, latestAiInsight, attemptHeaders } = result;
    const { scoreRanges, ...metrics } = summary;
    return {
      type: "quiz-insight",
      course,
      quiz: { id: template.id, courseId: template.courseId, title: template.title, category: quizCategories[template.category], status: template.status },
      summary: { ...metrics, scoreRanges: Object.values(scoreRanges) },
      questions: questionAnalysis.map((row) => ({
        questionId: row.questionId, prompt: row.prompt, options: strings(row.options), correctIndices: indices(row.correctIndices),
        totalAnswers: row.totalAnswers, accuracyRate: row.accuracyRate, optionCounts: row.optionCounts,
      })),
      attempts: attemptHeaders ?? [],
      latestInsight: latestAiInsight ? { summary: latestAiInsight.summary, sampleSize: latestAiInsight.sampleSize, report: parseQuizInsight(latestAiInsight.insights) } : null,
    };
  }

  if (section === "settings") {
    const [view, data, selected] = await Promise.all([readCourseSettingsEditView(slug), getCourseSettingsData(slug), currentDemoCourse()]);
    if (!view || !data) return null;
    return {
      type: "settings", course: { ...course, title: view.title, category: view.category },
      description: view.description, isDemo: view.isDemo, pricing: view.pricing,
      revision: view.revision, canonicalOnly: view.canonicalOnly,
      demoSelection: view.canonicalId ? { current: selected, eligible: data.demoEligibility?.eligible === true } : undefined,
      demoChecks: (data.demoEligibility?.checks ?? []).map(({ label, ready, count }) => ({ label, ready, count })),
    };
  }

  if (section === "videos") {
    const data = await getCourseVideosData(slug, { includePlayback: false });
    if (!data) return null;
    return {
      type: "videos", course, playlists: data.playlists.map((playlist) => ({
        id: playlist.id, title: playlist.title, description: playlist.description,
        revision: identity.status === "active" ? videoPlaylistRevision(playlist, playlist.videos) : null,
        videos: playlist.videos.map((video) => ({
          id: video.id, title: video.title, description: video.description, playable: !video.locked && Boolean(video.hasSource),
          revision: identity.status === "active" ? videoEntryRevision(video) : null,
        })),
      })),
    };
  }

  if (section === "flashcards") {
    const data = await getCourseFlashcardsData(slug);
    if (!data) return null;
    return {
      type: "flashcards", course,
      writable: identity.status === "active", canCreateSet: identity.status === "active" && Boolean(identity.canonicalId),
      chapters: data.chapters.map(({ id, title, legacyId }) => ({ id, title, legacyId })),
      legacyChapters: data.legacyChapters.map(({ id, title }) => ({ id, title })),
      sets: data.sets.map(set => ({
        id: set.id, title: set.title, status: set.status, chapterId: set.chapterId, projection: set.projection,
        revision: flashcardSetRevision(set), deleteRevision: flashcardSetRevision(set, set.cards),
        cards: set.cards.map(card => ({
          id: card.id, front: card.front, back: card.back, explanation: card.explanation, status: card.status,
          mirrored: card.mirrored, revision: flashcardRevision(card),
        })),
      })),
    };
  }

  const data = await getCourseDetailData(slug, section === "questions");
  if (!data) return null;
  const chapters = data.chapters.map(({ id, title, orderIndex }) => ({ id, title, orderIndex }));

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

  if (section === "leaderboard") {
    const view = await readAdminCourseLeaderboard([
      eq(studentQuizAttempts.status, "completed"),
      inArray(quizTemplates.courseId, identity.allIds),
    ], identity.title);
    return {
      type: "leaderboard", course, participants: view.students.map(student => ({ id: student.studentId, email: student.studentEmail })),
      attempts: view.students.flatMap(({ studentId, studentName, attempts }) =>
        attempts.map(({ id, title, category, score, durationSeconds, submittedAt }) => ({
          id, participantId: studentId, name: studentName, title, category, score, duration: durationSeconds, submittedAt,
        }))),
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
      if (matches.length !== 1) return null;
      const material = matches[0];
      const [titleEdit, pdf] = await Promise.all([
        material.source === "legacy-pdf" ? readCoursePdfTitleEdit(identity, itemId, data.chapters) : null,
        material.kind === "pdf" || material.source === "canonical-diktat" ? findAdminCoursePdf(identity, itemId) : null,
      ]);
      return { type: "document", course, chapters, document: documentRow(material), titleEdit, pdfPreview: Boolean(pdf) };
    }
    return { type: "documents", course, chapters, documents: materials.map(documentRow),
      pdfUpload: identity.status === "active" && Boolean(identity.legacyId) };
  }

  if (section === "review") {
    const workspace = await loadMaterialWorkspaceData({ courseIds: identity.allIds });
    return {
      type: "review", course,
      bundleUpload: { idea: identity.status === "active" && workspace.ideaEnabled, product: identity.status === "active" && workspace.productEnabled },
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

  const chapterIds = new Set(chapters.map(({ id }) => id));
  const aliases = new Map(data.chapters.flatMap(({ id, legacyChapterId }) => legacyChapterId ? [[legacyChapterId, id]] : []));
  const links = await db.select({ questionId: aiQuestionBank.id, canonicalChapterId: soal.babId, legacyChapterId: knowledgeObjects.chapterId })
    .from(aiQuestionBank)
    .leftJoin(soal, and(eq(soal.id, aiQuestionBank.id), inArray(soal.mataKuliahId, identity.allIds)))
    .leftJoin(knowledgeObjects, and(eq(knowledgeObjects.id, aiQuestionBank.knowledgeObjectId), eq(knowledgeObjects.courseId, aiQuestionBank.courseId)))
    .where(inArray(aiQuestionBank.courseId, identity.allIds));
  const chapterByQuestion = new Map(links.flatMap(({ questionId, canonicalChapterId, legacyChapterId }) => {
    const id = canonicalChapterId ?? (legacyChapterId ? aliases.get(legacyChapterId) ?? legacyChapterId : null);
    return id && chapterIds.has(id) ? [[questionId, id]] : [];
  }));
  const deleteRevisions = identity.status === "active" ? await readQuestionDeleteRevisions(db, identity.allIds) : new Map<string, string>();
  return {
    type: "questions", course, chapters,
    questions: data.questions.map((question) => ({
      id: question.id, prompt: question.prompt, explanation: question.explanation,
      sourceEventName: question.sourceEventName, options: strings(question.options), correctIndices: indices(question.correctIndices),
      chapterId: chapterByQuestion.get(question.id) ?? null, difficulty: question.difficulty, origin: question.origin,
      deleteRevision: deleteRevisions.get(question.id),
    })),
  };
}

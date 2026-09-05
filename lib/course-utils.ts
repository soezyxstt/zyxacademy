import { db } from "@/db";
import {
  aiMaterialInstances,
  websiteMaterials,
  diktats,
  progress as progressTable,
  quizTemplates,
  exams,
  studentQuizAttempts,
  submissions,
  user,
  chapters as chaptersTable,
  studentMaterialProgress,
  bab,
  diktatMateri,
} from "@/db/schema";
import { eq, and, desc, notLike, inArray, ne } from "drizzle-orm";
// Fixture imports removed
import { storage } from "@/lib/storage";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";
import { isStudentEnrolled, resolveStudentCourse } from "@/lib/student/course-catalog";

/**
 * True when the user holds an active enrollment for the course. Access control
 * source of truth for course-scoped features (e.g. the Zyra tutor). Validates
 * that the enrollment is active and not expired via `isStudentEnrolled`.
 */
export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  return isStudentEnrolled(userId, courseId);
}

export async function getCourse(id: string) {
  const course = await resolveStudentCourse(id);
  return course
    ? {
        id: course.id,
        canonicalId: course.canonicalId,
        legacyId: course.legacyId,
        title: course.title,
        category: course.category,
        description: course.description,
      }
    : undefined;
}

export async function getCourseMaterials(courseId: string, studentId?: string, preloadedCompletedSet?: Set<string>) {
  const course = await resolveStudentCourse(courseId);
  const legacyCourseId = course?.legacyId ?? courseId;
  const canonicalCourseId = course?.canonicalId;
  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(courseId, studentId);

  // AI material instances (active only ; drafts and archived stay hidden)
  const dbMaterials = await db
    .select({
      id: aiMaterialInstances.id,
      title: aiMaterialInstances.title,
      chapterIds: aiMaterialInstances.chapterIds,
    })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, legacyCourseId), notLike(aiMaterialInstances.title, "[DRAF]%")));

  // Website materials (published AST articles, linked 1:1 with chapters)
  const webMaterials = await db
    .select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      chapterId: websiteMaterials.chapterId,
    })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, legacyCourseId), eq(websiteMaterials.status, "published")));

  // Diktats
  const courseDiktats = await db
    .select({
      id: diktats.id,
      title: diktats.title,
      fileUrl: diktats.fileUrl,
      updatedAt: diktats.updatedAt,
      chapterIds: diktats.chapterIds,
    })
    .from(diktats)
    .where(and(eq(diktats.courseId, legacyCourseId), eq(diktats.status, "ready")));

  const canonicalDiktats = canonicalCourseId
    ? await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          babId: diktatMateri.babId,
          legacyChapterId: bab.legacyChapterId,
          updatedAt: diktatMateri.updatedAt,
        })
        .from(diktatMateri)
        .innerJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(eq(bab.mataKuliahId, canonicalCourseId))
    : [];

  // User progress - bounded to course material IDs or preloaded set to eliminate full table scans (P1-10)
  let completedSet = new Set<string>();
  if (preloadedCompletedSet) {
    completedSet = preloadedCompletedSet;
  } else if (studentId) {
    const courseMaterialIds = [
      ...dbMaterials.map((m) => m.id),
      ...webMaterials.map((m) => m.id),
      ...courseDiktats.map((d) => d.id),
      ...canonicalDiktats.map((d) => d.id),
      ...canonicalArticles.map((a) => a.id),
    ];
    if (courseMaterialIds.length > 0) {
      const progressRecords = await db
        .select({ materialId: progressTable.materialId })
        .from(progressTable)
        .where(
          and(
            eq(progressTable.userId, studentId),
            eq(progressTable.status, "completed"),
            inArray(progressTable.materialId, courseMaterialIds)
          )
        );
      completedSet = new Set(
        progressRecords
          .map((p) => p.materialId)
          .filter((id): id is string => id !== null)
      );
    }
  }

  const canonicalChapterIds = new Set(
    canonicalArticles.flatMap((article) => [article.babId, article.chapterId, article.legacyChapterId].filter((id): id is string => Boolean(id))),
  );
  const canonicalDiktatChapterIds = new Set(
    canonicalDiktats.flatMap((diktat) => [diktat.babId, diktat.legacyChapterId].filter((id): id is string => Boolean(id))),
  );

  const mappedCanonicalArticles = canonicalArticles.map((article) => ({
    id: article.id,
    courseId,
    chapterId: article.chapterId,
    title: article.title,
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: `${article.totalEstimatedReadingMinutes} menit baca`,
    completed: article.completed || completedSet.has(article.id),
    completionPercent: completedSet.has(article.id) ? 100 : article.completionPercent,
    isPastYear: false,
    isPreview: false,
  }));

  const mappedCanonicalDiktats = canonicalDiktats.map((diktat) => ({
    id: diktat.id,
    courseId,
    chapterId: diktat.legacyChapterId ?? diktat.babId,
    title: diktat.title,
    kind: "article" as const,
    docCategory: "diktat" as const,
    fileSize: "Diktat canonical",
    completed: completedSet.has(diktat.id),
    completionPercent: completedSet.has(diktat.id) ? 100 : 0,
    isPastYear: false,
    isPreview: false,
  }));

  const mappedDiktats = courseDiktats.filter((diktat) => {
    const chapterIds = Array.isArray(diktat.chapterIds) ? diktat.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalDiktatChapterIds.has(chapterId));
  }).map((d) => ({
    id: d.id,
    courseId,
    title: d.title,
    kind: "pdf" as const,
    docCategory: "diktat" as const,
    fileSize: "PDF File",
    completed: completedSet.has(d.id),
    isPastYear: false,
    isPreview: true,
    url: d.fileUrl ? storage.getUrl(d.fileUrl) : undefined,
  }));

  const mappedDb = dbMaterials.filter((material) => {
    const chapterIds = Array.isArray(material.chapterIds) ? material.chapterIds : [];
    return !chapterIds.some((chapterId) => canonicalChapterIds.has(chapterId));
  }).map((m) => ({
    id: m.id,
    courseId,
    title: m.title.replace(/^\[DRAF\]\s*/, ""),
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Disusun otomatis",
    completed: completedSet.has(m.id),
    isPastYear: false,
    isPreview: true,
  }));

  const mappedWeb = webMaterials.filter((material) => !canonicalChapterIds.has(material.chapterId)).map((m) => ({
    id: m.id,
    courseId,
    chapterId: m.chapterId,
    title: m.title,
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Disusun otomatis",
    completed: completedSet.has(m.id),
    isPastYear: false,
    isPreview: true,
  }));

  return [...mappedCanonicalArticles, ...mappedCanonicalDiktats, ...mappedDiktats, ...mappedDb, ...mappedWeb];
}

export type ChapterOutlineItem = {
  id: string;
  title: string;
  orderIndex: number;
  materialId: string | null;
  hasMaterial: boolean;
  completed: boolean;
  completionPercent: number;
};

/**
 * Published chapters for a course, each linked to its published website
 * material (if any) and the student's completion state. Powers the course
 * overview syllabus outline. Returns [] when the course has no published
 * chapters yet.
 */
export async function getCourseChapterOutline(
  courseId: string,
  studentId?: string
): Promise<ChapterOutlineItem[]> {
  const course = await resolveStudentCourse(courseId);
  const legacyCourseId = course?.legacyId ?? courseId;
  const canonicalRows = course?.canonicalId
    ? await db
        .select({
          id: bab.id,
          legacyChapterId: bab.legacyChapterId,
          title: bab.title,
          orderIndex: bab.orderIndex,
        })
        .from(bab)
        .where(and(eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active")))
        .orderBy(bab.orderIndex)
    : [];
  const legacyRows = await db
    .select({ id: chaptersTable.id, title: chaptersTable.title, orderIndex: chaptersTable.orderIndex })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.courseId, legacyCourseId), eq(chaptersTable.status, "published")))
    .orderBy(chaptersTable.orderIndex);
  const chapterRows = canonicalRows.length > 0
    ? canonicalRows.map((chapter) => ({
        id: chapter.legacyChapterId ?? chapter.id,
        canonicalId: chapter.id,
        title: chapter.title,
        orderIndex: chapter.orderIndex,
      }))
    : legacyRows.map((chapter) => ({ ...chapter, canonicalId: null }));

  if (chapterRows.length === 0) return [];

  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(courseId, studentId);
  const canonicalByChapter = new Map<string, (typeof canonicalArticles)[number]>();
  for (const article of canonicalArticles) {
    for (const chapterId of [article.babId, article.chapterId, article.legacyChapterId]) {
      if (chapterId && !canonicalByChapter.has(chapterId)) canonicalByChapter.set(chapterId, article);
    }
  }

  const webRows = await db
    .select({ id: websiteMaterials.id, chapterId: websiteMaterials.chapterId })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, legacyCourseId), eq(websiteMaterials.status, "published")));

  const materialByChapter = new Map(webRows.map((w) => [w.chapterId, w.id]));

  const completedSet = new Set<string>();
  const percentByMaterial = new Map<string, number>();

  if (studentId) {
    if (webRows.length > 0) {
      const matIds = webRows.map((w) => w.id);
      const progRows = await db
        .select({
          materialId: studentMaterialProgress.materialId,
          completionPercent: studentMaterialProgress.completionPercent,
        })
        .from(studentMaterialProgress)
        .where(
          and(
            eq(studentMaterialProgress.studentId, studentId),
            inArray(studentMaterialProgress.materialId, matIds)
          )
        );
      for (const p of progRows) {
        percentByMaterial.set(p.materialId, p.completionPercent);
        if (p.completionPercent >= 90) completedSet.add(p.materialId);
      }
    }
    const legacyRows = await db
      .select({ materialId: progressTable.materialId })
      .from(progressTable)
      .where(and(eq(progressTable.userId, studentId), eq(progressTable.status, "completed")));
    for (const l of legacyRows) {
      if (l.materialId) completedSet.add(l.materialId);
    }
  }

  return chapterRows.map((c) => {
    const legacyChapterId = c.canonicalId ? canonicalRows.find((chapter) => chapter.id === c.canonicalId)?.legacyChapterId : c.id;
    const canonicalArticle = canonicalByChapter.get(c.canonicalId ?? c.id) ?? (legacyChapterId ? canonicalByChapter.get(legacyChapterId) : undefined);
    const materialId = canonicalArticle?.id ?? materialByChapter.get(c.id) ?? null;
    if (canonicalArticle) {
      const completed = canonicalArticle.completed || completedSet.has(canonicalArticle.id);
      return {
        id: c.id,
        title: c.title,
        orderIndex: c.orderIndex,
        materialId,
        hasMaterial: true,
        completed,
        completionPercent: completed ? 100 : canonicalArticle.completionPercent,
      };
    }
    const completed = materialId ? completedSet.has(materialId) : false;
    const completionPercent = materialId
      ? percentByMaterial.get(materialId) ?? (completed ? 100 : 0)
      : 0;
    return {
      id: c.id,
      title: c.title,
      orderIndex: c.orderIndex,
      materialId,
      hasMaterial: Boolean(materialId),
      completed,
      completionPercent,
    };
  });
}

export async function getCourseQuizzes(courseId: string) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.courseId, compatibilityCourseId))
    .orderBy(desc(quizTemplates.createdAt));

  const mappedQuizzes = templates.map((t) => ({
    id: t.id,
    courseId,
    title: t.title,
    type: "quiz" as const,
    status: "published" as const,
    settings: {
      timeLimitMinutes: t.timeLimitSeconds ? Math.floor(t.timeLimitSeconds / 60) : 15,
      maxAttempts: t.maxAttempts || 3
    },
    questions: [],
  }));

  return mappedQuizzes;
}

export async function getCourseTryouts(courseId: string) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const dbTryouts = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, compatibilityCourseId), eq(exams.type, "tryout"), eq(exams.status, "published")));

  const mappedTryouts = dbTryouts.map((t) => {
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    return {
      id: t.id,
      courseId,
      title: t.title,
      type: "tryout" as const,
      status: t.status,
      settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
      questions: [],
    };
  });

  return mappedTryouts;
}

export async function getCourseSubmissions(courseId: string, studentId?: string) {
  if (!studentId) {
    return [];
  }
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;

  const dbAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      title: quizTemplates.title,
      status: studentQuizAttempts.status,
      score: studentQuizAttempts.score,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(studentQuizAttempts.status, "completed")
      )
    );

  const dbTryouts = await db
    .select({
      id: submissions.id,
      title: exams.title,
      status: submissions.status,
      score: submissions.score,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .where(
      and(
        eq(submissions.userId, studentId),
        eq(exams.courseId, compatibilityCourseId)
      )
    );

  const mappedSubmissions = [
    ...dbAttempts.map(a => ({
      id: a.id,
      courseId,
      examId: a.id,
      examTitle: a.title,
      examType: "quiz" as const,
      status: a.status === "completed" ? ("graded" as const) : ("pending_review" as const),
      score: a.score,
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : new Date().toISOString(),
    })),
    ...dbTryouts.map(t => ({
      id: t.id,
      courseId,
      examId: t.id,
      examTitle: t.title,
      examType: "tryout" as const,
      status: t.status as any,
      score: t.score,
      submittedAt: t.submittedAt ? t.submittedAt.toISOString() : new Date().toISOString(),
    }))
  ];

  return mappedSubmissions;
}

export async function getCourseLeaderboard(
  courseId: string,
  filterType: "quiz" | "simulation" | "all" = "quiz"
) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const categoryCondition =
    filterType === "simulation"
      ? eq(quizTemplates.category, "simulation")
      : filterType === "quiz"
      ? ne(quizTemplates.category, "simulation")
      : undefined;

  // Fetch total published quizzes for the course to calculate proper averages
  const courseQuizzes = await db
    .select({ id: quizTemplates.id })
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(quizTemplates.status, "published"),
        categoryCondition
      )
    );
  const totalQuizzes = Math.max(1, courseQuizzes.length);

  // Fetch all completed attempts for the course
  const attempts = await db
    .select({
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(
      and(
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(studentQuizAttempts.status, "completed"),
        categoryCondition
      ),
    );

  const studentData: Record<string, {
    studentId: string;
    studentName: string;
    attemptsCount: number;
    totalScore: number;
    totalDuration: number;
    correctHardCount: number;
    attemptedMediumCount: number;
  }> = {};

  for (const attempt of attempts) {
    const studentId = attempt.studentId;
    if (!studentData[studentId]) {
      studentData[studentId] = {
        studentId,
        studentName: attempt.studentName || "Siswa",
        attemptsCount: 0,
        totalScore: 0,
        totalDuration: 0,
        correctHardCount: 0,
        attemptedMediumCount: 0,
      };
    }

    const data = studentData[studentId];
    data.attemptsCount++;
    data.totalScore += attempt.score ?? 0;
    data.totalDuration += attempt.durationSeconds ?? 0;

    let questions: any[] = [];
    try {
      questions = typeof attempt.questionsSnapshot === "string"
        ? JSON.parse(attempt.questionsSnapshot)
        : (attempt.questionsSnapshot as any) || [];
      if (!Array.isArray(questions)) questions = [];
    } catch {
      questions = [];
    }

    let answers: Record<string, any> = {};
    try {
      answers = typeof attempt.answersSnapshot === "string"
        ? JSON.parse(attempt.answersSnapshot)
        : (attempt.answersSnapshot as any) || {};
      if (typeof answers !== "object") answers = {};
    } catch {
      answers = {};
    }

    for (const q of questions) {
      const difficulty = q.difficulty || "medium";
      if (difficulty === "hard") {
        const correctIndices = q.correct_indices || q.correctIndices || [];
        const submitted = answers[q.id] ?? [];
        const isCorrect =
          Array.isArray(submitted) &&
          Array.isArray(correctIndices) &&
          submitted.length === correctIndices.length &&
          submitted.every((i) => correctIndices.includes(i));
        if (isCorrect) {
          data.correctHardCount++;
        }
      } else if (difficulty === "medium") {
        data.attemptedMediumCount++;
      }
    }
  }

  const leaderboardList = Object.values(studentData).map((data) => {
    const avgScore = Number((data.totalScore / totalQuizzes).toFixed(1));
    const avgDuration = Number((data.totalDuration / data.attemptsCount).toFixed(1));
    return {
      studentId: data.studentId,
      userId: data.studentId, // legacy/compatibility
      displayName: data.studentName, // legacy/compatibility
      studentName: data.studentName,
      attemptCount: data.attemptsCount,
      attempts: data.attemptsCount, // legacy/compatibility
      avgScore,
      score: avgScore, // legacy/compatibility
      avgDuration,
      correctHardCount: data.correctHardCount,
      attemptedMediumCount: data.attemptedMediumCount,
    };
  });

  // Sort based on:
  // 1. avgScore (descending)
  // 2. avgDuration (ascending)
  // 3. correctHardCount (descending)
  // 4. attemptedMediumCount (descending)
  leaderboardList.sort((a, b) => {
    if (b.avgScore !== a.avgScore) {
      return b.avgScore - a.avgScore;
    }
    if (a.avgDuration !== b.avgDuration) {
      return a.avgDuration - b.avgDuration;
    }
    if (b.correctHardCount !== a.correctHardCount) {
      return b.correctHardCount - a.correctHardCount;
    }
    return b.attemptedMediumCount - a.attemptedMediumCount;
  });

  return leaderboardList.map((item, i) => ({
    ...item,
    rank: i + 1,
  }));
}

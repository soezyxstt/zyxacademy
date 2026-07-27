import { db } from "@/db";
import {
  courses as coursesTable,
  aiMaterialInstances,
  websiteMaterials,
  diktats,
  progress as progressTable,
  quizTemplates,
  exams,
  studentQuizAttempts,
  submissions,
  enrollments,
  user,
  chapters as chaptersTable,
  studentMaterialProgress,
} from "@/db/schema";
import { eq, and, desc, notLike, inArray, ne } from "drizzle-orm";
// Fixture imports removed
import { storage } from "@/lib/storage";

/**
 * True when the user holds an enrollment row for the course. Access control
 * source of truth for course-scoped features (e.g. the Zyra tutor). Mirrors
 * `requirePkaSession`, which checks existence rather than expiry.
 */
export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  if (!userId || !courseId) return false;
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return Boolean(row);
}

export async function getCourse(id: string) {
  const dbCourse = await db.query.courses.findFirst({
    where: eq(coursesTable.id, id),
  });
  if (dbCourse) {
    return {
      id: dbCourse.id,
      title: dbCourse.title,
      category: dbCourse.category,
      description: dbCourse.description || "",
    };
  }
  return undefined;
}

export async function getCourseMaterials(courseId: string, studentId?: string) {
  // AI material instances (active only ; drafts and archived stay hidden)
  const dbMaterials = await db
    .select({
      id: aiMaterialInstances.id,
      title: aiMaterialInstances.title,
    })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, courseId), notLike(aiMaterialInstances.title, "[DRAF]%")));

  // Website materials (published AST articles, linked 1:1 with chapters)
  const webMaterials = await db
    .select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      chapterId: websiteMaterials.chapterId,
    })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, courseId), eq(websiteMaterials.status, "published")));

  // Diktats
  const courseDiktats = await db
    .select({
      id: diktats.id,
      title: diktats.title,
      fileUrl: diktats.fileUrl,
      updatedAt: diktats.updatedAt,
    })
    .from(diktats)
    .where(and(eq(diktats.courseId, courseId), eq(diktats.status, "ready")));

  // User progress
  let completedSet = new Set<string>();
  if (studentId) {
    const progressRecords = await db
      .select({ materialId: progressTable.materialId })
      .from(progressTable)
      .where(and(eq(progressTable.userId, studentId), eq(progressTable.status, "completed")));
    completedSet = new Set(
      progressRecords
        .map((p) => p.materialId)
        .filter((id): id is string => id !== null)
    );
  }

  const mappedDiktats = courseDiktats.map((d) => ({
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

  const mappedDb = dbMaterials.map((m) => ({
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

  const mappedWeb = webMaterials.map((m) => ({
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

  return [...mappedDiktats, ...mappedDb, ...mappedWeb];
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
  const chapterRows = await db
    .select({ id: chaptersTable.id, title: chaptersTable.title, orderIndex: chaptersTable.orderIndex })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.courseId, courseId), eq(chaptersTable.status, "published")))
    .orderBy(chaptersTable.orderIndex);

  if (chapterRows.length === 0) return [];

  const webRows = await db
    .select({ id: websiteMaterials.id, chapterId: websiteMaterials.chapterId })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, courseId), eq(websiteMaterials.status, "published")));

  const materialByChapter = new Map(webRows.map((w) => [w.chapterId, w.id]));

  const completedSet = new Set<string>();
  const percentByMaterial = new Map<string, number>();

  if (studentId && webRows.length > 0) {
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

    const legacyRows = await db
      .select({ materialId: progressTable.materialId })
      .from(progressTable)
      .where(and(eq(progressTable.userId, studentId), eq(progressTable.status, "completed")));
    for (const l of legacyRows) {
      if (l.materialId) completedSet.add(l.materialId);
    }
  }

  return chapterRows.map((c) => {
    const materialId = materialByChapter.get(c.id) ?? null;
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
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.courseId, courseId))
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
  const dbTryouts = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, courseId), eq(exams.type, "tryout"), eq(exams.status, "published")));

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
        eq(quizTemplates.courseId, courseId),
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
        eq(exams.courseId, courseId)
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
        eq(quizTemplates.courseId, courseId),
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
        eq(quizTemplates.courseId, courseId),
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

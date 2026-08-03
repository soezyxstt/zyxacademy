import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  courses,
  diktatMateri,
  enrollments,
  ide,
  mataKuliah,
  pendaftaranMurid,
  pkaRegistrations,
  pkaStageProgress,
  soal,
  studentQuizAttempts,
} from "@/db/schema";
import { getIdeaMasteryWithFallback, resolveIdeaMasteryRecord, type IdeaMasteryRead } from "@/lib/pemahaman/compatibility";
import { stableChecksum } from "@/lib/migrasi/pemetaan-legacy";

export interface MuridIdeaRead {
  id: string;
  code: string;
  version: number;
  title: string;
  status: "published";
  mastery: IdeaMasteryRead;
}

export interface MuridCourseRead {
  id: string;
  canonicalId: string | null;
  title: string;
  enrolledAt: string | null;
  ideas: MuridIdeaRead[];
  products: {
    articles: Array<{ id: string; slug: string; title: string; version: number }>;
    diktatCount: number;
    publishedQuestionCount: number;
  };
}

export interface MuridPkaRead {
  registered: boolean;
  stageProgress: Array<{
    subject: string;
    stage: number;
    status: string;
    bestScore: number | null;
    passed: boolean | null;
    attemptId: string | null;
  }>;
  attemptIds: string[];
}

export interface MuridDashboardReadModel {
  studentId: string;
  courses: MuridCourseRead[];
  pka: MuridPkaRead;
  compatibility: {
    oldRoutesPreserved: true;
    historicalSnapshotsImmutable: true;
    legacyBaselineLabel: "concept-level baseline";
  };
}

export interface MuridIdeaProjectionInput {
  id: string;
  code: string;
  version: number;
  title: string;
  status: string;
  ideaMastery: { skor: number; keyakinan: number; evidenceCount: number; inputWatermark: string; algorithmVersion: string } | null;
  baseline: { masteryScore: number; confidence: number; evidenceCount: number } | null;
  legacyConceptName?: string;
}

export function projectMuridIdeas(rows: readonly MuridIdeaProjectionInput[]): MuridIdeaRead[] {
  return rows
    .filter((row): row is MuridIdeaProjectionInput & { status: "published" } => row.status === "published")
    .map((row) => ({
      id: row.id,
      code: row.code,
      version: row.version,
      title: row.title,
      status: "published",
      mastery: resolveIdeaMasteryRecord({
        idea: row.ideaMastery,
        baseline: row.baseline,
        legacyConceptName: row.legacyConceptName,
      }),
    }));
}

export interface HistoricalAttemptSnapshot {
  id: string;
  status: string;
  score: number | null;
  questionsSnapshot: unknown;
  answersSnapshot: unknown;
}

export function preserveHistoricalAttemptSnapshot(attempt: HistoricalAttemptSnapshot): HistoricalAttemptSnapshot {
  return {
    id: attempt.id,
    status: attempt.status,
    score: attempt.score,
    questionsSnapshot: attempt.questionsSnapshot,
    answersSnapshot: attempt.answersSnapshot,
  };
}

export function comparePkaParity(before: unknown, after: unknown): {
  equal: boolean;
  beforeHash: string;
  afterHash: string;
} {
  const beforeHash = stableChecksum(before);
  const afterHash = stableChecksum(after);
  return { equal: beforeHash === afterHash, beforeHash, afterHash };
}

async function readPka(studentId: string): Promise<MuridPkaRead> {
  const [registration, stageRows, attemptRows] = await Promise.all([
    db.select({ id: pkaRegistrations.id }).from(pkaRegistrations).where(eq(pkaRegistrations.userId, studentId)).limit(1),
    db.select({
      subject: pkaStageProgress.subject,
      stage: pkaStageProgress.stage,
      status: pkaStageProgress.status,
      bestScore: pkaStageProgress.bestScore,
      passed: pkaStageProgress.passed,
      attemptId: pkaStageProgress.attemptId,
    }).from(pkaStageProgress).where(eq(pkaStageProgress.studentId, studentId)).orderBy(asc(pkaStageProgress.subject), asc(pkaStageProgress.stage)),
    db.select({ id: studentQuizAttempts.id }).from(studentQuizAttempts).where(eq(studentQuizAttempts.studentId, studentId)),
  ]);
  return {
    registered: registration.length > 0,
    stageProgress: stageRows,
    attemptIds: attemptRows.map((row) => row.id),
  };
}

async function readCourse(studentId: string, course: { id: string; canonicalId: string | null; title: string; enrolledAt: Date | null }): Promise<MuridCourseRead> {
  if (!course.canonicalId) {
    return {
      id: course.id,
      canonicalId: null,
      title: course.title,
      enrolledAt: course.enrolledAt?.toISOString() ?? null,
      ideas: [],
      products: { articles: [], diktatCount: 0, publishedQuestionCount: 0 },
    };
  }

  const [ideaRows, articleRows, diktatRows, questionRows] = await Promise.all([
    db.select({
      id: ide.id,
      code: ide.code,
      version: ide.version,
      title: ide.canonicalStatement,
      status: ide.status,
    }).from(ide).where(and(eq(ide.mataKuliahId, course.canonicalId), eq(ide.status, "published"))).orderBy(asc(ide.code), asc(ide.id)),
    db.select({ id: artikel.id, slug: artikel.slug, title: artikel.title, version: artikel.version }).from(artikel).where(and(eq(artikel.mataKuliahId, course.canonicalId), eq(artikel.status, "published"))).orderBy(asc(artikel.slug)),
    db.select({ id: diktatMateri.id }).from(diktatMateri).where(and(eq(diktatMateri.mataKuliahId, course.canonicalId), eq(diktatMateri.status, "published"))),
    db.select({ id: soal.id }).from(soal).where(and(eq(soal.mataKuliahId, course.canonicalId), eq(soal.status, "published"))),
  ]);

  const ideas = await Promise.all(ideaRows.map(async (row) => ({
    ...row,
    status: "published" as const,
    mastery: await getIdeaMasteryWithFallback(studentId, row.id),
  })));

  return {
    id: course.id,
    canonicalId: course.canonicalId,
    title: course.title,
    enrolledAt: course.enrolledAt?.toISOString() ?? null,
    ideas,
    products: {
      articles: articleRows,
      diktatCount: diktatRows.length,
      publishedQuestionCount: questionRows.length,
    },
  };
}

export async function getMuridDashboardReadModel(studentId: string): Promise<MuridDashboardReadModel> {
  const [canonicalEnrollments, legacyEnrollments, canonicalCourses] = await Promise.all([
    db.select({ id: pendaftaranMurid.id, courseId: pendaftaranMurid.mataKuliahId, enrolledAt: pendaftaranMurid.startAt, title: mataKuliah.title })
      .from(pendaftaranMurid)
      .innerJoin(mataKuliah, eq(pendaftaranMurid.mataKuliahId, mataKuliah.id))
      .where(and(eq(pendaftaranMurid.penggunaId, studentId), inArray(pendaftaranMurid.status, ["active", "completed"]))),
    db.select({ id: enrollments.id, courseId: enrollments.courseId, enrolledAt: enrollments.enrolledAt, title: courses.title })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, studentId)),
    db.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah),
  ]);
  const canonicalByLegacy = new Map(canonicalCourses.filter((course) => course.legacyCourseId).map((course) => [course.legacyCourseId!, course.id]));
  const coursesById = new Map<string, { id: string; canonicalId: string | null; title: string; enrolledAt: Date | null }>();
  for (const row of canonicalEnrollments) {
    coursesById.set(row.courseId, { id: row.courseId, canonicalId: row.courseId, title: row.title, enrolledAt: row.enrolledAt });
  }
  for (const row of legacyEnrollments) {
    if (!coursesById.has(row.courseId)) {
      coursesById.set(row.courseId, { id: row.courseId, canonicalId: canonicalByLegacy.get(row.courseId) ?? null, title: row.title, enrolledAt: row.enrolledAt });
    }
  }

  const coursesRead = await Promise.all([...coursesById.values()].sort((left, right) => left.id.localeCompare(right.id)).map((course) => readCourse(studentId, course)));
  return {
    studentId,
    courses: coursesRead,
    pka: await readPka(studentId),
    compatibility: {
      oldRoutesPreserved: true,
      historicalSnapshotsImmutable: true,
      legacyBaselineLabel: "concept-level baseline",
    },
  };
}

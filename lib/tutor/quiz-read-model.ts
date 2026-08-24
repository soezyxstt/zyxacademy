import { db } from "@/db";
import { quizTemplates, asesmen, pengguna, user, aiQuestionBank, mataKuliah } from "@/db/schema";
import { eq, desc, and, or, inArray } from "drizzle-orm";

export interface TutorQuizWithAttribution {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selectionRules: any;
  openAt: Date | string | null;
  closeAt: Date | string | null;
  manualStatus: "open" | "closed" | "scheduled";
  showDiscussion: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Canonical creator attribution
  creatorId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  creatorRole: string | null;
  assessmentType?: "quiz" | "tryout" | null;
  assessmentStatus?: string | null;
  assessmentVersion?: number | null;
}

async function resolveCandidateCourseIds(
  courseId: string,
  executor: any = db,
): Promise<string[]> {
  const [mk] = await executor
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const candidateCourseIds = [courseId];
  if (mk?.id && !candidateCourseIds.includes(mk.id)) {
    candidateCourseIds.push(mk.id);
  }
  if (mk?.legacyCourseId && !candidateCourseIds.includes(mk.legacyCourseId)) {
    candidateCourseIds.push(mk.legacyCourseId);
  }

  return candidateCourseIds;
}

export async function getTutorQuizzesWithAttribution(
  courseId: string,
  executor: any = db,
): Promise<TutorQuizWithAttribution[]> {
  const candidateCourseIds = await resolveCandidateCourseIds(courseId, executor);

  const rows = await executor
    .select({
      id: quizTemplates.id,
      courseId: quizTemplates.courseId,
      title: quizTemplates.title,
      category: quizTemplates.category,
      visibility: quizTemplates.visibility,
      status: quizTemplates.status,
      timeLimitSeconds: quizTemplates.timeLimitSeconds,
      maxAttempts: quizTemplates.maxAttempts,
      selectionRules: quizTemplates.selectionRules,
      openAt: quizTemplates.openAt,
      closeAt: quizTemplates.closeAt,
      manualStatus: quizTemplates.manualStatus,
      showDiscussion: quizTemplates.showDiscussion,
      createdAt: quizTemplates.createdAt,
      updatedAt: quizTemplates.updatedAt,
      // Canonical asesmen & user fields
      creatorId: asesmen.creatorId,
      creatorName: user.name,
      creatorEmail: user.email,
      creatorRole: user.role,
      assessmentType: asesmen.assessmentType,
      assessmentStatus: asesmen.status,
      assessmentVersion: asesmen.version,
    })
    .from(quizTemplates)
    .leftJoin(asesmen, eq(quizTemplates.id, asesmen.id))
    .leftJoin(pengguna, eq(asesmen.creatorId, pengguna.id))
    .leftJoin(user, eq(pengguna.id, user.id))
    .where(inArray(quizTemplates.courseId, candidateCourseIds))
    .orderBy(desc(quizTemplates.createdAt));

  return rows.map((row: any) => ({
    ...row,
    creatorName: row.creatorName || (row.creatorId ? "Tutor" : "Sistem"),
  }));
}

export async function getTutorQuizWithAttribution(
  courseId: string,
  templateId: string,
  executor: any = db,
): Promise<TutorQuizWithAttribution | null> {
  const candidateCourseIds = await resolveCandidateCourseIds(courseId, executor);

  const rows = await executor
    .select({
      id: quizTemplates.id,
      courseId: quizTemplates.courseId,
      title: quizTemplates.title,
      category: quizTemplates.category,
      visibility: quizTemplates.visibility,
      status: quizTemplates.status,
      timeLimitSeconds: quizTemplates.timeLimitSeconds,
      maxAttempts: quizTemplates.maxAttempts,
      selectionRules: quizTemplates.selectionRules,
      openAt: quizTemplates.openAt,
      closeAt: quizTemplates.closeAt,
      manualStatus: quizTemplates.manualStatus,
      showDiscussion: quizTemplates.showDiscussion,
      createdAt: quizTemplates.createdAt,
      updatedAt: quizTemplates.updatedAt,
      // Canonical asesmen & user fields
      creatorId: asesmen.creatorId,
      creatorName: user.name,
      creatorEmail: user.email,
      creatorRole: user.role,
      assessmentType: asesmen.assessmentType,
      assessmentStatus: asesmen.status,
      assessmentVersion: asesmen.version,
    })
    .from(quizTemplates)
    .leftJoin(asesmen, eq(quizTemplates.id, asesmen.id))
    .leftJoin(pengguna, eq(asesmen.creatorId, pengguna.id))
    .leftJoin(user, eq(pengguna.id, user.id))
    .where(and(eq(quizTemplates.id, templateId), inArray(quizTemplates.courseId, candidateCourseIds)))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    creatorName: row.creatorName || (row.creatorId ? "Tutor" : "Sistem"),
  };
}

export async function getTutorQuestionBank(
  courseId: string,
  executor: any = db,
) {
  const candidateCourseIds = await resolveCandidateCourseIds(courseId, executor);

  return executor
    .select()
    .from(aiQuestionBank)
    .where(inArray(aiQuestionBank.courseId, candidateCourseIds))
    .orderBy(desc(aiQuestionBank.createdAt));
}

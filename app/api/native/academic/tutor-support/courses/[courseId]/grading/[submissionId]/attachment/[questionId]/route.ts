import { and, eq, inArray } from "drizzle-orm";
import { GET as serveStorage } from "@/app/api/storage/file/[...key]/route";
import { db } from "@/db";
import { exams, mataKuliah, submissions } from "@/db/schema";
import { requireNativeQuizWriter } from "@/lib/asesmen/quiz-template-write";
import { getAuthSession } from "@/lib/auth-session";
import { handleTryoutGradeAttachment } from "@/lib/native/academic/assessment/grade-attachment";
import { readStoredTryoutGradeAttachment } from "@/lib/native/academic/grading-snapshot";
import { checkCourseMatch, REVIEWABLE_SUBMISSION_STATUSES } from "@/lib/tutor/assessment-policy";
import type { TryoutGradeAttachment } from "@/packages/academic/tryout-grade-attachment";

export async function GET(request: Request, { params }: { params: Promise<TryoutGradeAttachment> }) {
  return handleTryoutGradeAttachment(request, await params, {
    session: getAuthSession,
    find({ courseId, submissionId, questionId }, viewer) {
      return db.transaction(async tx => {
        const access = await requireNativeQuizWriter(tx, { actorId: viewer.user.id, sessionId: viewer.session.id, courseId, role: "tutor" });
        if (!access.courseId) return null;
        const [mapped] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
          .from(mataKuliah).where(eq(mataKuliah.id, access.courseId)).limit(1).for("share");
        if (!mapped || mapped.status !== "active" || mapped.legacyId !== access.legacyCourseId) return null;
        const [row] = await tx.select({ examId: exams.id, courseId: exams.courseId,
          questions: submissions.questionsSnapshot, answers: submissions.answersSnapshot }).from(submissions)
          .innerJoin(exams, eq(exams.id, submissions.examId)).where(and(
            eq(submissions.id, submissionId), eq(exams.type, "tryout"),
            inArray(exams.status, ["published", "ended"]), inArray(submissions.status, [...REVIEWABLE_SUBMISSION_STATUSES]),
          )).limit(1).for("share");
        if (!row || !checkCourseMatch(row.courseId, access.courseId, access.legacyCourseId)) return null;
        return readStoredTryoutGradeAttachment(row.questions, row.answers, questionId, row.examId);
      });
    },
    download(file, key) {
      return serveStorage(file, { params: Promise.resolve({ key }) });
    },
  });
}

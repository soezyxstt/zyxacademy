import "server-only";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditMutasi, mataKuliah } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { requireNativeQuizWriter } from "@/lib/asesmen/quiz-template-write";
import { buildTutorMutationAuditRow } from "@/lib/audit/mutasi";
import { rejectQuestionVisualReferences } from "@/lib/authoring/question-visual-references";
import { questionBankRevision, writeQuestionBankRecord } from "@/lib/tutor/question-bank-write";
import type { CourseCommandViewer } from "../course-command";
import type { TutorBankWrite } from "./question-bank-command";

export async function writeNativeTutorQuestionBank(courseKey: string, command: TutorBankWrite, requestId: string, viewer: CourseCommandViewer) {
  const actorId = viewer.user.id;
  const receiptId = `native_tutor_bank_${revisionOf([actorId, requestId])}`;
  const digest = revisionOf({ sessionId: viewer.session.id, command });
  const result = await db.transaction(async tx => {
    const access = await requireNativeQuizWriter(tx, { actorId, sessionId: viewer.session.id, courseId: courseKey, role: "tutor" });
    if (access.courseId !== command.courseId || !access.legacyCourseId) throw new Error("COURSE_CHANGED");
    const legacyId = access.legacyCourseId;
    const [course] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
      .from(mataKuliah).where(eq(mataKuliah.id, command.courseId)).limit(1).for("share");
    if (course?.status !== "active" || course.legacyId !== legacyId) throw new Error("COURSE_CHANGED");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptId}, 0))`);
    const [existing] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (existing) {
      const snapshot = existing.afterSnapshot?.snapshot as { requestDigest?: unknown; revision?: unknown } | undefined;
      if (existing.actorId !== actorId || existing.courseId !== command.courseId || existing.outcome !== "success" ||
        snapshot?.requestDigest !== digest || (command.kind === "delete" ? snapshot.revision !== null
          : typeof snapshot.revision !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.revision))) throw new Error("REQUEST_CONFLICT");
      return { questionId: existing.entityId, revision: snapshot.revision as string | null, legacyId };
    }

    if (command.kind !== "delete") rejectQuestionVisualReferences([command.input]);
    const questionId = command.kind === "create" ? `qbk-native-${revisionOf(receiptId).slice(0, 32)}` : command.id;
    const { previous, current } = await writeQuestionBankRecord(tx, {
      id: questionId, courseId: legacyId, allowedCourseIds: [command.courseId, legacyId],
      expectedRevision: command.kind === "create" ? undefined : command.expectedRevision,
    }, command.kind === "delete" ? command : { kind: command.kind, data: command.input });
    const revision = current ? questionBankRevision(current) : null;
    await tx.insert(auditMutasi).values({
      ...buildTutorMutationAuditRow({
        actorId, actorRoles: ["tutor"], courseId: command.courseId, entityType: "question_bank", entityId: questionId,
        entityVersion: 1, action: `question_bank:${command.kind}`, requestId, outcome: "success",
        reason: "Question bank change by tutor",
        before: previous ? { prompt: previous.prompt } : null,
        after: { requestDigest: digest, revision, ...(current ? { prompt: current.prompt, difficulty: current.difficulty, questionType: current.questionType } : {}) },
      }),
      id: receiptId,
    });
    return { questionId, revision, legacyId };
  });
  for (const courseId of new Set([courseKey, command.courseId, result.legacyId])) {
    revalidatePath(`/tutor/${encodeURIComponent(courseId)}/quizzes`);
  }
  return { questionId: result.questionId, revision: result.revision };
}

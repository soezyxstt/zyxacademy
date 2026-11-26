import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { aiQuestionBank, auditMutasi, courses, mataKuliah, questions, session, submissions } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { lockTryoutExam, saveTryoutRecord, selectableTryoutBankCondition, tryoutBankQuestionId, tryoutMetadataRevision, tryoutQuestionSetRevision } from "@/lib/tutor/tryout-authoring";
import { buildTryoutBankSnapshot } from "@/lib/tutor/tryout-bank-snapshot";
import type { TryoutDraftWrite, TryoutQuestionSetWrite } from "@/packages/native-parity/academic/assessment/tryout-draft";
import type { CourseCommandViewer } from "../course-command";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockDraftCourse(tx: Transaction, slug: string, courseId: string, viewer: CourseCommandViewer) {
  const actorId = viewer.user.id;
  await assertAuthoringActor(tx, actorId, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, actorId))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");

  const identity = await resolveCourseIdentity(slug, tx);
  if (!identity || identity.status !== "active" || !identity.legacyId) throw new Error("COURSE_NOT_FOUND");
  if (identity.primaryId !== courseId) throw new Error("COURSE_CHANGED");
  const legacyCourseId = identity.legacyId;
  if (identity.canonicalId) {
    const [canonical] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
      .from(mataKuliah).where(eq(mataKuliah.id, identity.canonicalId)).limit(1).for("share");
    if (!canonical || canonical.status !== "active" || canonical.legacyId !== legacyCourseId) throw new Error("COURSE_CHANGED");
  }
  const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, legacyCourseId)).limit(1).for("share");
  if (!legacy) throw new Error("COURSE_NOT_FOUND");
  return { ...identity, legacyId: legacyCourseId };
}

export async function saveTryoutDraftFromNative(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer) {
  const actorId = viewer.user.id;
  const result = await db.transaction(async (tx) => {
    const identity = await lockDraftCourse(tx, slug, draft.courseId, viewer);
    const legacyCourseId = identity.legacyId;
    const auditRequestId = `req-native-tryout-draft-${revisionOf([actorId, identity.primaryId, examId, requestId])}`;
    const id = examId ?? `exm-native-${revisionOf(auditRequestId).slice(0, 32)}`;

    // Requests to create an exam have no existing row to lock.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${auditRequestId}, 0))`);
    const audit = {
      actorId, actorRoles: ["admin"], courseId: identity.primaryId,
      entityType: "exam", entityId: id, entityVersion: 1, requestId: auditRequestId,
      action: examId ? "tryout:update" : "tryout:create",
      outcome: "success", reason: examId ? "Tryout exam updated by admin" : "Tryout exam created by admin",
    } as const;
    const requestDigest = revisionOf({ draft, legacyCourseId });
    const auditId = buildTutorMutationAuditRow(audit).id;
    const [receipt] = await tx.select({ actorId: auditMutasi.actorId, after: auditMutasi.afterSnapshot })
      .from(auditMutasi).where(eq(auditMutasi.id, auditId)).limit(1);
    if (receipt) {
      const snapshot = receipt.after?.snapshot as Record<string, unknown> | undefined;
      if (receipt.actorId !== actorId || snapshot?.requestDigest !== requestDigest ||
        typeof snapshot?.revision !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.revision)) {
        throw new Error("REQUEST_CONFLICT");
      }
      return { examId: id, revision: snapshot.revision, legacyCourseId };
    }

    const previous = examId ? await lockTryoutExam(tx, legacyCourseId, id) : null;
    if (examId && !previous) throw new Error("TRYOUT_NOT_FOUND");
    if (previous?.status && previous.status !== "draft") throw new Error("TRYOUT_NOT_DRAFT");
    if (previous && tryoutMetadataRevision(previous) !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");

    const saved = await saveTryoutRecord(tx, { id, legacyCourseId, previous }, { ...draft, status: "draft" });
    const revision = tryoutMetadataRevision(saved);
    await recordTutorMutationAudit({
      ...audit,
      before: previous ? { title: previous.title, status: previous.status } : null,
      after: {
        title: saved.title, status: saved.status,
        timeLimitMinutes: draft.timeLimitMinutes, maxAttempts: draft.maxAttempts,
        requestDigest, revision,
      },
    }, tx);
    return { examId: id, revision, legacyCourseId };
  });

  revalidatePath(`/admin/courses/${encodeURIComponent(slug)}/tryouts`);
  revalidatePath(`/courses/${encodeURIComponent(result.legacyCourseId)}/tryout`);
  return { examId: result.examId, revision: result.revision };
}

export async function changeTryoutDraftQuestionsFromNative(slug: string, examId: string, edit: TryoutQuestionSetWrite, requestId: string, viewer: CourseCommandViewer) {
  const actorId = viewer.user.id;
  const result = await db.transaction(async (tx) => {
    const identity = await lockDraftCourse(tx, slug, edit.courseId, viewer);
    const legacyCourseId = identity.legacyId;
    const exam = await lockTryoutExam(tx, legacyCourseId, examId);
    if (!exam) throw new Error("TRYOUT_NOT_FOUND");
    const auditRequestId = `req-native-tryout-questions-${revisionOf([actorId, identity.primaryId, examId, requestId])}`;
    const audit = {
      actorId, actorRoles: ["admin"], courseId: identity.primaryId,
      entityType: "exam", entityId: examId, entityVersion: 1, requestId: auditRequestId,
      action: "tryout_question:manage", outcome: "success", reason: "Bank question selection updated by admin",
    } as const;
    const requestDigest = revisionOf({ edit, legacyCourseId });
    const [receipt] = await tx.select({ actorId: auditMutasi.actorId, after: auditMutasi.afterSnapshot }).from(auditMutasi)
      .where(eq(auditMutasi.id, buildTutorMutationAuditRow(audit).id)).limit(1);
    if (receipt) {
      const snapshot = receipt.after?.snapshot as Record<string, unknown> | undefined;
      if (receipt.actorId !== actorId || snapshot?.requestDigest !== requestDigest ||
        typeof snapshot.revision !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.revision) ||
        typeof snapshot.importedCount !== "number" || typeof snapshot.skippedCount !== "number") {
        throw new Error("REQUEST_CONFLICT");
      }
      return { revision: snapshot.revision, imported: snapshot.importedCount, skipped: snapshot.skippedCount, legacyCourseId };
    }
    if (exam.status !== "draft") throw new Error("TRYOUT_NOT_DRAFT");
    const [attempt] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.examId, examId)).limit(1);
    if (attempt) throw new Error("TRYOUT_HAS_SUBMISSIONS");
    let rows = await tx.select().from(questions).where(eq(questions.examId, examId)).for("update");
    if (tryoutQuestionSetRevision(exam, rows) !== edit.expectedRevision) throw new Error("REVISION_CONFLICT");
    let imported = 0;
    let skipped = 0;
    if (edit.action === "import") {
      const bank = await tx.select().from(aiQuestionBank)
        .where(and(selectableTryoutBankCondition([identity.primaryId, legacyCourseId]), inArray(aiQuestionBank.id, edit.bankIds))).for("share");
      if (bank.length !== edit.bankIds.length) throw new Error("TRYOUT_BANK_CHANGED");
      const rowsById = new Map(bank.map((row) => [row.id, row]));
      const importedIds = new Set(rows.map((row) => tryoutBankQuestionId(row.content)));
      const firstOrder = rows.reduce((highest, row) => Math.max(highest, row.order), 0) + 1;
      const candidates = edit.bankIds.filter((id) => !importedIds.has(id)).map((id) => rowsById.get(id)!);
      if (candidates.length) {
        const values = await Promise.all(candidates.map(async (row, index) => ({
          id: `que-bank-${crypto.randomUUID()}`, examId, type: row.questionType, order: firstOrder + index,
          content: await buildTryoutBankSnapshot(legacyCourseId, row),
        })));
        const added = await tx.insert(questions).values(values).returning();
        rows.push(...added);
        imported = added.length;
      }
      skipped = edit.bankIds.length - imported;
    } else {
      const selected = rows.find((row) => row.id === edit.questionId && tryoutBankQuestionId(row.content));
      if (!selected) throw new Error("TRYOUT_QUESTION_NOT_FOUND");
      await tx.delete(questions).where(and(eq(questions.examId, examId), eq(questions.id, selected.id)));
      rows = rows.filter((row) => row.id !== selected.id);
    }
    const revision = tryoutQuestionSetRevision(exam, rows);
    await recordTutorMutationAudit({
      ...audit, after: {
        operation: edit.action, importedCount: imported, skippedCount: skipped, requestDigest, revision,
        removedQuestionId: edit.action === "remove" ? edit.questionId : null,
      },
    }, tx);
    return { revision, imported, skipped, legacyCourseId };
  });
  revalidatePath(`/admin/courses/${encodeURIComponent(slug)}/tryouts`);
  revalidatePath(`/courses/${encodeURIComponent(result.legacyCourseId)}/tryout/${encodeURIComponent(examId)}`);
  return { examId, revision: result.revision, imported: result.imported, skipped: result.skipped };
}

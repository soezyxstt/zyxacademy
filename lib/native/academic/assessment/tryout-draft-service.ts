import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { aiQuestionBank, auditMutasi, courses, mataKuliah, questions, session, submissions } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { rejectQuestionVisualReferences } from "@/lib/authoring/question-visual-references";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { deleteTryoutRecord, lockTryoutExam, saveTryoutQuestionRecord, saveTryoutRecord, selectableTryoutBankCondition, tryoutBankQuestionId, tryoutMetadataRevision, tryoutQuestionSetRevision } from "@/lib/tutor/tryout-authoring";
import { buildTryoutBankSnapshot } from "@/lib/tutor/tryout-bank-snapshot";
import type { TryoutContentReceipt, TryoutContentWrite, TryoutDraftWrite, TryoutMetadataWrite, TryoutQuestionSetWrite } from "@/packages/native-parity/academic/assessment/tryout-draft";
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

async function persistTryoutMetadata(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer, requestedStatus?: TryoutMetadataWrite["status"]) {
  const statusAware = requestedStatus !== undefined;
  const actorId = viewer.user.id;
  const result = await db.transaction(async (tx) => {
    const identity = await lockDraftCourse(tx, slug, draft.courseId, viewer);
    const legacyCourseId = identity.legacyId;
    const operation = statusAware ? "metadata" : "draft";
    const auditRequestId = `req-native-tryout-${operation}-${revisionOf([actorId, identity.primaryId, examId, requestId])}`;
    const id = examId ?? `exm-native-${revisionOf(auditRequestId).slice(0, 32)}`;

    // Requests to create an exam have no existing row to lock.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${auditRequestId}, 0))`);
    const audit = {
      actorId, actorRoles: ["admin"], courseId: identity.primaryId,
      entityType: "exam", entityId: id, entityVersion: 1, requestId: auditRequestId,
      action: examId ? "tryout:update" : "tryout:create",
      outcome: "success", reason: examId ? "Tryout exam updated by admin" : "Tryout exam created by admin",
    } as const;
    const requestDigest = revisionOf(statusAware ? { draft, requestedStatus, legacyCourseId, sessionId: viewer.session.id } : { draft, legacyCourseId });
    const auditId = buildTutorMutationAuditRow(audit).id;
    const [receipt] = await tx.select({ actorId: auditMutasi.actorId, after: auditMutasi.afterSnapshot })
      .from(auditMutasi).where(eq(auditMutasi.id, auditId)).limit(1);
    if (receipt) {
      const snapshot = receipt.after?.snapshot as Record<string, unknown> | undefined;
      if (receipt.actorId !== actorId || snapshot?.requestDigest !== requestDigest ||
        typeof snapshot?.revision !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.revision)) {
        throw new Error("REQUEST_CONFLICT");
      }
      return { examId: id, revision: snapshot.revision, legacyCourseId, courseId: identity.primaryId };
    }

    const previous = examId ? await lockTryoutExam(tx, legacyCourseId, id) : null;
    if (examId && !previous) throw new Error("TRYOUT_NOT_FOUND");
    if (!statusAware && previous?.status && previous.status !== "draft") throw new Error("TRYOUT_NOT_DRAFT");
    if (previous && tryoutMetadataRevision(previous) !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");

    const saved = await saveTryoutRecord(tx, { id, legacyCourseId, previous }, { ...draft, status: requestedStatus ?? "draft" });
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
    return { examId: id, revision, legacyCourseId, courseId: identity.primaryId };
  });

  revalidatePath(`/admin/courses/${encodeURIComponent(slug)}/tryouts`);
  const affectedCourses = statusAware ? new Set([result.legacyCourseId, result.courseId]) : [result.legacyCourseId];
  for (const courseId of affectedCourses) {
    const course = encodeURIComponent(courseId);
    revalidatePath(`/courses/${course}/tryout`);
    if (statusAware) {
      revalidatePath(`/courses/${course}/tryout/${encodeURIComponent(result.examId)}`);
      revalidatePath(`/tutor/${course}/tryouts`);
    }
  }
  return { examId: result.examId, revision: result.revision };
}

export function saveTryoutDraftFromNative(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer) {
  return persistTryoutMetadata(slug, examId, draft, requestId, viewer);
}

export async function saveTryoutMetadataFromNative(slug: string, examId: string | null, draft: TryoutMetadataWrite, requestId: string, viewer: CourseCommandViewer) {
  const { status, ...fields } = draft;
  return { ...(await persistTryoutMetadata(slug, examId, fields, requestId, viewer, status)), status };
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


export async function writeNativeTryoutContent(slug: string, examId: string, edit: TryoutContentWrite, requestId: string, viewer: CourseCommandViewer):
  Promise<Omit<TryoutContentReceipt, "requestId">> {
  const actorId = viewer.user.id;
  const receiptId = `native_admin_tryout_content_${revisionOf([actorId, requestId])}`;
  const result = await db.transaction(async tx => {
    const identity = await lockDraftCourse(tx, slug, edit.courseId, viewer);
    const legacyCourseId = identity.legacyId;
    const digest = revisionOf({ sessionId: viewer.session.id, examId, legacyCourseId, edit });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptId}, 0))`);
    const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (receipt) {
      const snapshot = receipt.afterSnapshot?.snapshot as { requestDigest?: unknown; questionId?: unknown; revision?: unknown } | undefined;
      if (receipt.actorId !== actorId || snapshot?.requestDigest !== digest) throw new Error("REQUEST_CONFLICT");
      if (edit.action === "delete" && snapshot.revision === null) return { legacyCourseId, revision: null };
      if (edit.action !== "delete" && typeof snapshot.questionId === "string" && typeof snapshot.revision === "string") {
        return { legacyCourseId, questionId: snapshot.questionId, revision: snapshot.revision };
      }
      throw new Error("REQUEST_CONFLICT");
    }

    const exam = await lockTryoutExam(tx, legacyCourseId, examId);
    if (!exam) throw new Error("TRYOUT_NOT_FOUND");
    const rows = await tx.select().from(questions).where(eq(questions.examId, examId)).for("update");
    if (tryoutQuestionSetRevision(exam, rows) !== edit.expectedRevision) throw new Error("REVISION_CONFLICT");
    const audit = { actorId, actorRoles: ["admin"], courseId: edit.courseId, entityVersion: 1, requestId, outcome: "success" as const };
    if (edit.action === "delete") {
      await deleteTryoutRecord(tx, exam);
      await tx.insert(auditMutasi).values({
        ...buildTutorMutationAuditRow({ ...audit, entityType: "exam", entityId: examId, action: "tryout:delete",
          reason: "Tryout exam deleted by admin", before: { title: exam.title }, after: { requestDigest: digest, revision: null } }),
        id: receiptId,
      });
      return { legacyCourseId, revision: null };
    }

    if (edit.action === "delete-question") {
      const [deleted] = await tx.delete(questions).where(and(eq(questions.examId, examId), eq(questions.id, edit.targetId)))
        .returning({ id: questions.id });
      if (!deleted) throw new Error("TRYOUT_QUESTION_NOT_FOUND");
      const revision = tryoutQuestionSetRevision(exam, rows.filter(row => row.id !== deleted.id));
      await tx.insert(auditMutasi).values({
        ...buildTutorMutationAuditRow({ ...audit, entityType: "question", entityId: deleted.id, action: "tryout_question:delete",
          reason: "Tryout question deleted by admin", before: { id: deleted.id },
          after: { requestDigest: digest, questionId: deleted.id, examId, revision } }),
        id: receiptId,
      });
      return { legacyCourseId, questionId: deleted.id, revision };
    }

    rejectQuestionVisualReferences([edit.input]);
    const questionId = edit.targetId ?? `que-native-${revisionOf(receiptId).slice(0, 32)}`;
    const saved = await saveTryoutQuestionRecord(tx, { exam, id: questionId, updating: edit.targetId !== null }, {
      ...edit.input,
      correctIndex: edit.input.type === "multiple_choice" ? edit.input.correctIndices[0] : undefined,
    });
    const revision = tryoutQuestionSetRevision(exam, [...rows.filter(row => row.id !== questionId), saved]);
    await tx.insert(auditMutasi).values({
      ...buildTutorMutationAuditRow({ ...audit, entityType: "question", entityId: questionId,
        action: edit.targetId ? "tryout_question:update" : "tryout_question:create", reason: "Tryout question saved by admin",
        after: { requestDigest: digest, questionId, examId, revision } }),
      id: receiptId,
    });
    return { legacyCourseId, questionId, revision };
  });

  revalidatePath(`/admin/courses/${encodeURIComponent(slug)}/tryouts`);
  for (const id of new Set([edit.courseId, result.legacyCourseId])) {
    const course = encodeURIComponent(id);
    revalidatePath(`/tutor/${course}/tryouts`);
    revalidatePath(`/courses/${course}/tryout`);
    revalidatePath(`/courses/${course}/tryout/${encodeURIComponent(examId)}`);
  }
  return { examId, revision: result.revision, ...(result.questionId ? { questionId: result.questionId } : {}) };
}

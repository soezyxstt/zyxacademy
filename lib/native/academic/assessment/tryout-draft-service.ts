import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditMutasi, courses, mataKuliah, session } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { lockTryoutExam, saveTryoutRecord, tryoutMetadataRevision } from "@/lib/tutor/tryout-authoring";
import type { TryoutDraftWrite } from "@/packages/native-parity/academic/assessment/tryout-draft";
import type { CourseCommandViewer } from "../course-command";

export async function saveTryoutDraftFromNative(slug: string, examId: string | null, draft: TryoutDraftWrite, requestId: string, viewer: CourseCommandViewer) {
  const actorId = viewer.user.id;
  const result = await db.transaction(async (tx) => {
    await assertAuthoringActor(tx, actorId, { roles: ["admin"], error: "FORBIDDEN", lock: true });
    const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
      .where(and(eq(session.id, viewer.session.id), eq(session.userId, actorId))).limit(1).for("share");
    if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");

    const identity = await resolveCourseIdentity(slug, tx);
    if (!identity || identity.status !== "active" || !identity.legacyId) throw new Error("COURSE_NOT_FOUND");
    if (identity.primaryId !== draft.courseId) throw new Error("COURSE_CHANGED");
    const legacyCourseId = identity.legacyId;
    const auditRequestId = `req-native-tryout-draft-${revisionOf([actorId, identity.primaryId, examId, requestId])}`;
    const id = examId ?? `exm-native-${revisionOf(auditRequestId).slice(0, 32)}`;
    if (identity.canonicalId) {
      const [canonical] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
        .from(mataKuliah).where(eq(mataKuliah.id, identity.canonicalId)).limit(1).for("share");
      if (!canonical || canonical.status !== "active" || canonical.legacyId !== legacyCourseId) throw new Error("COURSE_CHANGED");
    }
    const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, legacyCourseId)).limit(1).for("share");
    if (!legacy) throw new Error("COURSE_NOT_FOUND");

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

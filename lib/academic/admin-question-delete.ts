import "server-only";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { aiQuestionBank, auditMutasi, itemAsesmen, itemDiktatPembahasan, mataKuliah, questionReferenceLinks, quizTemplates, soal } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { enqueueQuestionReviewVectorTx } from "@/lib/question-review-lifecycle";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const canonicalFields = { id: soal.id, origin: soal.origin, version: soal.version, status: soal.status, courseId: soal.mataKuliahId, updatedAt: soal.updatedAt };
const compatibilityFields = {
  id: aiQuestionBank.id, origin: aiQuestionBank.origin, reviewStatus: aiQuestionBank.reviewStatus,
  courseId: aiQuestionBank.courseId, updatedAt: aiQuestionBank.updatedAt,
};
type Canonical = Pick<typeof soal.$inferSelect, "id" | "origin" | "version" | "status" | "updatedAt"> & { courseId: string };
type Compatibility = Pick<typeof aiQuestionBank.$inferSelect, keyof typeof compatibilityFields>;

function originalQuestion(canonical?: Canonical, compatibility?: Compatibility) {
  return (!canonical || canonical.origin === "zyx_original") && (!compatibility || compatibility.origin === "zyx_original");
}

function deletionRevision(canonical?: Canonical, compatibility?: Compatibility) {
  return revisionOf({ canonical, compatibility });
}

export async function readQuestionDeleteRevisions(source: Pick<typeof db, "select">, courseIds: string[]) {
  const [canonical, compatibility] = await Promise.all([
    source.select(canonicalFields).from(soal).where(inArray(soal.mataKuliahId, courseIds)),
    source.select(compatibilityFields).from(aiQuestionBank).where(inArray(aiQuestionBank.courseId, courseIds)),
  ]);
  const canonicalById = new Map(canonical.map(row => [row.id, row]));
  return new Map(compatibility.flatMap(row => {
    const canonical = canonicalById.get(row.id);
    return originalQuestion(canonical, row) ? [[row.id, deletionRevision(canonical, row)] as const] : [];
  }));
}

export async function deleteAdminQuestionTx(tx: Tx, input: { id: string; actorId: string; expectedRevision?: string; courseIds?: string[] }) {
  const { id, actorId, courseIds, expectedRevision } = input;
  const [canonical] = await tx.select(canonicalFields).from(soal).where(eq(soal.id, id)).limit(1).for("update");
  const [compatibility] = await tx.select(compatibilityFields).from(aiQuestionBank).where(eq(aiQuestionBank.id, id)).limit(1).for("update");
  if (courseIds && ((!canonical && !compatibility) || (canonical && !courseIds.includes(canonical.courseId)) ||
    (compatibility && !courseIds.includes(compatibility.courseId)))) throw new Error("QUESTION_NOT_FOUND");
  if (!canonical && !compatibility) return null;
  if (!originalQuestion(canonical, compatibility)) throw new Error("HISTORICAL_QUESTION_IMMUTABLE");
  if (expectedRevision !== undefined && deletionRevision(canonical, compatibility) !== expectedRevision) throw new Error("REVISION_CONFLICT");

  const [fixedQuiz] = await tx.select({ id: quizTemplates.id }).from(quizTemplates).where(sql`${quizTemplates.selectionRules} @> jsonb_build_object('fixedQuestionIds', jsonb_build_array(${id}::text)) or
    ${quizTemplates.selectionRules} @> jsonb_build_object('fixed_question_ids', jsonb_build_array(${id}::text)) or
    ${quizTemplates.selectionRules} @> jsonb_build_object('questionIds', jsonb_build_array(${id}::text)) or
    ${quizTemplates.selectionRules} @> jsonb_build_object('question_ids', jsonb_build_array(${id}::text))`).limit(1);
  if (fixedQuiz) throw new Error("DEPENDENCIES_EXIST");
  if (canonical) {
    const [assessmentItem] = await tx.select({ id: itemAsesmen.id }).from(itemAsesmen).where(eq(itemAsesmen.soalId, id)).limit(1);
    const [documentItem] = await tx.select({ id: itemDiktatPembahasan.id }).from(itemDiktatPembahasan).where(eq(itemDiktatPembahasan.soalId, id)).limit(1);
    const [reference] = await tx.select({ id: questionReferenceLinks.id }).from(questionReferenceLinks).where(eq(questionReferenceLinks.referenceQuestionId, id)).limit(1);
    if (assessmentItem || documentItem || reference) throw new Error("DEPENDENCIES_EXIST");
  }

  const [course] = !compatibility && canonical ? await tx.select({ legacyId: mataKuliah.legacyCourseId }).from(mataKuliah)
    .where(eq(mataKuliah.id, canonical.courseId)).limit(1) : [];
  const legacyId = compatibility?.courseId ?? course?.legacyId ?? null;
  await tx.insert(auditMutasi).values({
    id: `audit-question-delete-${id}-${randomUUID()}`, actorId, entityType: "question", entityId: id,
    action: "deleted", correlationId: id,
    beforeSnapshot: canonical
      ? { version: canonical.version, status: canonical.status, courseId: canonical.courseId }
      : { reviewStatus: compatibility?.reviewStatus, courseId: compatibility?.courseId },
    afterSnapshot: null,
  });
  if (legacyId) await enqueueQuestionReviewVectorTx(tx, { id, courseId: legacyId, version: canonical?.version ?? 1, reviewStatus: "retired", prompt: "" });
  if (compatibility) await tx.delete(aiQuestionBank).where(eq(aiQuestionBank.id, id));
  if (canonical) await tx.delete(soal).where(eq(soal.id, id));
  return { legacyId };
}

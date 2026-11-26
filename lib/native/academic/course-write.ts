import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, session } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import type { CourseCommandViewer } from "./course-command";

export type CourseWriteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Saved = { id: string; canonicalCourseId: string; legacyCourseId?: string; legacyChapterId?: string };

async function assertAuthority(tx: CourseWriteTransaction, viewer: CourseCommandViewer) {
  await assertAuthoringActor(tx, viewer.user.id, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, viewer.user.id))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
}

export async function courseWrite<T extends object>({
  slug, targetId, draft, requestId, viewer, entityType, action, write, validateReplay,
}: {
  slug: string;
  targetId?: string;
  draft: T;
  requestId: string;
  viewer: CourseCommandViewer;
  entityType: "native_course_settings" | "native_course_chapter" | "native_course_material" | "native_course_management" | "native_chapter_management" | "native_course_video" | "native_course_flashcard" | "native_course_question";
  action: "create" | "update" | "archive" | "reorder" | "delete";
  write(tx: CourseWriteTransaction): Promise<Saved>;
  validateReplay(tx: CourseWriteTransaction, result: Saved): Promise<void>;
}) {
  const receiptScope = (entityType === "native_course_material" && action === "delete") || entityType === "native_course_management" || entityType === "native_chapter_management" || entityType === "native_course_video" || entityType === "native_course_flashcard" || entityType === "native_course_question"
    ? { sessionHash: revisionOf(viewer.session.id) } : {};
  const receiptId = `native_course_${revisionOf({ actorId: viewer.user.id, requestId })}`;
  const inputHash = revisionOf({ slug, targetId, draft });
  async function findReceipt(tx: CourseWriteTransaction) {
    const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (!receipt) return null;
    const result = receipt.afterSnapshot?.result;
    if (receipt.entityType !== entityType || receipt.action !== action || receipt.actorId !== viewer.user.id ||
      receipt.afterSnapshot?.inputHash !== inputHash || receipt.afterSnapshot?.sessionHash !== receiptScope.sessionHash ||
      !isSaved(result)) throw new Error("REQUEST_CONFLICT");
    await validateReplay(tx, result);
    return result;
  }

  function writeOnce() {
    return db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      const previous = await findReceipt(tx);
      if (previous) return previous;
      const result = await write(tx);
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId: viewer.user.id, entityType, action, correlationId: requestId, outcome: "success",
        entityId: entityType === "native_course_settings" ? result.canonicalCourseId : result.id,
        courseId: result.canonicalCourseId,
        beforeSnapshot: "expectedRevision" in draft ? { expectedRevision: draft.expectedRevision } : null,
        afterSnapshot: { inputHash, result, ...receiptScope },
      });
      return result;
    }, { isolationLevel: "serializable" });
  }

  try {
    return await writeOnce().catch((error: unknown) => {
      if (!retryableTransactionFault(postgresCode(error))) throw error;
      return writeOnce();
    });
  } catch (error) {
    const fault = postgresCode(error);
    if (fault !== "23505" && !retryableTransactionFault(fault)) throw error;
    const raced = await db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      return findReceipt(tx);
    });
    if (raced) return raced;
    if (fault === "23505") throw new Error("REVISION_CONFLICT");
    throw error;
  }
}

function retryableTransactionFault(code: string | undefined) {
  return code === "40001" || code === "40P01";
}

function isSaved(value: unknown): value is Saved {
  return Boolean(value && typeof value === "object" && "id" in value && typeof value.id === "string" &&
    "canonicalCourseId" in value && typeof value.canonicalCourseId === "string" &&
    (!("legacyCourseId" in value) || typeof value.legacyCourseId === "string") &&
    (!("legacyChapterId" in value) || typeof value.legacyChapterId === "string"));
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}

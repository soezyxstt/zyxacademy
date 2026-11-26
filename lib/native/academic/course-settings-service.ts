import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, courses, mataKuliah, session } from "@/db/schema";
import { saveCourseWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import type { AdminCourseEditDraft } from "@/packages/native-parity/academic/courses/edit-contract";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Viewer = { user: { id: string }; session: { id: string } };
const receiptType = "native_course_settings";

async function readSettings(slug: string, tx: Transaction) {
  const identity = await resolveCourseIdentity(slug, tx);
  if (!identity || identity.status !== "active") return null;
  const [legacy, canonical] = await Promise.all([
    identity.legacyId ? tx.select().from(courses).where(eq(courses.id, identity.legacyId)).limit(1).then((rows) => rows[0]) : null,
    identity.canonicalId ? tx.select().from(mataKuliah).where(eq(mataKuliah.id, identity.canonicalId)).limit(1).then((rows) => rows[0]) : null,
  ]);
  if (!legacy && !canonical) return null;
  return {
    ...identity,
    canonicalOnly: !legacy,
    revision: revisionOf({ legacy, canonical }),
    isDemo: canonical?.isDemo ?? false,
    pricing: {
      category: canonical?.pricingCategory ?? "premium",
      startsAt: canonical?.freeStartsAt?.toISOString() ?? null,
      endsAt: canonical?.freeEndsAt?.toISOString() ?? null,
    },
  };
}

export function readCourseSettingsEditView(slug: string) {
  return db.transaction((tx) => readSettings(slug, tx), { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function assertAuthority(tx: Transaction, viewer: Viewer) {
  await assertAuthoringActor(tx, viewer.user.id, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [activeSession] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, viewer.user.id))).limit(1).for("share");
  if (!activeSession || activeSession.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
}

type SavedCourse = { id: string; canonicalCourseId: string };
type Receipt = typeof auditMutasi.$inferSelect;

function isSavedCourse(value: unknown): value is SavedCourse {
  return Boolean(value && typeof value === "object" && "id" in value && typeof value.id === "string" &&
    "canonicalCourseId" in value && typeof value.canonicalCourseId === "string");
}

export async function updateCourseSettingsFromNative(slug: string, draft: AdminCourseEditDraft, requestId: string, viewer: Viewer) {
  const receiptId = `native_course_${revisionOf({ actorId: viewer.user.id, requestId })}`;
  const inputHash = revisionOf({ slug, draft });

  function receiptResult(receipt: Receipt | undefined) {
    if (!receipt) return null;
    const result = receipt.afterSnapshot?.result;
    if (receipt.entityType !== receiptType || receipt.actorId !== viewer.user.id ||
      receipt.afterSnapshot?.inputHash !== inputHash || !isSavedCourse(result)) throw new Error("REQUEST_CONFLICT");
    return result;
  }

  async function findReceipt(tx: Transaction) {
    const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    return receiptResult(receipt);
  }

  let updated: SavedCourse;
  try {
    updated = await db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      const previous = await findReceipt(tx);
      if (previous) return previous;
      const current = await readSettings(slug, tx);
      if (!current) throw new Error("COURSE_NOT_FOUND");
      if (current.revision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (current.canonicalOnly ? draft.category !== "Umum" || Boolean(draft.description) : draft.category === "Umum") {
        throw new Error("COURSE_PROJECTION_UNAVAILABLE");
      }

      const result = await saveCourseWithCanonicalProjection({
        id: current.primaryId, title: draft.title, category: draft.category as Parameters<typeof saveCourseWithCanonicalProjection>[0]["category"],
        description: draft.description, isNew: false, actorId: viewer.user.id,
      }, tx);
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId: viewer.user.id, entityType: receiptType, entityId: result.canonicalCourseId,
        courseId: result.canonicalCourseId, action: "update", correlationId: requestId, outcome: "success",
        beforeSnapshot: { expectedRevision: draft.expectedRevision }, afterSnapshot: { inputHash, result },
      });
      return result;
    }, { isolationLevel: "serializable" });
  } catch (error) {
    const fault = postgresCode(error);
    if (fault !== "40001" && fault !== "23505" && fault !== "40P01") throw error;
    const raced = await db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      return findReceipt(tx);
    });
    if (!raced) throw new Error("REVISION_CONFLICT");
    updated = raced;
  }

  for (const id of new Set([slug, updated.id, updated.canonicalCourseId])) {
    const segment = encodeURIComponent(id);
    revalidatePath(`/admin/courses/${segment}`);
    revalidatePath(`/admin/courses/${segment}/settings`);
    revalidatePath(`/courses/${segment}`);
  }
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  revalidatePath("/dashboard");
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}

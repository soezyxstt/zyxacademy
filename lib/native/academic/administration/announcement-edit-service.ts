import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, pkaAnnouncements, session } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { updatePkaAnnouncementText } from "@/lib/pka/announcement-text";
import { isPkaAnnouncementRevision, type PkaAnnouncementEdit } from "@/packages/academic/pka-announcement-edit";
import { editAnnouncementInTransaction } from "./announcement-edit-transaction";

type Viewer = { user: { id: string }; session: { id: string } };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const auditType = "native_pka_announcement";

async function assertAuthority(tx: Transaction, viewer: Viewer) {
  await assertAuthoringActor(tx, viewer.user.id, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, viewer.user.id))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}

export async function updateNativePkaAnnouncement(id: string, draft: PkaAnnouncementEdit, requestId: string, viewer: Viewer) {
  const actorId = viewer.user.id;
  const receiptId = `native_pka_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  async function write() {
    return db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      return editAnnouncementInTransaction(id, draft, {
        async lockCurrent() {
          const [entry] = await tx.select({ title: pkaAnnouncements.title, body: pkaAnnouncements.body }).from(pkaAnnouncements)
            .where(eq(pkaAnnouncements.id, id)).limit(1).for("update");
          return entry ?? null;
        },
        async receipt() {
          const [entry] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
          if (!entry) return null;
          const inputHash = entry.afterSnapshot?.inputHash;
          const result = entry.afterSnapshot?.result;
          if (entry.entityType !== auditType || entry.actorId !== actorId || typeof inputHash !== "string" || !isPkaAnnouncementRevision(result)) {
            throw new Error("REQUEST_CONFLICT");
          }
          return { inputHash, result };
        },
        async update(text) {
          await updatePkaAnnouncementText(id, text, tx);
        },
        async writeReceipt({ inputHash, result }) {
          await tx.insert(auditMutasi).values({
            id: receiptId, actorId, entityType: auditType, entityId: id, action: "update_text",
            correlationId: requestId, outcome: "success", beforeSnapshot: { expectedRevision: draft.expectedRevision },
            afterSnapshot: { inputHash, result },
          });
        },
      });
    });
  }

  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath("/admin/tutorial-pka/announcements");
    revalidatePath("/courses/tutorial-pka");
  }
  return result;
}

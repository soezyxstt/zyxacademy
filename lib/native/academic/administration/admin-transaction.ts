import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { session } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type NativeAdminViewer = { user: { id: string }; session: { id: string } };

export async function assertNativeAdminTransaction(tx: Transaction, viewer: NativeAdminViewer) {
  await assertAuthoringActor(tx, viewer.user.id, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, viewer.user.id))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
}

export function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}

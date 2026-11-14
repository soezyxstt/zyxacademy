import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditMutasi, session, user } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { hasMcpOAuthConsent } from "@/lib/authoring/mcp-oauth";
import { MCP_MANUAL_CLIENT_ID } from "@/lib/authoring/mcp-auth";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";

export class AdminMcpError extends Error {
  constructor(public code: string) { super(code); }
}
export { revisionOf } from "./revision";
import { revisionOf } from "./revision";
export type AdminTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const environment = () => mcpEnvironmentIdentity().origin;
function sign(body: string) {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key) throw new AdminMcpError("CONFIRMATION_UNAVAILABLE");
  return createHmac("sha256", key).update(`admin-mcp.v1:${environment()}:${body}`).digest("hex");
}
export function mutationPlan(principal: McpPrincipal, operation: string, input: unknown, impact: unknown) {
  const body = Buffer.from(JSON.stringify({ actor: principal.actorId, session: principal.sessionId, operation, hash: revisionOf(input), expires: Date.now() + 600000 })).toString("base64url");
  return { dryRun: true, ...mcpEnvironmentIdentity(), operation, impact, confirmationToken: `${body}.${sign(body)}`, expiresInSeconds: 600 };
}
export function verifyMutationPlan(principal: McpPrincipal, operation: string, input: unknown, token: string) {
  try {
    const [body, signature, extra] = token.split(".");
    const expected = Buffer.from(sign(body)); const actual = Buffer.from(signature || "");
    if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const plan = JSON.parse(Buffer.from(body, "base64url").toString());
    if (plan.actor !== principal.actorId || plan.session !== principal.sessionId || plan.operation !== operation || plan.hash !== revisionOf(input) || plan.expires <= Date.now()) throw new Error();
  } catch { throw new AdminMcpError("CONFIRMATION_INVALID"); }
}
/** Stable identity shared by mutation replay and the scoped receipt lookup. */
export function adminMutationReceiptId(actorId: string, requestKey: string): string {
  return `mcp_${revisionOf({ actor: actorId, environment: environment(), requestKey })}`;
}

/** Recheck live authority on the same transaction before waiting on mutation targets. */
export async function assertAdminMutationAuthority(tx: AdminTransaction, principal: McpPrincipal, operation: string, input: unknown): Promise<void> {
  if (principal.actorId !== principal.userId) throw new AdminMcpError("AUTHORING_MCP_SESSION_INVALID");
  // Identity changes must prelock actor and target in one sorted set. Otherwise
  // two admins can each hold their own share lock while waiting on the other.
  if ((operation === "users.set_roles" || operation === "users.set_status") && input && typeof input === "object" && "id" in input && typeof input.id === "string") {
    for (const id of [...new Set([principal.actorId, input.id])].sort()) await tx.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1).for("update");
  }
  await assertAuthoringActor(tx, principal.actorId, { roles: ["admin"], error: "AUTHORING_MCP_ADMIN_REQUIRED", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session).where(and(eq(session.id, principal.sessionId), eq(session.userId, principal.userId))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new AdminMcpError("AUTHORING_MCP_SESSION_INVALID");
  if (principal.authMethod === "oauth" && principal.clientId !== MCP_MANUAL_CLIENT_ID) {
    if (!principal.clientId || principal.resource !== mcpEnvironmentIdentity().resource || !await hasMcpOAuthConsent({ userId: principal.userId, sessionId: principal.sessionId, clientId: principal.clientId, resource: principal.resource, scope: principal.scopes }, tx, { lock: true })) throw new AdminMcpError("OAUTH_CONSENT_REQUIRED");
  }
}

export async function readAdminMutationReceipt(principal: McpPrincipal, operation: string, requestKey: string) {
  return db.transaction(async tx => {
    await assertAdminMutationAuthority(tx, principal, "admin.operation_receipt", null);
    const [row] = await tx.select().from(auditMutasi).where(and(eq(auditMutasi.id, adminMutationReceiptId(principal.actorId, requestKey)), eq(auditMutasi.actorId, principal.actorId), eq(auditMutasi.entityType, "admin_mcp"))).limit(1);
    if (row && row.action !== operation) throw new AdminMcpError("IDEMPOTENCY_CONFLICT");
    return row;
  });
}

/** The audit receipt and business mutation commit together. Replays recheck current authority. */
export async function auditedMutation<T extends Record<string, unknown>>(principal: McpPrincipal, operation: string, requestKey: string, input: unknown, execute: (tx: AdminTransaction) => Promise<T>): Promise<T> {
  const receiptId = adminMutationReceiptId(principal.actorId, requestKey);
  const hash = revisionOf({ operation, input });
  const receiptResult = (receipt: typeof auditMutasi.$inferSelect | undefined) => {
    if (!receipt) return undefined;
    if (receipt.actorId !== principal.actorId || receipt.entityType !== "admin_mcp" || receipt.action !== operation || receipt.afterSnapshot?.inputHash !== hash) throw new AdminMcpError("IDEMPOTENCY_CONFLICT");
    return receipt.afterSnapshot.result as T;
  };
  try {
    return await db.transaction(async tx => {
      await assertAdminMutationAuthority(tx, principal, operation, input);
      // Identity authority is held before serialization and mutable target locks.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"zyx:admin-mcp:mutation"}, 0))`);
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      const prior = receiptResult(receipt);
      if (prior !== undefined) return prior;
      const result = await execute(tx);
      await tx.insert(auditMutasi).values({ id: receiptId, actorId: principal.actorId, entityType: "admin_mcp", entityId: String(result.id ?? operation), action: operation, correlationId: requestKey, outcome: "success", beforeSnapshot: { expectedRevision: input && typeof input === "object" && "expectedRevision" in input ? input.expectedRevision : null }, reason: input && typeof input === "object" && "reason" in input && typeof input.reason === "string" ? input.reason.slice(0, 1000) : null, afterSnapshot: { inputHash: hash, result } });
      return result;
    }, { isolationLevel: "serializable" });
  } catch (error) {
    // A competing same-key transaction may have committed. Its receipt is read
    // only after a fresh transactional authorization check, including replay.
    const raced = receiptResult(await readAdminMutationReceipt(principal, operation, requestKey));
    if (raced !== undefined) return raced;
    throw error;
  }
}

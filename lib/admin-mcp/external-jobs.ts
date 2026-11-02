import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { minutesAgo } from "@/lib/date-utils";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminOperationJobs } from "@/db/schema";
import { resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";
export const operationEnvironment = () => mcpEnvironmentIdentity().origin;
export const externalOperationScopes = { notification_send: "notifications:send", form_sheet: "forms:responses:export", meet_create: "meet:write", meet_end: "meet:write", generation_start: "jobs:write", media_upload: "media:write" } as const;
export async function enqueueAdminOperation(tx: AdminTransaction, principal: McpPrincipal, kind: keyof typeof externalOperationScopes, payload: Record<string, unknown>) {
  const required = [externalOperationScopes[kind], ...(kind === "form_sheet" ? ["forms:responses:read"] : [])];
  if (required.some(scope => !principal.scopes.includes(scope))) throw new AdminMcpError("INVALID_JOB_AUTHORITY");
  // Explicit job delegation lasts only while the originating login session is active.
  // No bearer credential is persisted; enqueue validates all operation grants.
  const now = new Date();
  const id = crypto.randomUUID();
  await tx.insert(adminOperationJobs).values({ id, actorId: principal.actorId, sessionId: principal.sessionId, kind, requiredScope: externalOperationScopes[kind], environment: operationEnvironment(), payload, result: { delegatedScopes: required }, status: "queued", createdAt: now, updatedAt: now });
  return { id, kind, status: "queued", jobTool: "adminjobs.get" };
}
export function externalJobView(row: typeof adminOperationJobs.$inferSelect) {
  // Payloads may contain recipients or settings. Only explicit, sanitized results are public.
  return { id: row.id, kind: row.kind, status: row.status, result: row.result, errorCode: row.errorCode, createdAt: row.createdAt, updatedAt: row.updatedAt, revision: revisionOf({ id: row.id, status: row.status, updatedAt: row.updatedAt }) };
}
export type AdminOperationExecutor = (row: typeof adminOperationJobs.$inferSelect) => Promise<Record<string, unknown>>;
/** A durable claim is committed before any external effect. A crashed claim is never replayed automatically. */
export async function processAdminOperation(id: string, execute: AdminOperationExecutor) {
  const [claimed] = await db.update(adminOperationJobs).set({ status: "running", updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, id), eq(adminOperationJobs.status, "queued"), eq(adminOperationJobs.environment, operationEnvironment()))).returning();
  if (!claimed) return { id, claimed: false };
  try {
    if (externalOperationScopes[claimed.kind] !== claimed.requiredScope) throw new AdminMcpError("INVALID_JOB_AUTHORITY");
    await resolveMcpAdmin({ userId: claimed.actorId, actorId: claimed.actorId, sessionId: claimed.sessionId, scopes: [claimed.requiredScope, ...(claimed.kind === "form_sheet" ? ["forms:responses:read"] : [])], authMethod: "oauth" } as McpPrincipal);
  } catch {
    await db.update(adminOperationJobs).set({ status: "failed", errorCode: "AUTHORIZATION_EXPIRED", updatedAt: new Date() }).where(eq(adminOperationJobs.id, id));
    return { id, status: "failed" };
  }
  let heartbeatPending = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatPending = heartbeatPending.then(async () => {
      await db.update(adminOperationJobs).set({ updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, id), eq(adminOperationJobs.status, "running")));
    }).catch(() => { /* Lost storage connectivity must not trigger provider replay. */ });
  }, 60000);
  try {
    const result = await execute(claimed);
    const changed = await db.update(adminOperationJobs).set({ status: "succeeded", result, ...(claimed.kind === "media_upload" ? { payload: { key: claimed.payload.key, mimeType: claimed.payload.mimeType } } : {}), updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, id), eq(adminOperationJobs.status, "running"))).returning({ id: adminOperationJobs.id });
    return { id, status: changed.length ? "succeeded" : "unknown" };
  } catch (error) {
    // Known preflight failures have no provider effect. Unknown failures may have partially succeeded.
    const safe = error instanceof AdminMcpError;
    const changed = await db.update(adminOperationJobs).set({ status: safe ? "failed" : "unknown", errorCode: safe ? error.code : "RECONCILIATION_REQUIRED", updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, id), eq(adminOperationJobs.status, "running"))).returning({ id: adminOperationJobs.id });
    return { id, status: changed.length && safe ? "failed" : "unknown" };
  } finally {
    clearInterval(heartbeat);
    await heartbeatPending;
  }
}
export async function collectAdminOperations() {
  const staleBefore = minutesAgo(15);
  await db.update(adminOperationJobs).set({ status: "unknown", errorCode: "RECONCILIATION_REQUIRED", updatedAt: new Date() }).where(and(eq(adminOperationJobs.status, "running"), eq(adminOperationJobs.environment, operationEnvironment()), lt(adminOperationJobs.updatedAt, staleBefore)));
  return db.select({ id: adminOperationJobs.id }).from(adminOperationJobs).where(and(eq(adminOperationJobs.status, "queued"), eq(adminOperationJobs.environment, operationEnvironment()))).orderBy(asc(adminOperationJobs.createdAt), asc(adminOperationJobs.id)).limit(25);
}

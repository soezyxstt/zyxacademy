import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditMutasi } from "@/db/schema";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";

export class AdminMcpError extends Error {
  constructor(public code: string) { super(code); }
}
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(v => canonical(v ?? null)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function revisionOf(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
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
/** The audit receipt and business mutation commit together. Retries return the original receipt. */
export async function auditedMutation<T extends Record<string, unknown>>(principal: McpPrincipal, operation: string, requestKey: string, input: unknown, execute: (tx: AdminTransaction) => Promise<T>): Promise<T> {
  const receiptId = `mcp_${revisionOf({ actor: principal.actorId, environment: environment(), requestKey })}`;
  const hash = revisionOf({ operation, input });
  const readReceipt = async () => {
    const [receipt] = await db.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (!receipt) return undefined;
    if (receipt.afterSnapshot?.inputHash !== hash) throw new AdminMcpError("IDEMPOTENCY_CONFLICT");
    return receipt.afterSnapshot.result as T;
  };
  const prior = await readReceipt();
  if (prior) return prior;
  try {
    return await db.transaction(async tx => {
      // Serialize MCP mutations so revision checks and idempotency receipts remain atomic.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"zyx:admin-mcp:mutation"}, 0))`);
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.afterSnapshot?.inputHash !== hash) throw new AdminMcpError("IDEMPOTENCY_CONFLICT");
        return receipt.afterSnapshot.result as T;
      }
      const result = await execute(tx);
      await tx.insert(auditMutasi).values({ id: receiptId, actorId: principal.actorId, entityType: "admin_mcp", entityId: String(result.id ?? operation), action: operation, correlationId: requestKey, outcome: "success", beforeSnapshot: { expectedRevision: input && typeof input === "object" && "expectedRevision" in input ? input.expectedRevision : null }, reason: input && typeof input === "object" && "reason" in input && typeof input.reason === "string" ? input.reason.slice(0, 1000) : null, afterSnapshot: { inputHash: hash, result } });
      return result;
    }, { isolationLevel: "serializable" });
  } catch (error) {
    // A competing request may have committed the same receipt while this transaction rolled back.
    const raced = await readReceipt();
    if (raced) return raced;
    throw error;
  }
}

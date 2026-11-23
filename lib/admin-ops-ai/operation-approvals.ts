import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { zyraProposals } from "@/db/schema";
import type { AdminTransaction } from "@/lib/admin-mcp/mutations";
import { affectedRows } from "@/lib/mutation-result";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { browserOperations, type OpsBrowserChat, type OpsBrowserIdentity, type OpsRegisteredOperation } from "./registered-operations";

export const CHAT_GRANT_MS = 10 * 60 * 1000;
const ADMIN_OPERATION_PROPOSAL = "admin_operation";

const planSchema = z.object({
  operation: z.string(),
  input: z.record(z.string(), z.unknown()),
  sessionId: z.string(),
  chatId: z.string(),
  origin: z.string(),
  environment: z.enum(["staging", "production", "local"]),
  requestKey: z.string(),
  grantTarget: z.string().optional(),
  confirmationToken: z.string().optional(),
  protocol: z.enum(["plan", "direct"]).default("plan"),
});
export type OpsOperationPlan = z.infer<typeof planSchema>;
export type OpsApprovalChoice = "once" | "chat";

const rowType = eq(zyraProposals.proposalType, ADMIN_OPERATION_PROPOSAL);

function storedPlan(scope: unknown) {
  const result = z.object({ fullProposal: z.object({ payload: planSchema }) }).safeParse(scope);
  return result.success ? result.data.fullProposal.payload : undefined;
}

function sameEnvironment(plan: OpsOperationPlan) {
  const identity = mcpEnvironmentIdentity();
  return identity.origin === plan.origin && identity.environment === plan.environment;
}

export async function hasChatOperationGrant(
  chat: OpsBrowserIdentity & { chatId: string; grantIds: string[] },
  operation: string,
  target: string | undefined,
  transaction?: AdminTransaction,
) {
  if (!target || !chat.grantIds.length) return false;
  const query = (transaction ?? db).select({ scope: zyraProposals.scope, reversibility: zyraProposals.reversibility, confirmedAt: zyraProposals.confirmedAt })
    .from(zyraProposals)
    .where(and(
      inArray(zyraProposals.id, chat.grantIds),
      rowType,
      eq(zyraProposals.actorId, chat.actorId),
      eq(zyraProposals.status, "applied"),
      gt(zyraProposals.confirmedAt, new Date(Date.now() - CHAT_GRANT_MS)),
    ));
  const rows = await (transaction ? query.for("share") : query);
  return rows.some(row => {
    const plan = storedPlan(row.scope);
    return row.reversibility.approval === "chat" && row.confirmedAt
      && row.confirmedAt.getTime() + CHAT_GRANT_MS > Date.now() && plan
      && plan.sessionId === chat.sessionId && plan.chatId === chat.chatId
      && plan.operation === operation && plan.grantTarget === target
      && sameEnvironment(plan);
  });
}

export async function revokeChatOperationGrants(chat: OpsBrowserIdentity & { chatId: string; grantIds: string[] }) {
  await db.update(zyraProposals).set({ reversibility: { reversible: true, approval: "revoked" } })
    .where(and(
      inArray(zyraProposals.id, chat.grantIds),
      rowType,
      eq(zyraProposals.actorId, chat.actorId),
      eq(zyraProposals.status, "applied"),
      sql`${zyraProposals.scope}->'fullProposal'->'payload'->>'sessionId' = ${chat.sessionId}`,
      sql`${zyraProposals.scope}->'fullProposal'->'payload'->>'chatId' = ${chat.chatId}`,
      sql`${zyraProposals.reversibility}->>'approval' = 'chat'`,
    ));
}

export async function invokeApprovedOperation(
  entry: OpsRegisteredOperation,
  plan: OpsOperationPlan,
) {
  const target = entry.expectsTarget ? { expectedEnvironment: plan.environment, expectedOrigin: plan.origin } : {};
  return entry.invoke({
    ...plan.input,
    ...target,
    ...(plan.protocol === "plan" ? {
      requestKey: plan.requestKey,
      confirmationToken: plan.confirmationToken,
      dryRun: false,
    } : {}),
  });
}

export async function readApprovedOperation(chat: OpsBrowserChat, proposalId: string) {
  const [row] = await db.select({
    scope: zyraProposals.scope,
    validatorResult: zyraProposals.validatorResult,
    status: zyraProposals.status,
  }).from(zyraProposals).where(and(
    eq(zyraProposals.id, proposalId),
    rowType,
    eq(zyraProposals.actorId, chat.actorId),
  )).limit(1);
  const plan = row && storedPlan(row.scope);
  if (!plan || plan.sessionId !== chat.sessionId || plan.chatId !== chat.chatId || !sameEnvironment(plan)) return null;
  await resolveMcpAdmin({ userId: chat.actorId, sessionId: chat.sessionId, authMethod: "session", scopes: [] });
  return { operation: plan.operation, status: row.status, data: row.validatorResult.operationResult ?? row.validatorResult.result };
}

export async function confirmAdminOperation(
  identity: OpsBrowserIdentity,
  proposalId: string,
  chatId: string,
  choice: OpsApprovalChoice,
) {
  const [row] = await db.select().from(zyraProposals)
    .where(and(eq(zyraProposals.id, proposalId), rowType, eq(zyraProposals.actorId, identity.actorId))).limit(1);
  const plan = row && storedPlan(row.scope);
  const conflict = (error: string, retryable = false) => ({ success: false as const, error, retryable });
  if (!plan || plan.sessionId !== identity.sessionId || plan.chatId !== chatId || !sameEnvironment(plan)) {
    return conflict("Persetujuan ini tidak berlaku untuk sesi atau chat ini.");
  }

  const entry = browserOperations(identity).get(plan.operation);
  const canGrant = Boolean(plan.grantTarget && (entry?.policy === "chat" || entry?.policy === "draft-only"));
  if (!entry || entry.protocol !== plan.protocol || entry.policy === "read" || (choice === "chat" && !canGrant)) {
    return conflict("Jenis persetujuan ini tidak tersedia untuk aksi tersebut.");
  }

  const applied = row.status === "applied";
  const pending = row.status === "draft";
  if ((!applied && !pending && row.status !== "confirmed") || (!pending && row.reversibility.approval !== choice)) {
    return conflict("Persetujuan ini sudah diproses. Periksa target sebelum melanjutkan.");
  }
  const grantUntil = (row.confirmedAt?.getTime() ?? Date.now()) + CHAT_GRANT_MS;

  if (applied) {
    return { success: true as const, result: row.validatorResult.result, grantUntil: choice === "chat" ? grantUntil : undefined };
  }
  if (!pending && plan.protocol === "direct") {
    return conflict("Aksi sudah dikirim. Periksa status target atau job sebelum meminta aksi lagi.");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return conflict(pending
      ? "Persetujuan kedaluwarsa. Minta Ops AI menyiapkan aksi lagi."
      : "Persetujuan kedaluwarsa setelah dikirim. Periksa target sebelum meminta aksi lagi.");
  }

  if (pending) {
    const claimed = await db.update(zyraProposals).set({
      status: "confirmed",
      confirmedAt: new Date(grantUntil - CHAT_GRANT_MS),
      reversibility: { reversible: canGrant, approval: choice },
    }).where(and(eq(zyraProposals.id, proposalId), eq(zyraProposals.status, "draft"), gt(zyraProposals.expiresAt, new Date())));
    if (!affectedRows(claimed)) return conflict("Status persetujuan berubah. Periksa kembali aksi ini.", true);
  }

  // Only signed-plan handlers have the shared transaction receipt for replay.
  const response = await invokeApprovedOperation(entry, plan);
  if (response.isError || !response.structuredContent || response.structuredContent.ok === false || (plan.protocol === "plan" && response.structuredContent.ok !== true)) {
    const action = response.structuredContent?.action;
    if (action === "refresh_revision") return conflict("Target sudah berubah. Minta Ops AI membaca ulang dan menyiapkan aksi baru.");
    if (action === "correct_input") return conflict("Detail aksi tidak valid. Minta Ops AI memeriksa target dan menyiapkan aksi baru.");
    if (plan.protocol === "direct") {
      await db.update(zyraProposals).set({
        status: "failed",
        validatorResult: { valid: false, operationResult: response.structuredContent ?? null },
      }).where(and(eq(zyraProposals.id, proposalId), eq(zyraProposals.status, "confirmed")));
      return conflict("Aksi tidak selesai. Minta Ops AI memeriksa hasil atau status target sebelum melanjutkan.");
    }
    return conflict("Hasil aksi belum terverifikasi. Periksa kembali persetujuan atau target dengan detail yang sama.", response.structuredContent?.retryable === true);
  }
  const envelope = response.structuredContent;
  const payload = envelope.data ?? envelope.result ?? envelope;
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const target = typeof data.id === "string" ? data.id : undefined;
  const jobId = typeof data.jobId === "string" ? data.jobId : undefined;
  const status = typeof data.status === "string" ? data.status : undefined;
  const awaitingJob = status !== undefined && ["pending", "queued", "running", "processing"].includes(status);
  const unsuccessfulJob = status !== undefined && ["failed", "cancelled", "unknown"].includes(status);
  const message = awaitingJob
    ? `Job sedang diproses${jobId ? ` (${jobId})` : ""}.`
    : unsuccessfulJob
      ? `Hasil job perlu diperiksa${jobId ? ` (${jobId})` : ""}.`
      : "Aksi selesai.";
  const result = { message, ...(target ? { target } : {}), ...(jobId ? { jobId } : {}) };
  await db.update(zyraProposals).set({
    status: "applied",
    appliedAt: new Date(),
    validatorResult: {
      valid: true,
      result,
      ...(plan.protocol === "direct" ? { operationResult: response.structuredContent } : {}),
    },
  }).where(and(eq(zyraProposals.id, proposalId), eq(zyraProposals.status, "confirmed")));
  return { success: true as const, result, grantUntil: choice === "chat" ? grantUntil : undefined };
}

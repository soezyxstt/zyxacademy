import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { zyraProposalEvents, zyraProposals } from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import {
  proposalDiffHash,
  transitionZyraProposalStatus,
  validateZyraProposalDraft,
  ZYRA_PROPOSAL_TTL_HOURS,
  type ZyraProposalDraft,
  type ZyraProposalRole,
  type ZyraProposalStatus,
} from "./contracts";

function eventReason(to: ZyraProposalStatus): string {
  return `PROPOSAL_${to.toUpperCase()}`;
}

export async function createZyraProposal(input: {
  actorId: string;
  role: ZyraProposalRole;
  draft: ZyraProposalDraft;
  source?: "deterministic" | "ai_assisted";
}) {
  const validation = validateZyraProposalDraft(input.draft, input.role);
  if (!validation.valid) throw new Error(validation.reasonCodes[0] ?? "PROPOSAL_INVALID");
  const now = new Date();
  const id = randomUUID();
  const rationaleHash = proposalDiffHash({ ...input.draft, rationale: input.draft.rationale });
  const diffHash = proposalDiffHash(input.draft);
  const expiresAt = daysFrom(ZYRA_PROPOSAL_TTL_HOURS / 24, now);
  const proposerTrace = {
    version: "zyra-proposal-v1" as const,
    source: input.source ?? "deterministic" as const,
    rationaleHash,
  };
  const validatorResult = { valid: true, reasonCodes: [] as string[] };
  await db.insert(zyraProposals).values({
    id,
    actorId: input.actorId,
    role: input.role,
    proposalType: input.draft.proposalType,
    courseId: input.draft.courseId,
    scope: input.draft.scope,
    evidenceRefs: input.draft.evidenceRefs,
    preconditionSnapshot: input.draft.preconditionSnapshot,
    operations: input.draft.operations,
    learnerImpact: input.draft.learnerImpact,
    reversibility: input.draft.reversibility,
    warnings: input.draft.warnings,
    proposerTrace,
    validatorResult,
    status: "validated",
    preconditionVersion: input.draft.preconditionSnapshot.version,
    diffHash,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  await appendProposalEvent({ proposalId: id, actorId: input.actorId, fromStatus: "draft", toStatus: "validated", diffHash });
  return getZyraProposal(id);
}

export async function getZyraProposal(id: string) {
  const [row] = await db.select().from(zyraProposals).where(eq(zyraProposals.id, id)).limit(1);
  return row ?? null;
}

export async function listZyraProposals(input: { actorId: string; role: ZyraProposalRole; courseId?: string | null }) {
  const conditions = input.role === "admin"
    ? input.courseId ? eq(zyraProposals.courseId, input.courseId) : undefined
    : and(eq(zyraProposals.actorId, input.actorId), input.courseId ? eq(zyraProposals.courseId, input.courseId) : undefined);
  return db.select().from(zyraProposals).where(conditions).orderBy(desc(zyraProposals.createdAt)).limit(50);
}

export function canAccessZyraProposal(input: { actorId: string; role: ZyraProposalRole; proposalActorId: string; courseId: string | null; requestedCourseId?: string | null }): boolean {
  if (input.role === "admin") return !input.requestedCourseId || input.requestedCourseId === input.courseId;
  return input.actorId === input.proposalActorId && (!input.requestedCourseId || input.requestedCourseId === input.courseId);
}

async function appendProposalEvent(input: { proposalId: string; actorId: string; fromStatus: ZyraProposalStatus | null; toStatus: ZyraProposalStatus; diffHash: string }) {
  await db.insert(zyraProposalEvents).values({
    id: randomUUID(),
    proposalId: input.proposalId,
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reasonCode: eventReason(input.toStatus),
    diffHash: input.diffHash,
  });
}

export async function transitionZyraProposal(input: {
  id: string;
  actorId: string;
  to: ZyraProposalStatus;
  preconditionVersion: number;
}) {
  const row = await getZyraProposal(input.id);
  if (!row) throw new Error("PROPOSAL_NOT_FOUND");
  if (row.expiresAt <= new Date() && !["expired", "rejected"].includes(row.status)) {
    await db.update(zyraProposals).set({ status: "expired", updatedAt: new Date() }).where(eq(zyraProposals.id, input.id));
    await appendProposalEvent({ proposalId: input.id, actorId: input.actorId, fromStatus: row.status, toStatus: "expired", diffHash: row.diffHash });
    throw new Error("PROPOSAL_EXPIRED");
  }
  const errorCode = transitionZyraProposalStatus({
    from: row.status,
    to: input.to,
    actorId: input.actorId,
    proposerId: row.actorId,
    preconditionMatches: row.preconditionVersion === input.preconditionVersion,
  });
  if (errorCode) throw new Error(errorCode);
  const now = new Date();
  const update: Record<string, unknown> = { status: input.to, updatedAt: now };
  if (input.to === "reviewed") update.reviewedAt = now;
  if (input.to === "confirmed") update.confirmedAt = now;
  await db.update(zyraProposals).set(update).where(and(eq(zyraProposals.id, input.id), eq(zyraProposals.status, row.status)));
  await appendProposalEvent({ proposalId: input.id, actorId: input.actorId, fromStatus: row.status, toStatus: input.to, diffHash: row.diffHash });
  return getZyraProposal(input.id);
}

export async function applyZyraProposal(): Promise<never> {
  throw new Error("MUTATION_BOUNDARY_REQUIRED");
}

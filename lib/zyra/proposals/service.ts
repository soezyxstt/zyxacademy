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
  return db.transaction(async (tx) => {
    await tx.insert(zyraProposals).values({
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
    await tx.insert(zyraProposalEvents).values({
      id: randomUUID(),
      proposalId: id,
      actorId: input.actorId,
      fromStatus: "draft",
      toStatus: "validated",
      reasonCode: eventReason("validated"),
      diffHash,
      createdAt: now,
    });
    const [row] = await tx.select().from(zyraProposals).where(eq(zyraProposals.id, id)).limit(1);
    return row ?? null;
  });
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

export async function transitionZyraProposal(input: {
  id: string;
  actorId: string;
  to: ZyraProposalStatus;
  preconditionVersion: number;
}) {
  const [initialRow] = await db
    .select()
    .from(zyraProposals)
    .where(eq(zyraProposals.id, input.id))
    .limit(1);

  if (!initialRow) throw new Error("PROPOSAL_NOT_FOUND");

  if (initialRow.status === "expired") {
    throw new Error("PROPOSAL_EXPIRED");
  }

  if (initialRow.expiresAt <= new Date() && !["expired", "rejected"].includes(initialRow.status)) {
    // Atomically persist expired status and event in a committed transaction
    await db.transaction(async (tx) => {
      const [currentRow] = await tx
        .select()
        .from(zyraProposals)
        .where(eq(zyraProposals.id, input.id))
        .limit(1);

      if (!currentRow || ["expired", "rejected"].includes(currentRow.status)) {
        return;
      }

      const updatedRows = await tx
        .update(zyraProposals)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(zyraProposals.id, input.id), eq(zyraProposals.status, currentRow.status)))
        .returning({ id: zyraProposals.id });

      if (updatedRows.length > 0) {
        await tx.insert(zyraProposalEvents).values({
          id: randomUUID(),
          proposalId: input.id,
          actorId: input.actorId,
          fromStatus: currentRow.status,
          toStatus: "expired",
          reasonCode: eventReason("expired"),
          diffHash: currentRow.diffHash,
          createdAt: new Date(),
        });
      }
    });

    // Throw error only AFTER transaction has durably committed
    throw new Error("PROPOSAL_EXPIRED");
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(zyraProposals).where(eq(zyraProposals.id, input.id)).limit(1);
    if (!row) throw new Error("PROPOSAL_NOT_FOUND");
    if (row.status === "expired") throw new Error("PROPOSAL_EXPIRED");

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

    const updatedRows = await tx
      .update(zyraProposals)
      .set(update)
      .where(and(eq(zyraProposals.id, input.id), eq(zyraProposals.status, row.status)))
      .returning({ id: zyraProposals.id, status: zyraProposals.status });

    if (updatedRows.length === 0) {
      throw new Error("PROPOSAL_CONCURRENT_MUTATION");
    }

    await tx.insert(zyraProposalEvents).values({
      id: randomUUID(),
      proposalId: input.id,
      actorId: input.actorId,
      fromStatus: row.status,
      toStatus: input.to,
      reasonCode: eventReason(input.to),
      diffHash: row.diffHash,
      createdAt: now,
    });

    const [updated] = await tx.select().from(zyraProposals).where(eq(zyraProposals.id, input.id)).limit(1);
    return updated ?? null;
  });
}

export async function applyZyraProposal(): Promise<never> {
  throw new Error("MUTATION_BOUNDARY_REQUIRED");
}

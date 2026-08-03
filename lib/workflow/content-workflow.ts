import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alurKonten, auditMutasi } from "@/db/schema";
import { hasAnyPeranFromCodes } from "@/lib/auth/authorization";
import { buildMutationAuditRow } from "@/lib/audit/mutasi";
import { env } from "@/lib/env";

export const CONTENT_WORKFLOW_STATES = [
  "uploaded",
  "validated",
  "staged",
  "tutor_review",
  "changes_requested",
  "admin_review",
  "approved",
  "published",
  "superseded",
  "withdrawn",
] as const;

export type ContentWorkflowState = (typeof CONTENT_WORKFLOW_STATES)[number];

export interface WorkflowActor {
  id: string;
  roles: readonly string[];
  courseIds?: readonly string[];
}

export interface WorkflowTransitionInput {
  actor: WorkflowActor;
  courseId: string;
  entityType: string;
  entityId: string;
  version: number;
  contentHash: string;
  from: ContentWorkflowState;
  to: ContentWorkflowState;
  reason: string;
  requestId?: string;
  assignedTutorId?: string | null;
}

export const CONTENT_WORKFLOW_TRANSITIONS: Readonly<Record<ContentWorkflowState, readonly ContentWorkflowState[]>> = {
  uploaded: ["validated"],
  validated: ["staged"],
  staged: ["tutor_review"],
  tutor_review: ["changes_requested", "admin_review"],
  changes_requested: ["staged"],
  admin_review: ["changes_requested", "approved"],
  approved: ["published"],
  published: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
};

const ADMIN_TRANSITIONS = new Set<ContentWorkflowState>(["approved", "published", "superseded", "withdrawn"]);
const TUTOR_TRANSITIONS = new Set<ContentWorkflowState>(["validated", "staged", "tutor_review", "changes_requested", "admin_review"]);

export function assertContentWorkflowTransition(input: WorkflowTransitionInput): void {
  if (env.FEATURE_ADMIN_TUTOR_WORKFLOW_V1 !== "1") throw new Error("CONTENT_WORKFLOW_DISABLED");
  if (!CONTENT_WORKFLOW_STATES.includes(input.from) || !CONTENT_WORKFLOW_STATES.includes(input.to)) {
    throw new Error("CONTENT_WORKFLOW_STATE_INVALID");
  }
  if (!CONTENT_WORKFLOW_TRANSITIONS[input.from].includes(input.to)) {
    throw new Error(`CONTENT_WORKFLOW_TRANSITION_NOT_ALLOWED:${input.from}:${input.to}`);
  }
  if (!input.contentHash.trim()) throw new Error("CONTENT_WORKFLOW_HASH_REQUIRED");
  if (!input.reason.trim()) throw new Error("CONTENT_WORKFLOW_REASON_REQUIRED");
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error("CONTENT_WORKFLOW_VERSION_INVALID");

  const roles = input.actor.roles;
  const isAdmin = hasAnyPeranFromCodes(roles, ["admin"]);
  const transitionRequiresAdmin = ADMIN_TRANSITIONS.has(input.to);
  const allowed = transitionRequiresAdmin
    ? isAdmin
    : hasAnyPeranFromCodes(roles, ["tutor"], { allowAdmin: true }) && TUTOR_TRANSITIONS.has(input.to);
  if (!allowed) throw new Error("CONTENT_WORKFLOW_ROLE_DENIED");
  if (!isAdmin && input.actor.courseIds && !input.actor.courseIds.includes(input.courseId)) {
    throw new Error("CONTENT_WORKFLOW_COURSE_SCOPE_DENIED");
  }
}

export function nextWorkflowState(
  current: ContentWorkflowState,
  requested: ContentWorkflowState,
): ContentWorkflowState {
  if (!CONTENT_WORKFLOW_TRANSITIONS[current].includes(requested)) {
    throw new Error(`CONTENT_WORKFLOW_TRANSITION_NOT_ALLOWED:${current}:${requested}`);
  }
  return requested;
}

export async function transitionContentWorkflow(input: WorkflowTransitionInput) {
  assertContentWorkflowTransition(input);
  const requestId = input.requestId?.trim() || randomUUID();
  const workflowId = `${input.entityType}:${input.entityId}:${input.version}`;
  const before = {
    state: input.from,
    courseId: input.courseId,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    contentHash: input.contentHash,
  };
  const after = { ...before, state: nextWorkflowState(input.from, input.to) };

  await db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(alurKonten)
      .where(and(eq(alurKonten.id, workflowId), eq(alurKonten.courseId, input.courseId)))
      .limit(1);
    if (current[0] && current[0].state !== input.from) {
      throw new Error(`CONTENT_WORKFLOW_EXPECTED_STATE_MISMATCH:${current[0].state}`);
    }
    const now = new Date();
    if (!current[0]) {
      await tx.insert(alurKonten).values({
        id: workflowId,
        entityType: input.entityType,
        entityId: input.entityId,
        courseId: input.courseId,
        version: input.version,
        state: after.state,
        contentHash: input.contentHash,
        assignedTutorId: input.assignedTutorId ?? null,
        lastRequestId: requestId,
        lastReason: input.reason.trim(),
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await tx.update(alurKonten).set({
        state: after.state,
        contentHash: input.contentHash,
        assignedTutorId: input.assignedTutorId ?? current[0].assignedTutorId,
        lastRequestId: requestId,
        lastReason: input.reason.trim(),
        updatedAt: now,
      }).where(eq(alurKonten.id, workflowId));
    }
    await tx.insert(auditMutasi).values(buildMutationAuditRow({
      actorId: input.actor.id,
      actorRoles: input.actor.roles,
      courseId: input.courseId,
      entityType: input.entityType,
      entityId: input.entityId,
      entityVersion: input.version,
      action: `workflow:${input.from}->${input.to}`,
      before: current[0] ? before : null,
      after,
      requestId,
      reason: input.reason,
    }));
  });

  return { workflowId, state: after.state, requestId };
}

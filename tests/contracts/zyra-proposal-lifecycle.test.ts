import { describe, expect, test, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { transitionZyraProposalStatus } from "@/lib/zyra/proposals/contracts";

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"];
let createZyraProposal: typeof import("@/lib/zyra/proposals/service").createZyraProposal;
let transitionZyraProposal: typeof import("@/lib/zyra/proposals/service").transitionZyraProposal;



describe("Zyra proposal lifecycle", () => {
  beforeAll(async () => {
    ({ client, testDb } = await createPostgresTestDb());
    mock.module("@/db", () => ({ db: testDb }));
    ({ createZyraProposal, transitionZyraProposal } = await import("@/lib/zyra/proposals/service"));
  }, 60000);

  afterAll(async () => { await client?.close(); });

  beforeEach(async () => {
    await client.exec('TRUNCATE TABLE zyra_proposal_events, zyra_proposals, courses, "user" CASCADE');
  });

  test("requires a second reviewer and explicit proposer confirmation", () => {
    expect(transitionZyraProposalStatus({ from: "validated", to: "reviewed", actorId: "owner", proposerId: "owner", preconditionMatches: true })).toBe("SECOND_REVIEWER_REQUIRED");
    expect(transitionZyraProposalStatus({ from: "validated", to: "reviewed", actorId: "reviewer", proposerId: "owner", preconditionMatches: true })).toBeNull();
    expect(transitionZyraProposalStatus({ from: "reviewed", to: "confirmed", actorId: "reviewer", proposerId: "owner", preconditionMatches: true })).toBe("PROPOSER_CONFIRMATION_REQUIRED");
  });

  test("rejects stale and autonomous apply paths", () => {
    expect(transitionZyraProposalStatus({ from: "reviewed", to: "confirmed", actorId: "owner", proposerId: "owner", preconditionMatches: false })).toBe("STALE_PRECONDITION");
    expect(transitionZyraProposalStatus({ from: "confirmed", to: "applied", actorId: "owner", proposerId: "owner", preconditionMatches: true })).toBe("MUTATION_BOUNDARY_REQUIRED");
  });

  test("prevents phantom events and guarantees atomic state transitions under concurrent mutations", async () => {
    const now = new Date();
    await testDb.insert(schema.user).values([
      { id: "usr-proposer", name: "Proposer", email: "p@zyx.test", role: "teacher", createdAt: now, updatedAt: now },
      { id: "usr-rev-1", name: "Reviewer 1", email: "r1@zyx.test", role: "admin", createdAt: now, updatedAt: now },
      { id: "usr-rev-2", name: "Reviewer 2", email: "r2@zyx.test", role: "admin", createdAt: now, updatedAt: now },
    ]);

    await testDb.insert(schema.courses).values({
      id: "crs-conc-prop",
      title: "Course Concurrent",
      category: "Matematika",
    });

    const proposal = await createZyraProposal({
      actorId: "usr-proposer",
      role: "tutor",
      draft: {
        proposalType: "misconception_brief",
        courseId: "crs-conc-prop",
        scope: { courseId: "crs-conc-prop" },
        evidenceRefs: ["ref-1"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "None" },
        reversibility: { reversible: true, rollback: "None" },
        warnings: ["Warn"],
        rationale: "Rationale",
      },
    });

    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe("validated");

    // Events after creation: exactly 1 event (draft -> validated)
    const initialEvents = await testDb
      .select()
      .from(schema.zyraProposalEvents)
      .where(eq(schema.zyraProposalEvents.proposalId, proposal!.id));
    expect(initialEvents.length).toBe(1);
    expect(initialEvents[0].toStatus).toBe("validated");

    // Execute 2 concurrent review transitions on the same proposal
    const results = await Promise.allSettled([
      transitionZyraProposal({
        id: proposal!.id,
        actorId: "usr-rev-1",
        to: "reviewed",
        preconditionVersion: 1,
      }),
      transitionZyraProposal({
        id: proposal!.id,
        actorId: "usr-rev-2",
        to: "reviewed",
        preconditionVersion: 1,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one transition must succeed
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // The rejected transition should fail with conflict / locked / invalid transition error
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason?.message ?? "";
    const isConflictOrLock = [
      "PROPOSAL_CONCURRENT_MUTATION",
      "INVALID_PROPOSAL_TRANSITION",
      "SQLITE_LOCKED",
      "database table is locked",
      "database is locked",
    ].some((msg) => rejectedReason.includes(msg));
    expect(isConflictOrLock).toBe(true);

    // Check DB state: status is reviewed
    const [finalProposal] = await testDb
      .select()
      .from(schema.zyraProposals)
      .where(eq(schema.zyraProposals.id, proposal!.id));
    expect(finalProposal.status).toBe("reviewed");

    // Check events: exactly 2 events total (validated + single reviewed). NO phantom event!
    const finalEvents = await testDb
      .select()
      .from(schema.zyraProposalEvents)
      .where(eq(schema.zyraProposalEvents.proposalId, proposal!.id));
    expect(finalEvents.length).toBe(2);
    expect(finalEvents.map((e) => e.toStatus)).toEqual(["validated", "reviewed"]);
  });

  test("atomically commits expired state and exactly one event without rolling back and ignores repeated expired transition attempts", async () => {
    const now = new Date();
    await testDb.insert(schema.user).values([
      { id: "usr-prop-exp", name: "Proposer Exp", email: "propexp@zyx.test", role: "teacher", createdAt: now, updatedAt: now },
      { id: "usr-rev-exp", name: "Reviewer Exp", email: "revexp@zyx.test", role: "admin", createdAt: now, updatedAt: now },
    ]);

    await testDb.insert(schema.courses).values({
      id: "crs-exp-prop",
      title: "Course Expired",
      category: "Matematika",
    });

    const proposal = await createZyraProposal({
      actorId: "usr-prop-exp",
      role: "tutor",
      draft: {
        proposalType: "misconception_brief",
        courseId: "crs-exp-prop",
        scope: { courseId: "crs-exp-prop" },
        evidenceRefs: ["ref-exp"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "None" },
        reversibility: { reversible: true, rollback: "None" },
        warnings: ["Warn"],
        rationale: "Rationale",
      },
    });

    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe("validated");

    // Manually expire the proposal by setting expiresAt to the past
    const pastDate = new Date(Date.now() - 3600_000); // 1 hour ago
    await testDb
      .update(schema.zyraProposals)
      .set({ expiresAt: pastDate })
      .where(eq(schema.zyraProposals.id, proposal!.id));

    // Request 1: Attempt to transition the expired proposal
    let err1: Error | null = null;
    try {
      await transitionZyraProposal({
        id: proposal!.id,
        actorId: "usr-rev-exp",
        to: "reviewed",
        preconditionVersion: 1,
      });
    } catch (e) {
      err1 = e as Error;
    }

    expect(err1).not.toBeNull();
    expect(err1!.message).toBe("PROPOSAL_EXPIRED");

    // Inspect DB: The status MUST be committed as 'expired' (NOT rolled back to 'validated')
    const [rowAfterAttempt1] = await testDb
      .select()
      .from(schema.zyraProposals)
      .where(eq(schema.zyraProposals.id, proposal!.id));
    expect(rowAfterAttempt1.status).toBe("expired");

    // Events in DB must have exactly 2 events (validated, expired)
    const eventsAfterAttempt1 = await testDb
      .select()
      .from(schema.zyraProposalEvents)
      .where(eq(schema.zyraProposalEvents.proposalId, proposal!.id));
    expect(eventsAfterAttempt1.length).toBe(2);
    expect(eventsAfterAttempt1.map((e) => e.toStatus)).toEqual(["validated", "expired"]);

    // Request 2 (repeat request on now-expired proposal)
    let err2: Error | null = null;
    try {
      await transitionZyraProposal({
        id: proposal!.id,
        actorId: "usr-rev-exp",
        to: "reviewed",
        preconditionVersion: 1,
      });
    } catch (e) {
      err2 = e as Error;
    }

    expect(err2).not.toBeNull();
    expect(err2!.message).toBe("PROPOSAL_EXPIRED");

    // Events in DB must STILL have exactly 2 events (no duplicate expired event created)
    const eventsAfterAttempt2 = await testDb
      .select()
      .from(schema.zyraProposalEvents)
      .where(eq(schema.zyraProposalEvents.proposalId, proposal!.id));
    expect(eventsAfterAttempt2.length).toBe(2);

    // Request 3 (repeat again)
    let err3: Error | null = null;
    try {
      await transitionZyraProposal({
        id: proposal!.id,
        actorId: "usr-rev-exp",
        to: "reviewed",
        preconditionVersion: 1,
      });
    } catch (e) {
      err3 = e as Error;
    }

    expect(err3).not.toBeNull();
    expect(err3!.message).toBe("PROPOSAL_EXPIRED");

    const eventsAfterAttempt3 = await testDb
      .select()
      .from(schema.zyraProposalEvents)
      .where(eq(schema.zyraProposalEvents.proposalId, proposal!.id));
    expect(eventsAfterAttempt3.length).toBe(2);
  });
});

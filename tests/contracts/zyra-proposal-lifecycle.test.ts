import { describe, expect, test } from "bun:test";
import { transitionZyraProposalStatus } from "@/lib/zyra/proposals";

describe("Zyra proposal lifecycle", () => {
  test("requires a second reviewer and explicit proposer confirmation", () => {
    expect(transitionZyraProposalStatus({ from: "validated", to: "reviewed", actorId: "owner", proposerId: "owner", preconditionMatches: true })).toBe("SECOND_REVIEWER_REQUIRED");
    expect(transitionZyraProposalStatus({ from: "validated", to: "reviewed", actorId: "reviewer", proposerId: "owner", preconditionMatches: true })).toBeNull();
    expect(transitionZyraProposalStatus({ from: "reviewed", to: "confirmed", actorId: "reviewer", proposerId: "owner", preconditionMatches: true })).toBe("PROPOSER_CONFIRMATION_REQUIRED");
  });
  test("rejects stale and autonomous apply paths", () => {
    expect(transitionZyraProposalStatus({ from: "reviewed", to: "confirmed", actorId: "owner", proposerId: "owner", preconditionMatches: false })).toBe("STALE_PRECONDITION");
    expect(transitionZyraProposalStatus({ from: "confirmed", to: "applied", actorId: "owner", proposerId: "owner", preconditionMatches: true })).toBe("MUTATION_BOUNDARY_REQUIRED");
  });
});

import { expect, mock, test } from "bun:test";

mock.module("@/db", () => ({ db: { insert: () => { throw new Error("Simulated database outage"); } } }));
const { OpsAiProposalStore } = await import("@/lib/admin-ops-ai/proposal-store");

test("does not return an actionable proposal when persistence fails", async () => {
  const store = new OpsAiProposalStore();
  await expect(store.createProposal({
    runId: "persistence-failure", stepId: "proposal", type: "create_token",
    title: "Persistence fixture", description: "Persistence fixture",
    preview: { summary: "Create a synthetic token" }, payload: { courseIds: ["fixture"], capacity: 1 },
    actorId: "fixture-admin",
  })).rejects.toThrow("OPS_AI_PROPOSAL_PERSISTENCE_FAILED");
});

import { describe, expect, it } from "bun:test";
import { adapterForMuridPath, MURID_ROUTE_ADAPTERS } from "@/lib/murid/compatibility";
import {
  comparePkaParity,
  preserveHistoricalAttemptSnapshot,
  projectMuridIdeas,
} from "@/lib/murid/read-model";

describe("Plan 015 murid read model", () => {
  it("shows only current published Ideas and labels legacy baselines", () => {
    const result = projectMuridIdeas([
      {
        id: "idea-published",
        code: "IDE-1",
        version: 2,
        title: "Limit",
        status: "published",
        ideaMastery: null,
        baseline: { masteryScore: 42, confidence: 80, evidenceCount: 4 },
        legacyConceptName: "Limit",
      },
      {
        id: "idea-draft",
        code: "IDE-2",
        version: 1,
        title: "Draft",
        status: "draft",
        ideaMastery: null,
        baseline: null,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "idea-published", version: 2, status: "published" });
    expect(result[0]?.mastery).toMatchObject({ source: "concept_baseline", label: "concept-level baseline", score: 42 });
  });

  it("keeps historical question and answer snapshots immutable", () => {
    const snapshot = { id: "attempt-1", status: "completed", score: 80, questionsSnapshot: [{ id: "q-v1", prompt: "old" }], answersSnapshot: [{ selected: 1 }] };
    const preserved = preserveHistoricalAttemptSnapshot(snapshot);
    expect(preserved).toEqual(snapshot);
    expect(preserveHistoricalAttemptSnapshot(snapshot)).toEqual(preserved);
  });

  it("detects PKA parity drift using stable hashes", () => {
    const before = { stage: 1, score: 72, snapshot: [{ id: "q-1" }] };
    expect(comparePkaParity(before, { ...before })).toMatchObject({ equal: true });
    expect(comparePkaParity(before, { ...before, score: 71 }).equal).toBe(false);
  });

  it("documents old route ownership and removal conditions", () => {
    expect(MURID_ROUTE_ADAPTERS.length).toBeGreaterThanOrEqual(3);
    expect(adapterForMuridPath("/api/student/today")?.newPath).toBe("/api/murid/today");
    expect(adapterForMuridPath("/murid")?.owner).toBe("murid-route-group");
  });
});

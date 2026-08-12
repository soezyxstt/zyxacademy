import { describe, expect, it } from "bun:test";
import {
  EMBEDDING_PROFILES,
  getModelEntry,
  getProjectAliases,
  getRpdLimit,
  MODEL_REGISTRY,
  normalizeModelId,
  type ModelId,
} from "@/lib/ai/provider/model-registry";

describe("Plan 002 model registry", () => {
  it("contains immutable entries with the approved model families and limits", () => {
    const ids = Object.keys(MODEL_REGISTRY) as ModelId[];
    expect(ids).toContain("gemini-3.1-flash-lite");
    expect(ids).toContain("gemini-3.5-flash");
    expect(ids).toContain("gemini-3.6-flash");
    expect(ids).toContain("gemini-embedding-2");
    expect(ids).not.toContain("gemini-embedding-002" as ModelId);

    for (const id of ids) {
      const entry = getModelEntry(id);
      expect(entry.limits.perProjectRpm).toBeGreaterThan(0);
      expect(entry.limits.perProjectTpm).toBeGreaterThan(0);
      expect(entry.limits.perProjectRpd).toBeGreaterThan(0);
      if (entry.operations.includes("generate")) expect(entry.input.text).toBe(true);
      if (entry.family === "embedding") expect(entry.dimensions).toBe(768);
    }

    expect(getRpdLimit("gemini-3.1-flash-lite")).toBe(500);
    expect(getRpdLimit("gemini-3.5-flash")).toBe(20);
    expect(getRpdLimit("gemini-embedding-2")).toBe(1_000);
  });

  it("normalizes only the supported models prefix and rejects unknown IDs", () => {
    expect(normalizeModelId("models/gemini-3.1-flash-lite")).toBe("gemini-3.1-flash-lite");
    expect(() => normalizeModelId("gemini-does-not-exist")).toThrow("UNKNOWN_MODEL");
  });

  it("keeps quarantined and legacy entries out of ordinary routing", () => {
    expect(getModelEntry("gemini-3.5-flash-lite").ordinaryRoutingAllowed).toBe(false);
    expect(getModelEntry("gemini-embedding-001").ordinaryRoutingAllowed).toBe(false);
    expect(getModelEntry("gemini-3.5-flash-lite").healthGate.minimumSuccessRate).toBe(0.95);
  });

  it("keeps canonical and semantic-cache profiles separate", () => {
    expect(EMBEDDING_PROFILES["canonical-content-v2"].indexAlias).toBe("zyx-vectors-staging-v2");
    expect(EMBEDDING_PROFILES["zyra-semantic-cache-v1"].indexAlias).toBe("zyx-zyra-cache-staging");
    expect(EMBEDDING_PROFILES["canonical-content-v2"].taskInstructionVersion)
      .not.toBe(EMBEDDING_PROFILES["zyra-semantic-cache-v1"].taskInstructionVersion);
    expect(EMBEDDING_PROFILES["canonical-content-v2"].model)
      .toBe(EMBEDDING_PROFILES["zyra-semantic-cache-v1"].model);
  });

  it("rejects duplicate project aliases", () => {
    expect(() => getProjectAliases({
      GEMINI_PROJECT_ALIAS_1: "project-a",
      GEMINI_PROJECT_ALIAS_2: "project-a",
    })).toThrow("GEMINI_PROJECT_ALIASES_MUST_BE_DISTINCT");
  });
});

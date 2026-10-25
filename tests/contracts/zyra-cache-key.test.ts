import { describe, expect, it } from "bun:test";
import {
  buildSharedScaffoldMetadata,
  buildZyraCacheKey,
  normalizeCacheIntent,
  normalizeCacheLanguage,
} from "@/lib/ai/cache/contracts";

const BASE = {
  courseId: "mat-i",
  ideas: [
    { ideaId: "limit", version: 2 },
    { ideaId: "fungsi", version: 1 },
  ],
  evidenceHash: "a".repeat(64),
  normalizedIntent: "  Apa arti 2 + 2 = 4?  ",
  promptVersion: "prompt-v1",
  policyVersion: "policy-v1",
  responseSchemaVersion: "schema-v1",
  evidenceVersion: "evidence-v1",
  language: "bahasa indonesia",
  routeClass: "default",
  visualCapabilityVersion: "visual-v1",
  assessmentMode: "none",
} as const;

describe("Plan 006 canonical exact cache key", () => {
  it("normalizes safe whitespace, Idea ordering, and approved language aliases", () => {
    const first = buildZyraCacheKey(BASE);
    const second = buildZyraCacheKey({
      ...BASE,
      ideas: [...BASE.ideas].reverse(),
      language: "id-ID",
      normalizedIntent: "apa arti 2 + 2 = 4?",
    });
    expect(first).toBe(second);
    expect(normalizeCacheIntent("  A\tB  ")).toBe("a b");
    expect(normalizeCacheLanguage("Indonesian")).toBe("id");
  });

  it("preserves course, numbers, operators, negation, units, policy, and assessment boundaries", () => {
    const variants = [
      { courseId: "mat-ii" },
      { normalizedIntent: "Apa arti 3 + 2 = 5?" },
      { normalizedIntent: "Apa arti 2 - 2 = 0?" },
      { normalizedIntent: "Apa arti tidak sama dengan 2 + 2?" },
      { normalizedIntent: "Apa arti 2 kg?" },
      { policyVersion: "policy-v2" },
      { assessmentMode: "active-attempt" },
      { language: "en" },
      { ideas: [{ ideaId: "limit", version: 3 }] },
    ];
    const keys = variants.map((variant) => buildZyraCacheKey({ ...BASE, ...variant }));
    expect(new Set(keys).size).toBe(variants.length);
  });

  it("builds metadata with no user identity and the semantic-cache profile", () => {
    const metadata = buildSharedScaffoldMetadata(BASE);
    expect(metadata.personalizationAllowed).toBe(false);
    expect(metadata.embeddingProfile).toBe("zyra-semantic-cache-v1");
    expect(metadata.cacheKey).toMatch(/^zyra:exact:v1:[a-f0-9]{64}$/);
    expect(JSON.stringify(metadata)).not.toMatch(/user|student|mastery|history/i);
  });
});

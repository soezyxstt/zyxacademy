import { describe, it, expect } from "bun:test";
import { searchDocs, getDocsKnowledgeBase } from "@/lib/admin-ops-ai/rag-store";

describe("Zyx Ops AI Deep RAG Store", () => {
  it("indexes documentation chunks from docs/ and AGENTS.md", async () => {
    const chunks = await getDocsKnowledgeBase();
    expect(chunks.length).toBeGreaterThan(5);

    const hasFeatures = chunks.some((c) => c.filePath.includes("features.md"));
    const hasSchema = chunks.some((c) => c.filePath.includes("DB_SCHEMA.md") || c.filePath.includes("DATABASE.md"));
    expect(hasFeatures || hasSchema).toBe(true);
  });

  it("finds relevant documentation for token queries", async () => {
    const results = await searchDocs("token aktivasi", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet.toLowerCase()).toBeDefined();
  });

  it("finds relevant documentation for feature flags or runbooks", async () => {
    const results = await searchDocs("feature flags", 3);
    expect(results.length).toBeGreaterThan(0);
  });
});


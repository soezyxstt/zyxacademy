import { describe, expect, it, test } from "bun:test";
import { slugify, preprocessMarkdown } from "@/lib/ko-utils";
import { loadAiFixture } from "../helpers/ai-fixtures";

describe("KO Pipeline Contract Tests", () => {
  it("characterization: slugify creates URL safe slugs", () => {
    expect(slugify(" Definisi & Konsep Limit! ")).toBe("definisi-konsep-limit");
    expect(slugify("Aturan Rantai (Chain Rule)")).toBe("aturan-rantai-chain-rule");
  });

  it("characterization: preprocessMarkdown normalizes unicode and removes invisible characters", () => {
    const raw = "Teorema\u200B Limit\r\nFungsi\u0000";
    const cleaned = preprocessMarkdown(raw);
    expect(cleaned).toBe("Teorema Limit\nFungsi");
  });

  it("characterization: loads ko-spans fixture with valid schema version", () => {
    const fixture = loadAiFixture("ko-spans.json");
    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-KO-SPAN-001");
  });

  test.todo("AI-KO-001: Extract knowledge object spans across multi chunk text boundaries");
  test.todo("AI-KO-002: Resolve ambiguous canonical concept matches deterministically");
});

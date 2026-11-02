import { describe, expect, test } from "bun:test";
import { adminDocs, docSectionId, searchAdminDocs } from "@/lib/admin-docs";

describe("admin documentation", () => {
  test("has unique URL-safe slugs and nonempty content", () => {
    const slugs = adminDocs.map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const doc of adminDocs) {
      expect(doc.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(doc.title.trim()).not.toBe("");
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });

  test("search matches content, multiple words and empty results", () => {
    expect(searchAdminDocs("MA1101 semester").some((doc) => doc.slug === "dokumen-materi")).toBe(true);
    expect(searchAdminDocs("source pack").some((doc) => doc.slug === "mcp-source-pack-dan-idea")).toBe(true);
    expect(searchAdminDocs("tidak-ada-kata-ini")).toEqual([]);
    expect(searchAdminDocs("  ")).toHaveLength(adminDocs.length);
  });

  test("section links are unique within every guide", () => {
    for (const doc of adminDocs) {
      const ids = doc.sections.map((_, index) => docSectionId(index));
      expect(new Set(ids).size).toBe(doc.sections.length);
      expect(ids[0]).toBe("bagian-1");
    }
  });
});

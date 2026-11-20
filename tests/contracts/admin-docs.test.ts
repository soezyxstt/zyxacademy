import { describe, expect, test } from "bun:test";
import { adminDocs, docSectionId, searchAdminDocs } from "@/lib/admin-docs";
import { getAdminDocs, getTutorDocs, searchTutorDocs } from "@/lib/docs";

describe("admin and tutor documentation", () => {
  test("admin docs have unique URL-safe slugs and nonempty content in ID and EN", () => {
    for (const locale of ["id", "en"] as const) {
      const docs = getAdminDocs(locale);
      const slugs = docs.map((doc) => doc.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const doc of docs) {
        expect(doc.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(doc.title.trim()).not.toBe("");
        expect(doc.summary.trim()).not.toBe("");
        expect(doc.sections.length).toBeGreaterThan(0);
      }
    }
    expect(getAdminDocs("id").map((d) => d.slug)).toEqual(getAdminDocs("en").map((d) => d.slug));
  });

  test("tutor docs have unique URL-safe slugs and nonempty content in ID and EN", () => {
    for (const locale of ["id", "en"] as const) {
      const docs = getTutorDocs(locale);
      const slugs = docs.map((doc) => doc.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const doc of docs) {
        expect(doc.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(doc.title.trim()).not.toBe("");
        expect(doc.summary.trim()).not.toBe("");
        expect(doc.sections.length).toBeGreaterThan(0);
      }
    }
    expect(getTutorDocs("id").map((d) => d.slug)).toEqual(getTutorDocs("en").map((d) => d.slug));
  });

  test("search matches content, multiple words and empty results in both locales", () => {
    expect(searchAdminDocs("MA1101 semester", "id").some((doc) => doc.slug === "dokumen-materi")).toBe(true);
    expect(searchAdminDocs("source pack", "id").some((doc) => doc.slug === "mcp-source-pack-dan-idea")).toBe(true);
    expect(searchAdminDocs("activation token", "en").some((doc) => doc.slug === "token-aktivasi")).toBe(true);
    expect(searchAdminDocs("tidak-ada-kata-ini", "id")).toEqual([]);
    expect(searchAdminDocs("  ", "id")).toHaveLength(adminDocs.length);

    expect(searchTutorDocs("90 menit", "id").some((doc) => doc.slug === "jadwal-dan-slot")).toBe(true);
    expect(searchTutorDocs("live quiz", "en").some((doc) => doc.slug === "kuis-langsung")).toBe(true);
    expect(searchTutorDocs("no-match-here", "en")).toEqual([]);
  });

  test("section links are unique within every guide", () => {
    for (const doc of [...getAdminDocs("id"), ...getAdminDocs("en"), ...getTutorDocs("id"), ...getTutorDocs("en")]) {
      const ids = doc.sections.map((_, index) => docSectionId(index));
      expect(new Set(ids).size).toBe(doc.sections.length);
      expect(ids[0]).toBe("bagian-1");
    }
  });

  test("no em dashes or en dashes appear in any doc copy", () => {
    const allDocs = [
      ...getAdminDocs("id"),
      ...getAdminDocs("en"),
      ...getTutorDocs("id"),
      ...getTutorDocs("en"),
    ];
    for (const doc of allDocs) {
      const serialized = JSON.stringify(doc);
      expect(serialized).not.toContain("\u2014");
      expect(serialized).not.toContain("\u2013");
    }
  });
});

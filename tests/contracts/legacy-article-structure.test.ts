import { describe, expect, it } from "bun:test";
import { hasMeaningfulReauthoredOutline, planLegacyArticleConversion } from "@/lib/articles/legacy-structure";

describe("legacy article structure inventory", () => {
  it("marks the attached flat reading pattern for reauthoring instead of inventing one Materi section", () => {
    const flat = `# Pertaksamaan dan Fungsi\n\nSebelum mendalami pertaksamaan dan fungsi pada tingkat kalkulus lanjut, kita perlu mengaktifkan kembali fondasi sistem bilangan real.\n\nBilangan real adalah himpunan semua bilangan yang dapat dinyatakan dalam representasi desimal.\n\nBilangan rasional adalah bilangan real yang dapat dinyatakan sebagai perbandingan dua bilangan bulat.\n\nBilangan irasional tidak dapat dinyatakan sebagai pecahan bilangan bulat.`;
    const plan = planLegacyArticleConversion(flat);
    expect(plan.classification).toBe("needs_reauthoring");
    expect(plan.sections).toEqual([]);
    expect(hasMeaningfulReauthoredOutline(["Materi"])).toBe(false);
    expect(hasMeaningfulReauthoredOutline(["Bilangan Real", "Pertidaksamaan", "Domain dan Fungsi"])).toBe(true);
  });

  it("converts only a trusted heading outline with overview, topics, and summary", () => {
    const paragraph = "Konsep ini dijelaskan dengan konteks, batas penggunaan, dan hubungan yang cukup jelas untuk dibaca sebagai unit belajar mandiri. ".repeat(5);
    const markdown = `# Fungsi\n\n${paragraph}\n\n## Domain Fungsi\n\n${paragraph}\n\n## Komposisi Fungsi\n\n${paragraph}\n\n## Ringkasan\n\n${paragraph}`;
    const plan = planLegacyArticleConversion(markdown);
    expect(plan.classification).toBe("deterministic_convertible");
    expect(plan.sections.map((section) => section.kind)).toEqual(["overview", "topic", "topic", "summary"]);
    expect(new Set(plan.sections.map((section) => section.slug)).size).toBe(plan.sections.length);
  });
});

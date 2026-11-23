import { describe, expect, test } from "bun:test";
import { cleanZyraSessionTitle, isInitialZyraSessionTitle } from "@/lib/zyra/title-ai";

describe("Zyra session title helpers", () => {
  test("cleanZyraSessionTitle normalizes quotes, prefixes, markdown, raw latex delimiters, and length", () => {
    expect(cleanZyraSessionTitle('  "Judul: **Persamaan $3 \\ln x = x^2$**."  ')).toBe("Persamaan 3 \\ln x = x^2");
    expect(cleanZyraSessionTitle("Title: `Turunan fungsi implisit`...")).toBe("Turunan fungsi implisit");
    expect(cleanZyraSessionTitle("   ")).toBeNull();
    expect(cleanZyraSessionTitle('"".')).toBeNull();

    const long = Array.from({ length: 20 }, (_, index) => `topik${index}`).join(" ");
    const cleaned = cleanZyraSessionTitle(long)!;
    expect(cleaned.length).toBeLessThanOrEqual(80);
    expect(cleaned.endsWith(" ")).toBe(false);
  });

  test("isInitialZyraSessionTitle detects placeholder and raw question titles while preserving generated titles", () => {
    expect(isInitialZyraSessionTitle("General Chat")).toBe(true);
    expect(isInitialZyraSessionTitle("Percakapan")).toBe(true);
    expect(isInitialZyraSessionTitle("", "what is 3 ln x = x^2")).toBe(true);
    expect(isInitialZyraSessionTitle("what is 3 ln x = x^2", "what is 3 ln x = x^2")).toBe(true);
    expect(isInitialZyraSessionTitle("Menyelesaikan persamaan logaritma", "what is 3 ln x = x^2")).toBe(false);
  });
});

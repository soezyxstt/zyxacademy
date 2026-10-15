import { describe, expect, test } from "bun:test";
import { learningActivityDescription, learningActivityReferenceCandidates } from "@/lib/learning-activity";

describe("recent learning activity titles", () => {
  const titles = new Map([["article-ma1101-bab1-foundations-v1:v3", "Sistem bilangan"], ["material-1", "Limit"]]);

  test("resolves canonical IDs with repeated legacy article prefixes", () => {
    expect(learningActivityDescription("article-article-ma1101-bab1-foundations-v1:v3", titles)).toBe("Sistem bilangan");
    expect(learningActivityDescription("article-ma1101-bab1-foundations-v1:v3", titles)).toBe("Sistem bilangan");
    expect(learningActivityDescription("material-1", titles)).toBe("Limit");
    expect(learningActivityReferenceCandidates("article-article-x")).toEqual(["article-article-x", "article-x", "x"]);
  });

  test("never renders synthetic selection or missing product IDs", () => {
    expect(learningActivityDescription("selection-1792010868503", titles)).toBe("Bagian materi yang dipilih");
    expect(learningActivityDescription("article-deleted", titles)).toBe("Materi belajar");
    expect(learningActivityDescription("text-product-missing", titles)).toBe("Materi belajar");
  });

  test("preserves concept names and empty events", () => {
    expect(learningActivityDescription("Limit", titles)).toBe("Limit");
    expect(learningActivityDescription(null, titles)).toBe("");
    expect(learningActivityDescription("material-balance pada sistem tertutup", titles)).toBe("material-balance pada sistem tertutup");
    expect(learningActivityDescription("idea-driven learning", titles)).toBe("idea-driven learning");
  });

  test("resolves encoded canonical vector references without exposing missing IDs", () => {
    const conceptTitles = new Map([["idea-1", "Bilangan real"], ["article-1:v3", "Koordinat Kartesius"]]);
    expect(learningActivityDescription("v2:idea:idea-1:2", conceptTitles)).toBe("Bilangan real");
    expect(learningActivityDescription("v2:article:article-1%3Av3:3", conceptTitles)).toBe("Koordinat Kartesius");
    expect(learningActivityDescription("v2:idea:missing:1", conceptTitles)).toBe("Materi belajar");
    expect(learningActivityDescription("v2:idea:%invalid:1", conceptTitles)).toBe("Materi belajar");
    expect(learningActivityDescription("ko-missing", conceptTitles)).toBe("Materi belajar");
  });
});

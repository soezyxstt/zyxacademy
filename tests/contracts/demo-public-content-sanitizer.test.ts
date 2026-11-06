import { describe, expect, test } from "bun:test";
import { DemoPublicContentMetadataError, sanitizeDemoArticle, sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";

describe("public demo content sanitizer", () => {
  test("retains inequalities in learning content", () => {
    expect(sanitizeDemoMarkdown("$x < 2$, $x<y$ dan $y>0$.")).toBe("$x < 2$, $x<y$ dan $y>0$.");
  });
  test("removes destinations and embedded resources while retaining prose and math", () => {
    const value = sanitizeDemoMarkdown('Baca [materi](/api/storage/private?token=abc), ![gambar](https://example.test/x.png), [rujukan][a].\n[a]: /private/file\n<img src="/private"> <svg><a href="/secret">x</a></svg>\nhttps://host.test/file?sig=secret /api/storage/key &#x6a;avascript&#58;alert(1) data&#58;image/png;base64,abc\nNilai $x=1/2$ dan $\\frac{1}{2}$.');
    expect(value).toContain("materi");
    expect(value).toContain("rujukan");
    expect(value).toContain("$x=1/2$");
    expect(value).toContain("$\\frac{1}{2}$");
    expect(value).not.toMatch(/\/api\/storage|private|https?:|javascript:|data:|<svg|<img|\[a\]:/i);
  });

  test("withholds source figures and coding locators but retains safe graph and nested text without mutation", () => {
    const graph = { id: "graph", kind: "epsilon_delta_graph", label: "Limit", description: "Grafik", bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, staticFallback: { type: "text", summary: "Limit", content: "$x$" }, limitPoint: 0, limitValue: 0, defaultEpsilon: 1, defaultDelta: 1, functionModel: { kind: "linear", m: 1, b: 0 } } as const;
    const figure = { id: "figure", kind: "source_figure", label: "Gambar", description: "Diagram", assetId: "secret-id", interactive: false, staticFallback: { type: "text", summary: "Diagram", content: "Isi" }, asset: { assetId: "secret-id", imageUrl: "/api/storage/private", attribution: "", width: 1, height: 1 } } as const;
    const article = { id: "article", courseId: "course", chapterId: "chapter", slug: "article", title: "Judul", courseTitle: "Kursus", chapterTitle: null, chapterNumber: 1, version: 1, totalEstimatedReadingMinutes: 1, visuals: [graph, figure], sections: [{ id: "section", slug: "section", title: "Bagian", sectionNumber: "1", sectionKind: "topic", learningObjective: "Tujuan", estimatedReadingMinutes: 1, orderIndex: 0, parentSectionId: null, blocks: [{ id: "block", blockKey: "block", blockType: "explanation", title: null, orderIndex: 0, content: "Teks [tautan](/secret)", parts: [{ id: "v", kind: "visual_ref", visualId: "figure" }, { id: "g", kind: "visual_ref", visualId: "graph" }, { id: "c", kind: "coding_exercise", problem: { problemId: "private-problem", version: 1 } }, { id: "w", kind: "worked_example", title: "Contoh", problemMarkdown: "[Soal](/private)", verificationMarkdown: "$x=2$", steps: [{ id: "s", operationMarkdown: "Hitung", reasonMarkdown: "[Alasan](https://example.test)", sourceElementRefs: ["w"], parts: [{ id: "m", kind: "markdown", markdown: "Nilai $x$" }] }] }] }] }] } as unknown as PublicArticleReadModel;
    const before = JSON.stringify(article);
    const result = sanitizeDemoArticle(article);
    expect(JSON.stringify(article)).toBe(before);
    expect(result.visuals?.map(v => v.id)).toEqual(["graph"]);
    expect(JSON.stringify(result)).not.toMatch(/secret-id|\/api\/storage|private-problem|\/private|https?:/);
    expect(result.sections[0].blocks[0].parts?.[0]).toMatchObject({ kind: "markdown", markdown: "Visual belum tersedia." });
    expect(JSON.stringify(result)).toContain("Nilai $x$");
    expect(JSON.stringify(result)).toContain("$x=2$");
  });

  test("rejects unsafe structural identifiers and discards private or unknown fields", () => {
    const base = { id: "article", courseId: "course", chapterId: "chapter", slug: "geometri-ruang", title: "Judul", courseTitle: "Kursus", chapterTitle: null, chapterNumber: 1, version: 1, totalEstimatedReadingMinutes: 1, progress: { private: "/secret" }, extra: "/secret", sections: [{ id: "section", slug: "perubahan-α", title: "Bagian", sectionNumber: "1.1", sectionKind: "topic", learningObjective: "Tujuan", estimatedReadingMinutes: 1, orderIndex: 0, parentSectionId: null, blocks: [{ id: "block", blockKey: "key", blockType: "explanation", title: null, orderIndex: 0, content: "Teks", parts: [{ id: "math", kind: "math_unit", latex: "dx/dt", meaningMarkdown: "distance/time", symbolRefs: ["symbol"] }], formativeCheck: { checkKind: "multiple_choice", evaluationMode: null, options: [{ id: "a", text: "A", answer: true }], correctAnswer: "a" } }] }] } as unknown as PublicArticleReadModel;
    expect(sanitizeDemoArticle({ ...base, id: "article:v3" }).id).toBe("article:v3");
    expect(() => sanitizeDemoArticle({ ...base, id: "javascript:alert" })).toThrow(DemoPublicContentMetadataError);
    const result = sanitizeDemoArticle(base);
    expect(result.progress).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/extra|private|correctAnswer|"answer"/);
    expect(JSON.stringify(result)).toContain("distance/time");
    expect(JSON.stringify(result)).toContain("dx/dt");
    for (const mutate of [
      (a: PublicArticleReadModel) => { a.slug = "%2Fapi%2Fstorage"; },
      (a: PublicArticleReadModel) => { a.chapterId = "../private"; },
      (a: PublicArticleReadModel) => { a.sections[0].blocks[0].parts![0] = { id: "p", kind: "visual_ref", visualId: "https://host/private" }; },
      (a: PublicArticleReadModel) => { a.sections[0].blocks[0].parts![0] = { id: "m", kind: "math_unit", latex: "x", meaningMarkdown: "x", symbolRefs: ["/api/storage"] }; },
      (a: PublicArticleReadModel) => { a.sections[0].orderIndex = Infinity; },
    ]) {
      const input = structuredClone(base); mutate(input);
      expect(() => sanitizeDemoArticle(input)).toThrow(DemoPublicContentMetadataError);
    }
    expect((base as unknown as { extra: string }).extra).toBe("/secret");
  });

});

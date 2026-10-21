import { describe, expect, it, beforeEach, spyOn, mock } from "bun:test";
import path from "path";
import * as ReactActual from "react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import katex from "katex";

// Mock server-only before any server module imports
mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Set up React Server Cache Dispatcher
const ReactServer = require(path.resolve("node_modules/react/react.react-server.js"));
const internals =
  ReactServer.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
  ReactServer.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

let currentCacheStore = new Map();
internals.A = {
  getCacheForType(createFn: () => any) {
    if (!currentCacheStore.has(createFn)) {
      currentCacheStore.set(createFn, createFn());
    }
    return currentCacheStore.get(createFn);
  },
};

function resetRequestCache() {
  currentCacheStore = new Map();
}

// Mock react to supply ReactServer.cache while preserving client components
mock.module("react", () => ({
  ...ReactActual,
  cache: ReactServer.cache,
  default: {
    ...ReactActual.default,
    cache: ReactServer.cache,
  },
}));

// Track DB query counts for actual repository calls
export const queryCounters = {
  mataKuliah: 0,
  artikel: 0,
  bab: 0,
  bagianArtikel: 0,
  blokArtikel: 0,
  kemajuanBacaArtikel: 0,
  diktatMateri: 0,
};

function resetQueryCounters() {
  queryCounters.mataKuliah = 0;
  queryCounters.artikel = 0;
  queryCounters.bab = 0;
  queryCounters.bagianArtikel = 0;
  queryCounters.blokArtikel = 0;
  queryCounters.kemajuanBacaArtikel = 0;
  queryCounters.diktatMateri = 0;
}

let activeUserForProgress: string | null = null;

// Mock database data
export const mockData = {
  course: {
    id: "course-uuid-1",
    legacyCourseId: "kalkulus-1",
    title: "Kalkulus 1",
  },
  article: {
    id: "art-uuid-1",
    mataKuliahId: "course-uuid-1",
    slug: "teorema-dasar",
    title: "Teorema Dasar Kalkulus",
    version: 1,
    status: "published",
    structureStatus: "structured",
    babId: "bab-uuid-1",
    contentMarkdown: "Konten artikel <!--__ZYX_V3_ARTICLE_VISUALS__:W10=-->",
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    publishedAt: new Date("2026-02-01T00:00:00Z"),
  },
  chapter: {
    id: "bab-uuid-1",
    title: "Bab 1: Integral",
    legacyChapterId: "ch-integral",
    orderIndex: 1,
  },
  sections: [
    {
      id: "sec-uuid-1",
      artikelId: "art-uuid-1",
      version: 1,
      status: "published",
      orderIndex: 1,
      slug: "pengantar-teorema",
      title: "Pengantar Teorema",
      estimatedReadingMinutes: 4,
      learningObjective:
        "Memahami intuisi kalkulus <!--__ZYX_V3_SECTION_PEDAGOGY__:eyJ2aXN1YWxSZXF1aXJlbWVudCI6eyJzdGF0dXMiOiJyZXF1aXJlZCIsInZpc3VhbElkcyI6WyJ2aXMtMSJdfX0-->",
    },
    {
      id: "sec-uuid-2",
      artikelId: "art-uuid-1",
      version: 1,
      status: "published",
      orderIndex: 2,
      slug: "bukti-formal",
      title: "Bukti Formal",
      estimatedReadingMinutes: 6,
      learningObjective: "Mampu membuktikan teorema dengan benar",
    },
  ],
  blocks: [
    {
      id: "blk-uuid-1",
      artikelId: "art-uuid-1",
      bagianArtikelId: "sec-uuid-1",
      version: 1,
      status: "published",
      orderIndex: 1,
      blockType: "worked_example",
      content:
        "Berikut contoh pengerjaan <!--__ZYX_V3_BLOCK_PAYLOAD__:eyJ3b3JrZWRFeGFtcGxlUGF5bG9hZCI6eyJ2ZXJpZmljYXRpb24iOiJzb2x2ZWQiLCJzdGVwcyI6W3sic3RlcEluZGV4IjowLCJsYWJlbCI6IkxhbmdrYWggMSIsImV4cGxhbmF0aW9uIjoiVHVydW5rYW4gZnVuZ3NpIiwicmVhc29uIjoiQXR1cmFuIHJhbnRhaSJ9XX19-->",
    },
    {
      id: "blk-uuid-2",
      artikelId: "art-uuid-1",
      bagianArtikelId: "sec-uuid-2",
      version: 1,
      status: "published",
      orderIndex: 2,
      blockType: "formula",
      content: "\\int_a^b f(x) dx = F(b) - F(a)",
    },
  ],
  userProgressAlice: [
    {
      id: "prog-alice-1",
      penggunaId: "user-alice",
      artikelId: "art-uuid-1",
      bagianArtikelId: "sec-uuid-1",
      artikelVersion: 1,
      maxReadPercent: 100,
      timeSpentSeconds: 240,
      completedAt: new Date("2026-02-02T10:00:00Z"),
    },
    {
      id: "prog-alice-2",
      penggunaId: "user-alice",
      artikelId: "art-uuid-1",
      bagianArtikelId: "sec-uuid-2",
      artikelVersion: 1,
      maxReadPercent: 100,
      timeSpentSeconds: 360,
      completedAt: new Date("2026-02-02T10:15:00Z"),
    },
  ],
  userProgressBob: [
    {
      id: "prog-bob-1",
      penggunaId: "user-bob",
      artikelId: "art-uuid-1",
      bagianArtikelId: "sec-uuid-1",
      artikelVersion: 1,
      maxReadPercent: 50,
      timeSpentSeconds: 120,
      completedAt: null,
    },
  ],
};

// Mock @/db
mock.module("@/db", () => {
  return {
    db: {
      select: (selectFields?: any) => {
        return {
          from: (table: any) => {
            const tableName = table?.[Symbol.for("drizzle:Name")] || "";
            return {
              leftJoin: (_joinTable: any, _joinCond: any) => ({
                where: (_whereCond: any) => ({
                  limit: async (_limitCount: number) => {
                    if (tableName === "artikel") {
                      queryCounters.artikel++;
                      return [
                        {
                          ...mockData.article,
                          legacyChapterId: mockData.chapter.legacyChapterId,
                        },
                      ];
                    }
                    if (tableName === "diktat_materi") {
                      queryCounters.diktatMateri++;
                      return [];
                    }
                    return [];
                  },
                }),
              }),
              where: (whereCond: any) => {
                const queryPromise = (async () => {
                  if (tableName === "mata_kuliah") {
                    queryCounters.mataKuliah++;
                    return [mockData.course];
                  }
                  if (tableName === "artikel") {
                    queryCounters.artikel++;
                    return [mockData.article];
                  }
                  if (tableName === "bab") {
                    queryCounters.bab++;
                    return [mockData.chapter];
                  }
                  if (tableName === "bagian_artikel") {
                    queryCounters.bagianArtikel++;
                    return mockData.sections;
                  }
                  if (tableName === "blok_artikel") {
                    queryCounters.blokArtikel++;
                    return mockData.blocks;
                  }
                  if (tableName === "kemajuan_baca_artikel") {
                    queryCounters.kemajuanBacaArtikel++;
                    if (activeUserForProgress === "user-alice") {
                      return mockData.userProgressAlice;
                    }
                    if (activeUserForProgress === "user-bob") {
                      return mockData.userProgressBob;
                    }
                    return [];
                  }
                  if (tableName === "knowledge_objects") {
                    return [
                      { conceptId: "concept-1", conceptName: "Turunan dan Integral" },
                    ];
                  }
                  if (tableName === "concept_localizations") {
                    return [
                      { conceptId: "concept-1", displayName: "Turunan", aliases: ["Derivatif"] },
                    ];
                  }
                  return [];
                })();

                return Object.assign(queryPromise, {
                  limit: async (_n: number) => {
                    const rows = await queryPromise;
                    return rows.slice(0, _n);
                  },
                  orderBy: async (..._args: any[]) => {
                    return queryPromise;
                  },
                });
              },
            };
          },
        };
      },
    },
  };
});

// Import production helpers after mocking @/db and server-only
const {
  getCanonicalPublishedArticle,
  getCanonicalPublishedArticlesForCourse,
  getCanonicalPublishedTextProduct,
  findCanonicalMataKuliah,
} = await import("@/lib/articles/structured-repository");

const { buildCourseTermIndex, buildTermIndex } = await import("@/lib/term-index");
const { MathText } = await import("@/components/course/math-text");
const { MarkdownRenderer } = await import("@/components/course/markdown-renderer");
const {
  renderKatexToString,
  clearKatexRenderCache,
  katexRenderCache,
  KATEX_CACHE_MAX_ENTRIES,
  KATEX_CACHE_MAX_INPUT_LENGTH,
} = await import("@/lib/math/katex-render");

describe("KaTeX Production Renderer & Bounded Memoization", () => {
  beforeEach(() => {
    clearKatexRenderCache();
  });

  it("renders MathText via SSR renderToStaticMarkup and caches calls using production spy", () => {
    const spy = spyOn(katex, "renderToString");
    const formulaText = "$E = mc^2$";

    // First SSR render
    const html1 = renderToStaticMarkup(
      React.createElement(MathText, { bareMath: false }, formulaText),
    );
    expect(html1).toContain("katex");
    expect(spy).toHaveBeenCalledTimes(1);

    // Second SSR render of the exact same component and formula
    const html2 = renderToStaticMarkup(
      React.createElement(MathText, { bareMath: false }, formulaText),
    );
    expect(html2).toBe(html1);
    // Spy count must NOT increase on cache hit
    expect(spy).toHaveBeenCalledTimes(1);

    // Rendering a different formula increments the spy count
    const html3 = renderToStaticMarkup(
      React.createElement(MathText, { bareMath: false }, "$\\nabla \\times B = \\mu_0 J$"),
    );
    expect(html3).toContain("katex");
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it("preserves exact formula block options without altering displayMode or strict/trust config", () => {
    const spy = spyOn(katex, "renderToString");

    // ASTBlockRenderer formula calls renderKatexToString with { throwOnError: false, displayMode: true }
    const latex = "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}";
    const outDisplay = renderKatexToString(latex, { throwOnError: false, displayMode: true });
    expect(outDisplay).toContain("katex-display");
    expect(spy).toHaveBeenCalledTimes(1);

    // Formula reference calls renderKatexToString with { throwOnError: false, displayMode: false }
    const outInline = renderKatexToString(latex, { throwOnError: false, displayMode: false });
    expect(outInline).not.toContain("katex-display");
    // Because options differ (displayMode false vs true), cache keys are distinct
    expect(spy).toHaveBeenCalledTimes(2);

    // Calling again with displayMode: true hits the display cache
    const outDisplayRepeat = renderKatexToString(latex, { throwOnError: false, displayMode: true });
    expect(outDisplayRepeat).toBe(outDisplay);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it("handles invalid LaTeX syntax gracefully with throwOnError: false", () => {
    const invalidLatex = "\\frac{unfinished";
    const rendered = renderKatexToString(invalidLatex, { throwOnError: false, displayMode: true });
    expect(rendered).toBeDefined();
    expect(typeof rendered).toBe("string");
  });

  it("keeps error policy and every output option in the cache key", () => {
    renderKatexToString("\\frac{", { throwOnError: false });
    expect(() => renderKatexToString("\\frac{", {})).toThrow();
    expect(renderKatexToString("x", { output: "mathml" })).not.toContain('class="katex-html"');
    expect(renderKatexToString("x", { output: "html" })).toContain('class="katex-html"');
  });

  it("bypasses mutable macros instead of returning obsolete expansion", () => {
    const macros = { "\\answer": "1" };
    const first = renderKatexToString("\\answer", { macros });
    macros["\\answer"] = "2";
    expect(renderKatexToString("\\answer", { macros })).not.toBe(first);
    expect(katexRenderCache.size).toBe(0);
  });

  it("bounds cache size by entry count and evicts oldest entries", () => {
    // Populate up to max entries
    for (let i = 0; i < KATEX_CACHE_MAX_ENTRIES + 10; i++) {
      renderKatexToString(`x_{${i}}`, { throwOnError: false, displayMode: false });
    }

    expect(katexRenderCache.size).toBeLessThanOrEqual(KATEX_CACHE_MAX_ENTRIES);
  });

  it("bypasses caching for excessively large latex inputs to prevent memory bloat", () => {
    const hugeLatex = "x + ".repeat(KATEX_CACHE_MAX_INPUT_LENGTH + 10) + "1";
    const initialCacheSize = katexRenderCache.size;

    renderKatexToString(hugeLatex, { throwOnError: false, displayMode: false });

    // Cache size should not grow because input exceeded KATEX_CACHE_MAX_INPUT_LENGTH
    expect(katexRenderCache.size).toBe(initialCacheSize);
  });
});

describe("Structured Article Repository - Production Queries & RSC Deduplication", () => {
  beforeEach(() => {
    resetRequestCache();
    resetQueryCounters();
    activeUserForProgress = null;
  });

  it("deduplicates shared DB queries between metadata (no user) and page (Alice) within the same request", async () => {
    // 1. Metadata invocation (no userId)
    const metadataResult = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar");
    expect(metadataResult).not.toBeNull();
    expect(metadataResult?.id).toBe("art-uuid-1");
    expect(metadataResult?.chapterTitle).toBe("Bab 1: Integral");

    // First call executed DB queries for shared course, article, bab, sections, blocks
    const initialArtikelQueries = queryCounters.artikel;
    const initialSectionQueries = queryCounters.bagianArtikel;
    expect(initialArtikelQueries).toBeGreaterThan(0);
    expect(initialSectionQueries).toBeGreaterThan(0);

    // 2. Page render invocation in same request with user Alice
    activeUserForProgress = "user-alice";
    const aliceResult = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar", "user-alice");
    expect(aliceResult).not.toBeNull();
    expect(aliceResult?.id).toBe("art-uuid-1");
    expect(aliceResult?.progress?.completed).toBe(true);
    expect(aliceResult?.progress?.overallPercent).toBe(100);

    // Shared queries MUST NOT increment (React cache hit)
    expect(queryCounters.artikel).toBe(initialArtikelQueries);
    expect(queryCounters.bagianArtikel).toBe(initialSectionQueries);
  });

  it("isolates Bob's progress from Alice's while continuing to share cached article content", async () => {
    // Call for Alice
    activeUserForProgress = "user-alice";
    const aliceResult = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar", "user-alice");
    expect(aliceResult?.progress?.completed).toBe(true);
    expect(aliceResult?.progress?.overallPercent).toBe(100);
    const artikelQueriesAfterAlice = queryCounters.artikel;

    // Call for Bob in same request
    activeUserForProgress = "user-bob";
    const bobResult = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar", "user-bob");
    expect(bobResult).not.toBeNull();
    expect(bobResult?.id).toBe("art-uuid-1");
    expect(bobResult?.progress?.completed).toBe(false);
    expect(bobResult?.progress?.sectionProgress["sec-uuid-1"]?.maxReadPercent).toBe(50);

    // Shared article queries did not run again
    expect(queryCounters.artikel).toBe(artikelQueriesAfterAlice);
  });

  it("refetches fresh content when a new request context begins (request cache reset)", async () => {
    // Request 1
    activeUserForProgress = "user-alice";
    await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar", "user-alice");
    const req1ArtikelQueries = queryCounters.artikel;
    expect(req1ArtikelQueries).toBeGreaterThan(0);

    // Request 2 (simulating fresh server request lifecycle)
    resetRequestCache();

    await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar", "user-alice");
    // New request must execute a fresh query
    expect(queryCounters.artikel).toBeGreaterThan(req1ArtikelQueries);
  });

  it("correctly parses section pedagogy metadata and cleans learningObjective from HEAD format", async () => {
    const article = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar");
    expect(article).not.toBeNull();
    expect(article?.sections).toBeDefined();
    expect(article!.sections.length).toBe(2);

    // Section 1 had embedded pedagogy with visual requirement
    const sec1 = article!.sections[0];
    expect(sec1.title).toBe("Pengantar Teorema");
    // Raw was: "Memahami intuisi kalkulus <!--__ZYX_V3_SECTION_PEDAGOGY__:eyJ2aXN1YWxSZXF1aXJlbWVudCI6eyJzdGF0dXMiOiJyZXF1aXJlZCIsInZpc3VhbElkcyI6WyJ2aXMtMSJdfX0-->"
    expect(sec1.learningObjective).toBe("Memahami intuisi kalkulus");
    expect(sec1.pedagogy?.visualRequirement).toEqual({
      status: "required",
      visualIds: ["vis-1"],
    });

    // Section 2 had plain objective without pedagogy
    const sec2 = article!.sections[1];
    expect(sec2.title).toBe("Bukti Formal");
    expect(sec2.learningObjective).toBe("Mampu membuktikan teorema dengan benar");
    expect(sec2.pedagogy?.visualRequirement).toBeUndefined();
  });

  it("correctly extracts block payloads and article visuals without crashing", async () => {
    const article = await getCanonicalPublishedArticle("kalkulus-1", "teorema-dasar");
    expect(article).not.toBeNull();

    // Block 1 under Section 1 had workedExamplePayload
    const sec1 = article!.sections[0];
    expect(sec1.blocks.length).toBeGreaterThan(0);
    const blk1 = sec1.blocks[0];
    expect(blk1.content).toBe("Berikut contoh pengerjaan");
    expect(blk1.workedExample).toBeDefined();
    expect((blk1.workedExample as any).verification).toBe("solved");
    expect((blk1.workedExample as any).steps[0].label).toBe("Langkah 1");

    // Article visuals
    expect(article!.visuals).toBeUndefined();
  });

  it("returns null safely for invalid or whitespace course and article IDs", async () => {
    expect(await getCanonicalPublishedArticle("", "teorema-dasar")).toBeNull();
    expect(await getCanonicalPublishedArticle("   ", "teorema-dasar")).toBeNull();
    expect(await getCanonicalPublishedArticle("kalkulus-1", "")).toBeNull();
    expect(await getCanonicalPublishedArticle("kalkulus-1", "   ")).toBeNull();
  });

  it("handles course articles summary deduplication and calculates estimated minutes", async () => {
    const summaries = await getCanonicalPublishedArticlesForCourse("kalkulus-1", "user-alice");
    expect(summaries).toBeDefined();
    expect(summaries.length).toBe(1);

    const summary = summaries[0];
    expect(summary.id).toBe("art-uuid-1");
    expect(summary.courseId).toBe("kalkulus-1");
    expect(summary.sectionsCount).toBe(2);
    // Estimated reading minutes: 4 + 6 = 10
    expect(summary.totalEstimatedReadingMinutes).toBe(10);
  });
});

describe("Term Index Caching Contracts", () => {
  beforeEach(() => {
    resetRequestCache();
  });

  it("returns empty array safely for empty or whitespace identifiers", async () => {
    expect(await buildCourseTermIndex("")).toEqual([]);
    expect(await buildCourseTermIndex("   ")).toEqual([]);
    expect(await buildTermIndex("")).toEqual([]);
    expect(await buildTermIndex("   ")).toEqual([]);
  });

  it("builds sorted term index ordered longest-term first", async () => {
    const terms = await buildCourseTermIndex("course-uuid-1");
    expect(terms.length).toBeGreaterThan(0);
    for (let i = 0; i < terms.length - 1; i++) {
      expect(terms[i].term.length).toBeGreaterThanOrEqual(terms[i + 1].term.length);
    }
  });
});

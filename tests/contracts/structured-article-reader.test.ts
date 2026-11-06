import { describe, expect, it } from "bun:test";
import {
  computeDeterministicSectionNumbering,
  resolveActiveSection,
  searchArticleContent,
  buildPublicArticleReadModel,
  type PublicSectionReadModel,
} from "@/lib/articles/structured-read-model";

describe("Structured Article Reader Contracts", () => {
  it("keeps a visual at its teaching block without repeating it above the section", () => {
    const visual = {
      id: "limit-plot", kind: "epsilon_delta_graph", label: "Limit", description: "Limit kuadratik",
      bounds: { xMin: 0, xMax: 4, yMin: -2, yMax: 10 },
      staticFallback: { type: "text", summary: "Limit", content: "Nilai mendekati 3." },
      limitPoint: 2, limitValue: 3, defaultDelta: 0.2, defaultEpsilon: 0.8,
      functionModel: { kind: "quadratic", a: 1, b: 0, c: -1 },
    };
    const article = buildPublicArticleReadModel(
      { id: "article", slug: "limit", version: 1, title: "Limit", visuals: [visual] },
      [{ id: "section", slug: "limit", title: "Limit", status: "published", pedagogy: { visualRequirement: { status: "required", visualIds: [visual.id] } } }],
      [{ id: "block", bagianArtikelId: "section", status: "published", content: "Limit", blockType: "verbal_representation", visualIds: [visual.id] }],
      [], "chapter",
    );
    expect(article.sections[0].blocks[0].visuals?.map(item => item.id)).toEqual([visual.id]);
    expect(article.sections[0].visuals).toBeUndefined();
  });

  it("uses the catalogue title and chapter number instead of a verbose article title", () => {
    const article = buildPublicArticleReadModel(
      { id: "functions", slug: "functions", title: "Matematika I Bab 3: Fungsi dan Limit, Grafik, dan Kekontinuan", version: 1 },
      [], [], [],
      { id: "chapter-2", title: "Fungsi dan Limit", number: 2 },
    );
    expect(article.title).toBe("Fungsi dan Limit");
    expect(article.chapterNumber).toBe(2);
  });

  describe("Deterministic Section Numbering", () => {
    it("assigns sequential numbers for flat sections ordered by orderIndex", () => {
      const flatSections = [
        { id: "sec-3", orderIndex: 2, slug: "ringkasan", title: "Ringkasan" },
        { id: "sec-1", orderIndex: 0, slug: "pengantar", title: "Pengantar" },
        { id: "sec-2", orderIndex: 1, slug: "konsep-utama", title: "Konsep Utama" },
      ];

      const numberMap = computeDeterministicSectionNumbering(flatSections);
      expect(numberMap.get("sec-1")).toBe("1");
      expect(numberMap.get("sec-2")).toBe("2");
      expect(numberMap.get("sec-3")).toBe("3");
    });

    it("assigns hierarchical numbering (1, 1.1, 1.2, 2) when parentSectionId is present", () => {
      const treeSections = [
        { id: "root-1", orderIndex: 0, slug: "bab-1", title: "Bab 1" },
        { id: "child-1-1", parentSectionId: "root-1", orderIndex: 0, slug: "sub-1-1", title: "Sub 1.1" },
        { id: "child-1-2", parentSectionId: "root-1", orderIndex: 1, slug: "sub-1-2", title: "Sub 1.2" },
        { id: "root-2", orderIndex: 1, slug: "bab-2", title: "Bab 2" },
      ];

      const numberMap = computeDeterministicSectionNumbering(treeSections);
      expect(numberMap.get("root-1")).toBe("1");
      expect(numberMap.get("child-1-1")).toBe("1.1");
      expect(numberMap.get("child-1-2")).toBe("1.2");
      expect(numberMap.get("root-2")).toBe("2");
    });

    it("uses chapter-aware labels and supports three hierarchy levels", () => {
      const sections = [
        { id: "overview", orderIndex: 0, sectionKind: "overview" },
        { id: "topic", orderIndex: 1, sectionKind: "topic" },
        { id: "child", parentSectionId: "topic", orderIndex: 0, sectionKind: "topic" },
        { id: "summary", orderIndex: 2, sectionKind: "summary" },
      ];
      const numberMap = computeDeterministicSectionNumbering(sections, 1);
      expect(numberMap.get("overview")).toBe("Ikhtisar");
      expect(numberMap.get("topic")).toBe("1.1");
      expect(numberMap.get("child")).toBe("1.1.1");
      expect(numberMap.get("summary")).toBe("Ringkasan");
    });
  });

  describe("Active Section Resolution and Fallback", () => {
    const mockSections: PublicSectionReadModel[] = [
      {
        id: "sec-1",
        slug: "pendahuluan",
        title: "Pendahuluan",
        sectionNumber: "1",
        sectionKind: "overview",
        learningObjective: "Memahami dasar",
        estimatedReadingMinutes: 3,
        orderIndex: 0,
        parentSectionId: null,
        blocks: [],
      },
      {
        id: "sec-2",
        slug: "turunan-fungsi",
        title: "Turunan Fungsi",
        sectionNumber: "2",
        sectionKind: "topic",
        learningObjective: "Menghitung turunan",
        estimatedReadingMinutes: 5,
        orderIndex: 1,
        parentSectionId: null,
        blocks: [],
      },
      {
        id: "sec-3",
        slug: "ringkasan",
        title: "Ringkasan",
        sectionNumber: "3",
        sectionKind: "summary",
        learningObjective: "Merangkum rumus",
        estimatedReadingMinutes: 2,
        orderIndex: 2,
        parentSectionId: null,
        blocks: [],
      },
    ];

    it("resolves exact matching slug from URL", () => {
      const active = resolveActiveSection(mockSections, "turunan-fungsi");
      expect(active?.id).toBe("sec-2");
      expect(active?.slug).toBe("turunan-fungsi");
    });

    it("falls back to lastReadSlug when requestedSlug is invalid or missing", () => {
      const activeInvalid = resolveActiveSection(mockSections, "invalid-slug-404", "ringkasan");
      expect(activeInvalid?.id).toBe("sec-3");

      const activeNullReq = resolveActiveSection(mockSections, null, "turunan-fungsi");
      expect(activeNullReq?.id).toBe("sec-2");
    });

    it("falls back to the first section when neither requestedSlug nor lastReadSlug matches", () => {
      const active = resolveActiveSection(mockSections, "unknown-slug", "another-unknown");
      expect(active?.id).toBe("sec-1");
      expect(active?.slug).toBe("pendahuluan");
    });

    it("returns null on empty sections list", () => {
      const active = resolveActiveSection([], "any-slug");
      expect(active).toBeNull();
    });
  });

  describe("Chapter-Local Search", () => {
    const mockSections: PublicSectionReadModel[] = [
      {
        id: "sec-1",
        slug: "vektor-dan-ruang",
        title: "Pengantar Vektor dan Ruang",
        sectionNumber: "1",
        sectionKind: "overview",
        learningObjective: "Mahasiswa mampu memahami definisi ruang vektor berdimensi n.",
        estimatedReadingMinutes: 4,
        orderIndex: 0,
        parentSectionId: null,
        blocks: [
          {
            id: "b-1",
            blockKey: "bk-1",
            blockType: "explanation",
            title: "Definisi Formal Vektor",
            orderIndex: 0,
            content: "Vektor dalam aljabar linear merupakan elemen dari ruang vektor dengan operasi penjumlahan dan perkalian skalar.",
          },
          {
            id: "b-2",
            blockKey: "bk-2",
            blockType: "worked_example",
            title: "Contoh Soal Dot Product",
            orderIndex: 1,
            content: "Diberikan dua vektor $$u = (1, 2)$$ dan $$v = (3, 4)$$. Hitung hasil kali titik.",
          },
        ],
      },
      {
        id: "sec-2",
        slug: "matriks-transformasi",
        title: "Matriks Transformasi Linier",
        sectionNumber: "2",
        sectionKind: "topic",
        learningObjective: "Mengkonstruksi matriks representasi.",
        estimatedReadingMinutes: 6,
        orderIndex: 1,
        parentSectionId: null,
        blocks: [
          {
            id: "b-3",
            blockKey: "bk-3",
            blockType: "misconception",
            title: "Perkalian Matriks Tidak Komutatif",
            orderIndex: 0,
            content: "Banyak mahasiswa mengira $A \\cdot B = B \\cdot A$, padahal perkalian matriks umumnya tidak komutatif.",
          },
        ],
      },
    ];

    it("finds match in section title", () => {
      const results = searchArticleContent(mockSections, "Transformasi");
      expect(results.length).toBe(1);
      expect(results[0].sectionId).toBe("sec-2");
      expect(results[0].matchType).toBe("title");
    });

    it("finds match in learning objective with snippet", () => {
      const results = searchArticleContent(mockSections, "berdimensi n");
      expect(results.length).toBe(1);
      expect(results[0].sectionId).toBe("sec-1");
      expect(results[0].matchType).toBe("objective");
      expect(results[0].snippet).toContain("ruang vektor berdimensi n");
    });

    it("finds match in block content and title", () => {
      const results = searchArticleContent(mockSections, "komutatif");
      expect(results.length).toBe(1);
      expect(results[0].sectionId).toBe("sec-2");
      expect(results[0].matchType).toBe("block");
      expect(results[0].blockTitle).toBe("Perkalian Matriks Tidak Komutatif");
    });

    it("returns empty array for short or whitespace queries", () => {
      expect(searchArticleContent(mockSections, "")).toEqual([]);
      expect(searchArticleContent(mockSections, " ")).toEqual([]);
      expect(searchArticleContent(mockSections, "a")).toEqual([]);
    });
  });

  describe("Public Model Redaction & Sanitization", () => {
    it("strictly strips internal Idea, provenance, source refs, hashes, and identity fields", () => {
      const rawArticle = {
        id: "art-101",
        mataKuliahId: "course-mat-1",
        babId: "bab-9",
        slug: "aljabar-linear-dasar",
        title: "Aljabar Linear Dasar",
        version: 1,
        status: "published",
        sourceHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        generationHash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        creatorId: "user-creator-1",
        curatorId: "user-curator-2",
        ideId: "ide-33",
        ideaIds: ["ide-33", "ide-34"],
        reviewerState: "approved",
      };

      const rawSections = [
        {
          id: "sec-1",
          artikelId: "art-101",
          sectionKey: "sec-key-1",
          sectionKind: "topic",
          slug: "vektor",
          title: "Vektor",
          learningObjective: "Memahami vektor",
          orderIndex: 0,
          estimatedReadingMinutes: 4,
          version: 1,
          status: "published",
          ideId: "ide-33",
          sourceRefs: [{ sourceId: "s-1", version: 1, checksum: "abc" }],
        },
        {
          id: "sec-draft",
          artikelId: "art-101",
          slug: "draft-section",
          title: "Draft Section",
          orderIndex: 1,
          version: 1,
          status: "draft",
        },
      ];

      const rawBlocks = [
        {
          id: "blk-1",
          artikelId: "art-101",
          bagianArtikelId: "sec-1",
          blockKey: "bkey-1",
          blockType: "explanation",
          title: "Penjelasan Vektor",
          orderIndex: 0,
          content: "Penjelasan lengkap vektor.",
          version: 1,
          status: "published",
          generationHash: "abc",
          sourceChecksum: "123",
          excerptIds: ["exc-1"],
          ideaIds: ["ide-33"],
          reviewerState: "approved",
          claimRefs: ["claim-1"],
        },
        {
          id: "blk-withdrawn",
          artikelId: "art-101",
          bagianArtikelId: "sec-1",
          blockType: "misconception",
          content: "Withdrawn block",
          status: "withdrawn",
        },
      ];

      const rawProgress = [
        {
          bagianArtikelId: "sec-1",
          maxReadPercent: 95,
          timeSpentSeconds: 120,
          completedAt: new Date("2026-08-31T09:00:00Z"),
          lastReadAt: new Date("2026-08-31T09:05:00Z"),
          penggunaId: "student-1",
        },
      ];

      const publicModel = buildPublicArticleReadModel(
        rawArticle,
        rawSections,
        rawBlocks,
        rawProgress,
        "legacy-chapter-1",
      );

      // Verify root fields
      expect(publicModel.id).toBe("art-101");
      expect(publicModel.courseId).toBe("course-mat-1");
      expect(publicModel.chapterId).toBe("legacy-chapter-1");
      expect(publicModel.title).toBe("Aljabar Linear Dasar");
      expect(publicModel.slug).toBe("aljabar-linear-dasar");
      expect(publicModel.version).toBe(1);

      // Verify no sensitive fields in root
      const rootKeys = Object.keys(publicModel);
      expect(rootKeys).not.toContain("sourceHash");
      expect(rootKeys).not.toContain("generationHash");
      expect(rootKeys).not.toContain("creatorId");
      expect(rootKeys).not.toContain("curatorId");
      expect(rootKeys).not.toContain("ideId");
      expect(rootKeys).not.toContain("ideaIds");
      expect(rootKeys).not.toContain("reviewerState");

      // Verify published filtering
      expect(publicModel.sections.length).toBe(1);
      expect(publicModel.sections[0].id).toBe("sec-1");
      expect(publicModel.sections[0].blocks.length).toBe(1);
      expect(publicModel.sections[0].blocks[0].id).toBe("blk-1");

      // Verify block fields sanitized
      const blockKeys = Object.keys(publicModel.sections[0].blocks[0]);
      expect(blockKeys).not.toContain("generationHash");
      expect(blockKeys).not.toContain("sourceChecksum");
      expect(blockKeys).not.toContain("excerptIds");
      expect(blockKeys).not.toContain("ideaIds");
      expect(blockKeys).not.toContain("reviewerState");
      expect(blockKeys).not.toContain("claimRefs");

      // Verify progress computation
      expect(publicModel.progress?.completed).toBe(true);
      expect(publicModel.progress?.overallPercent).toBe(100);
      expect(publicModel.progress?.lastSectionSlug).toBe("vektor");
      expect(publicModel.progress?.sectionProgress["sec-1"].completed).toBe(true);
      expect(publicModel.progress?.sectionProgress["sec-1"].maxReadPercent).toBe(95);
    });
  });
});

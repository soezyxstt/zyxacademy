import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Prevent server-only / DB-bound transitive imports from markdown-renderer during unit SSR tests.
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db: {} }));
mock.module("@/lib/auth", () => ({ auth: {} }));
mock.module("@/components/coding/article-coding", () => ({
  ArticleCodeExample: () => null,
  ArticleCodingExercise: () => null,
  ArticleMarkdownScope: ({ children }: { children: React.ReactNode }) => children,
  useArticleMarkdownScope: () => null,
  ScrollableStaticCode: ({ code }: { code: string }) => React.createElement("pre", null, code),
  useStaticCodeLabels: () => ({ copy: "Copy", copied: "Copied" }),
}));

const {
  assessmentJsonRenderCatalog,
  assessmentUiBlockSchema,
  assessmentUiPatchSchema,
  assessmentUiSpecSchema,
  assessmentUiSpecToJsonRenderSpec,
  extractPlainMarkdownFromJsonRenderSpec,
  extractPlainMarkdownFromUiSpec,
  isJsonRenderSpec,
  normalizeToAssessmentUiSpec,
  parseAssessmentUiSpec,
  parseJsonRenderSpec,
  patchAssessmentUiSpec,
} = await import("@/lib/assessment-ui-sdk");

const { AssessmentUiRenderer, assessmentJsonRenderRegistry } = await import(
  "@/components/course/assessment-ui-sdk"
);

describe("Assessment UI-SDK schema and deterministic IDs", () => {
  test("parses all 9 block types and auto-generates deterministic IDs when omitted", () => {
    const input = {
      version: 1 as const,
      layout: "standard" as const,
      blocks: [
        { type: "markdown" as const, content: "Hitung turunan pertama dari $f(x) = x^2$." },
        {
          type: "formula_card" as const,
          title: "Aturan Pangkat",
          latex: "\\frac{d}{dx}(x^n) = n x^{n-1}",
          note: "Berlaku untuk semua bilangan real n.",
        },
        {
          type: "callout" as const,
          tone: "tip" as const,
          title: "Tips cepat",
          content: "Turunkan setiap suku satu per satu.",
        },
        {
          type: "steps" as const,
          title: "Langkah penyelesaian",
          collapsible: true,
          steps: [
            {
              title: "Identifikasi pangkat",
              summary: "Nilai n sama dengan 2",
              blocks: [{ type: "markdown" as const, content: "Diketahui $n = 2$." }],
            },
            {
              title: "Terapkan rumus",
              blocks: [{ type: "formula_card" as const, latex: "f'(x) = 2x" }],
            },
          ],
        },
        {
          type: "collapsible" as const,
          title: "Lihat penurunan",
          variant: "derivation" as const,
          defaultOpen: false,
          blocks: [{ type: "markdown" as const, content: "Limit definisi turunan." }],
        },
        {
          type: "image" as const,
          src: "/api/storage/sample-diagram.png",
          alt: "Diagram fungsi kuadrat",
          caption: "Kurva parabola y = x^2",
          aspect: "video" as const,
        },
        {
          type: "graph" as const,
          title: "Grafik 2D",
          caption: "Parabola sederhana",
          spec: { formula: "x^2" },
        },
        {
          type: "scene_3d" as const,
          title: "Vektor 3D",
          spec: {
            vectors: [{ from: [0, 0, 0], to: [1, 2, 3], label: "v" }],
            summary: "Vektor posisi di ruang tiga dimensi.",
          },
        },
        {
          type: "interactive_visual" as const,
          title: "Visualisasi Kanvas",
          kind: "canvas" as const,
          spec: {
            type: "function_plot",
            series: [{ id: "f1", label: "f(x)", expression: "x^2" }],
          },
        },
      ],
    };

    const parsedA = assessmentUiSpecSchema.parse(input);
    const parsedB = assessmentUiSpecSchema.parse(input);

    expect(parsedA.version).toBe(1);
    expect(parsedA.blocks).toHaveLength(9);
    expect(parsedA).toEqual(parsedB);

    const ids = new Set<string>();
    for (const block of parsedA.blocks) {
      expect(block.id.length).toBeGreaterThan(0);
      expect(ids.has(block.id)).toBe(false);
      ids.add(block.id);
    }

    const stepsBlock = parsedA.blocks[3];
    expect(stepsBlock.type).toBe("steps");
    if (stepsBlock.type === "steps") {
      expect(stepsBlock.steps[0].id.startsWith("step-")).toBe(true);
      expect(stepsBlock.steps[0].blocks[0].id.startsWith("blk-markdown-")).toBe(true);
    }
  });

  test("preserves explicit IDs and disambiguates duplicate auto-generated IDs", () => {
    const parsed = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        { id: "intro", type: "markdown", content: "Sama" },
        { type: "markdown", content: "Duplikat" },
        { type: "markdown", content: "Duplikat" },
      ],
    });

    expect(parsed.blocks[0].id).toBe("intro");
    expect(parsed.blocks[1].id).not.toBe(parsed.blocks[2].id);
    expect(parsed.blocks[2].id).toBe(`${parsed.blocks[1].id}-2`);
  });

  test("parseAssessmentUiSpec handles JSON strings and rejects invalid specs", () => {
    const json = JSON.stringify({
      version: 1,
      blocks: [{ type: "markdown", content: "Halo" }],
    });

    const parsed = parseAssessmentUiSpec(json);
    expect(parsed?.blocks[0].type).toBe("markdown");
    expect(parseAssessmentUiSpec("not-json")).toBeNull();
    expect(parseAssessmentUiSpec({ version: 2, blocks: [] })).toBeNull();
    expect(parseAssessmentUiSpec(null)).toBeNull();
  });

  test("normalizeToAssessmentUiSpec falls back to markdown when spec is null or empty", () => {
    const fromFallback = normalizeToAssessmentUiSpec(null, "Penjelasan **markdown**.");
    expect(fromFallback.version).toBe(1);
    expect(fromFallback.blocks).toHaveLength(1);
    expect(fromFallback.blocks[0].type).toBe("markdown");
    if (fromFallback.blocks[0].type === "markdown") {
      expect(fromFallback.blocks[0].content).toBe("Penjelasan **markdown**.");
    }

    const empty = normalizeToAssessmentUiSpec(undefined, "   ");
    expect(empty.blocks).toHaveLength(0);
  });

  test("extractPlainMarkdownFromUiSpec converts all blocks to clean plain markdown", () => {
    const spec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        { type: "markdown", content: "Paragraf pembuka." },
        { type: "formula_card", title: "Rumus Energi", latex: "E = mc^2", note: "Relativitas" },
        {
          type: "steps",
          title: "Langkah",
          steps: [
            {
              title: "Substitusi",
              summary: "Masukkan massa",
              blocks: [{ type: "markdown", content: "Hasil akhir adalah $E$." }],
            },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Periksa satuan",
          content: "Gunakan SI.",
        },
        {
          type: "image",
          src: "/img/a.png",
          alt: "Sketsa",
          caption: "Gambar 1",
        },
      ],
    });

    const md = extractPlainMarkdownFromUiSpec(spec);
    expect(md).toContain("Paragraf pembuka.");
    expect(md).toContain("**Rumus Energi**");
    expect(md).toContain("E = mc^2");
    expect(md).toContain("**1. Substitusi**");
    expect(md).toContain("**Periksa satuan**");
    expect(md).toContain("![Sketsa](/img/a.png)");
    expect(md).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("Assessment UI-SDK patch engine", () => {
  const baseSpec = assessmentUiSpecSchema.parse({
    version: 1,
    blocks: [
      { id: "b1", type: "markdown", content: "Awal" },
      {
        id: "steps-1",
        type: "steps",
        steps: [
          {
            id: "s1",
            title: "Langkah 1",
            blocks: [{ id: "s1-b1", type: "markdown", content: "Isi 1" }],
          },
          {
            id: "s2",
            title: "Langkah 2",
            blocks: [{ id: "s2-b1", type: "markdown", content: "Isi 2" }],
          },
        ],
      },
      { id: "b2", type: "callout", tone: "info", content: "Penutup" },
    ],
  });

  test("supports upsert_block (insert after, update in place, append)", () => {
    const inserted = patchAssessmentUiSpec(baseSpec, {
      op: "upsert_block",
      afterBlockId: "b1",
      block: { id: "b-mid", type: "formula_card", latex: "a^2 + b^2 = c^2" },
    });
    expect(inserted.blocks.map((b) => b.id)).toEqual(["b1", "b-mid", "steps-1", "b2"]);

    const updated = patchAssessmentUiSpec(inserted, {
      op: "upsert_block",
      block: { id: "b1", type: "markdown", content: "Awal diperbarui" },
    });
    expect(updated.blocks[0].type).toBe("markdown");
    if (updated.blocks[0].type === "markdown") {
      expect(updated.blocks[0].content).toBe("Awal diperbarui");
    }

    const appended = patchAssessmentUiSpec(updated, {
      op: "upsert_block",
      block: { type: "markdown", content: "Tanpa ID eksplisit" },
    });
    expect(appended.blocks).toHaveLength(5);
    expect(appended.blocks[4].id.startsWith("blk-markdown-")).toBe(true);
  });

  test("supports remove_block for top-level and nested blocks", () => {
    const removedTop = patchAssessmentUiSpec(baseSpec, {
      op: "remove_block",
      blockId: "b2",
    });
    expect(removedTop.blocks.map((b) => b.id)).toEqual(["b1", "steps-1"]);

    const removedNested = patchAssessmentUiSpec(baseSpec, {
      op: "remove_block",
      blockId: "s1-b1",
    });
    const stepsBlock = removedNested.blocks[1];
    expect(stepsBlock.type).toBe("steps");
    if (stepsBlock.type === "steps") {
      expect(stepsBlock.steps[0].blocks).toHaveLength(0);
    }
  });

  test("supports upsert_step and remove_step", () => {
    const addedStep = patchAssessmentUiSpec(baseSpec, {
      op: "upsert_step",
      stepsBlockId: "steps-1",
      afterStepId: "s1",
      step: {
        id: "s1b",
        title: "Langkah sisipan",
        blocks: [{ type: "markdown", content: "Detail tambahan" }],
      },
    });
    const stepsAfterAdd = addedStep.blocks[1];
    expect(stepsAfterAdd.type).toBe("steps");
    if (stepsAfterAdd.type === "steps") {
      expect(stepsAfterAdd.steps.map((s) => s.id)).toEqual(["s1", "s1b", "s2"]);
    }

    const updatedStep = patchAssessmentUiSpec(addedStep, {
      op: "upsert_step",
      stepsBlockId: "steps-1",
      step: {
        id: "s2",
        title: "Langkah 2 diperbarui",
        blocks: [{ type: "markdown", content: "Isi baru" }],
      },
    });
    const stepsAfterUpdate = updatedStep.blocks[1];
    if (stepsAfterUpdate.type === "steps") {
      expect(stepsAfterUpdate.steps[2].title).toBe("Langkah 2 diperbarui");
    }

    const removedStep = patchAssessmentUiSpec(updatedStep, {
      op: "remove_step",
      stepsBlockId: "steps-1",
      stepId: "s1b",
    });
    const stepsAfterRemove = removedStep.blocks[1];
    if (stepsAfterRemove.type === "steps") {
      expect(stepsAfterRemove.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    }
  });

  test("supports replace_all and validates patch schema", () => {
    const parsedPatch = assessmentUiPatchSchema.parse({
      op: "replace_all",
      spec: {
        version: 1,
        layout: "compact",
        blocks: [{ type: "markdown", content: "Baru semua" }],
      },
    });
    const replaced = patchAssessmentUiSpec(baseSpec, parsedPatch);
    expect(replaced.layout).toBe("compact");
    expect(replaced.blocks).toHaveLength(1);
  });

  test("throws when upsert_step or remove_step targets a missing stepsBlockId", () => {
    expect(() =>
      patchAssessmentUiSpec(baseSpec, {
        op: "remove_step",
        stepsBlockId: "missing-steps",
        stepId: "s1",
      }),
    ).toThrow(/not found/);
  });

  test("assessmentUiBlockSchema parses single block with auto-generated id", () => {
    const block = assessmentUiBlockSchema.parse({
      type: "callout",
      tone: "mistake",
      content: "Jangan lupa tanda minus.",
    });
    expect(block.id.startsWith("blk-callout-")).toBe(true);
  });
});

describe("@json-render catalog, bridge, and @ui-sdk/react renderer contract", () => {
  test("exposes @json-render catalog, registry, and lossless bridge", () => {
    expect(assessmentJsonRenderCatalog.componentNames).toContain("Markdown");
    expect(assessmentJsonRenderCatalog.componentNames).toContain("CollapsibleSection");
    expect(assessmentJsonRenderCatalog.componentNames).toContain("Steps");
    expect(assessmentJsonRenderCatalog.componentNames).toContain("Scene3D");
    expect(Object.keys(assessmentJsonRenderRegistry)).toContain("FormulaCard");

    const blockSpec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        { id: "jr-formula", type: "formula_card", title: "Pythagoras", latex: "a^2 + b^2 = c^2" },
        {
          id: "jr-collapsible",
          type: "collapsible",
          title: "Petunjuk",
          variant: "hint",
          defaultOpen: true,
          blocks: [{ id: "jr-hint-md", type: "markdown", content: "Gunakan segitiga siku-siku." }],
        },
      ],
    });

    const jrSpec = assessmentUiSpecToJsonRenderSpec(blockSpec);
    expect(isJsonRenderSpec(jrSpec)).toBe(true);
    expect(parseJsonRenderSpec(JSON.stringify(jrSpec))).toEqual(jrSpec);

    const extracted = extractPlainMarkdownFromJsonRenderSpec(jrSpec);
    expect(extracted).toContain("**Pythagoras**");
    expect(extracted).toContain("a^2 + b^2 = c^2");
    expect(extracted).toContain("### Petunjuk");
  });

  test("renders AssessmentUiSpec with @ui-sdk/react primitives and block anchors", () => {
    const spec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        { id: "blk-intro", type: "formula_card", title: "Rumus", latex: "x = 2" },
        {
          id: "blk-steps",
          type: "steps",
          title: "Tahapan",
          collapsible: true,
          steps: [
            {
              id: "step-1",
              title: "Langkah pertama",
              blocks: [{ id: "step-1-formula", type: "formula_card", latex: "2 + 2 = 4" }],
            },
          ],
        },
        {
          id: "blk-collapsible",
          type: "collapsible",
          title: "Detail tambahan",
          variant: "detail",
          defaultOpen: true,
          blocks: [{ id: "blk-detail-formula", type: "formula_card", latex: "y = 4" }],
        },
        {
          id: "blk-graph-partial",
          type: "graph",
          title: "Grafik parsial",
          spec: { summary: "Ringkasan grafik sementara." },
        },
        {
          id: "blk-3d",
          type: "scene_3d",
          title: "Kubus satuan",
          spec: { objects: [{ type: "box", center: [0, 0, 0], size: [2, 2, 2], label: "K" }] },
        },
        {
          id: "blk-visual-partial",
          type: "interactive_visual",
          title: "Chart parsial",
          kind: "chart",
          spec: { summary: "Data chart sedang disiapkan." },
        },
      ],
    });

    const renderedAfterIds: string[] = [];
    const html = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, {
        spec,
        courseId: "course-123",
        renderBlockAfter: (blockId: string) => {
          renderedAfterIds.push(blockId);
          return React.createElement("div", { "data-after-for": blockId }, `after:${blockId}`);
        },
      }),
    );

    expect(html).toContain('data-assessment-ui-format="blocks"');
    expect(html).toContain('data-assessment-block-id="blk-intro"');
    expect(html).toContain('data-assessment-block-id="blk-steps"');
    expect(html).toContain('data-assessment-block-id="step-1"');
    expect(html).toContain('data-assessment-block-id="blk-collapsible"');
    expect(html).toContain('data-assessment-visual-fallback="graph"');
    expect(html).toContain('data-assessment-scene-3d=""');
    expect(html).toContain('data-assessment-visual-fallback="chart"');
    expect(html).toContain('data-after-for="blk-intro"');
    expect(html).toContain('data-after-for="step-1"');
    expect(renderedAfterIds).toContain("blk-intro");
    expect(renderedAfterIds).toContain("blk-steps");
    expect(renderedAfterIds).toContain("step-1");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });

  test("renders native @json-render Spec directly through AssessmentUiRenderer", () => {
    const jrSpec = {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { layout: "compact" },
          children: ["f1", "c1"],
        },
        f1: {
          type: "FormulaCard",
          props: { blockId: "jr-f1", title: "Identitas", latex: "\\sin^2 x + \\cos^2 x = 1" },
          children: [],
        },
        c1: {
          type: "CollapsibleSection",
          props: { blockId: "jr-c1", title: "Bukti singkat", variant: "derivation", defaultOpen: true },
          children: ["f2"],
        },
        f2: {
          type: "FormulaCard",
          props: { blockId: "jr-f2", latex: "x^2 + y^2 = r^2" },
          children: [],
        },
      },
    };

    const afterIds: string[] = [];
    const html = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, {
        spec: jrSpec,
        courseId: "course-jr",
        renderBlockAfter: (id: string) => {
          afterIds.push(id);
          return React.createElement("span", { "data-jr-after": id });
        },
      }),
    );

    expect(html).toContain('data-assessment-ui-format="json-render"');
    expect(html).toContain('data-assessment-block-id="jr-f1"');
    expect(html).toContain('data-assessment-block-id="jr-c1"');
    expect(html).toContain('data-assessment-block-id="jr-f2"');
    expect(html).toContain('data-jr-after="jr-f1"');
    expect(afterIds).toEqual(["jr-f1", "jr-c1", "jr-f2"]);
  });

  test("returns empty output when both spec and fallbackMarkdown are empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, {
        spec: null,
        fallbackMarkdown: "",
      }),
    );
    expect(html).toBe("");
  });
});

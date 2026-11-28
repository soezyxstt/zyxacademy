import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

const { FocusedAssessmentReview } = await import("@/components/course/focused-assessment-review");
const { MarkdownRenderer } = await import("@/components/course/markdown-renderer");
const { AssessmentUiRenderer } = await import("@/components/course/assessment-ui-sdk");
const { assessmentUiSpecSchema } = await import("@/lib/assessment-ui-sdk");
const { buildInlineExplanationSystemPrompt } = await import("@/lib/zyra/inline-explanation");

const ROOT = resolve(import.meta.dir, "../..");

describe("quiz and tryout review UI rework contracts", () => {
  test("declares @layer ui-sdk and animates collapsible, accordion, tabs, segmented control, and popover in globals.css", () => {
    const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");
    const layerIdx = css.indexOf("@layer ui-sdk;");
    const tailwindIdx = css.indexOf('@import "tailwindcss";');
    expect(layerIdx).toBeGreaterThanOrEqual(0);
    expect(tailwindIdx).toBeGreaterThan(layerIdx);
    expect(css).toContain("--collapsible-panel-height");
    expect(css).toContain("--accordion-panel-height");
    expect(css).toContain("--segmented-control-indicator-left");
    expect(css).toContain("--active-tab-left");
    expect(css).toContain('[data-slot="popover-content"]');
  });

  test("renders standalone math formulas without card wrapper chrome while preserving formula-focus contract", () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, {
        content: "$$I = \\int_0^1 2x(x^2+1)^2\\,dx$$",
      }),
    );

    expect(html).toContain('class="formula-focus');
    expect(html).toContain('data-content-kind="formula"');
    expect(html).not.toContain("bg-primary/[0.03]");
    expect(html).not.toContain("border-l-3");
    expect(html).not.toContain("rounded-lg");
  });

  test("omits pre-attempt leaderboard notice and renders ui-sdk Toolbar, SegmentedControl, Collapsible, and one-tap Tanya Zyra", () => {
    const html = renderToStaticMarkup(
      React.createElement(FocusedAssessmentReview, {
        courseId: "math-1",
        assessmentKind: "quiz",
        assessmentId: "quiz-1",
        isDirectPreview: true,
        leaderboardEligible: false,
        questions: [
          {
            id: "q1",
            order: 1,
            prompt: "Tentukan nilai integral tentu\n\n$$I = \\int_0^1 2x(x^2+1)^2\\,dx$$",
            questionType: "multiple_choice",
            difficulty: "easy",
            status: "study",
            options: ["$$\\frac{1}{3}$$", "$$\\frac{7}{6}$$"],
            correctIndices: [1],
            explanationMarkdown: "Gunakan substitusi $u = x^2 + 1$.",
          },
          {
            id: "q2",
            order: 2,
            prompt: "Soal kedua",
            questionType: "short_answer",
            status: "study",
            acceptableAnswers: ["42"],
            explanationMarkdown: "Hasilnya 42.",
          },
        ],
      }),
    );

    expect(html).not.toContain("Pembahasan dibuka sebelum mengerjakan");
    expect(html).toContain('data-slot="toolbar"');
    expect(html).toContain('data-slot="segmented-control"');
    expect(html).toContain('data-slot="segmented-control-indicator"');
    expect(html).toContain('data-slot="collapsible"');
    expect(html).toContain("Tanya Zyra");
    expect(html).not.toContain("bg-primary/[0.03]");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });

  test("renders paginated steps using @ui-sdk/react Tabs and collapsible steps with Accordion controls", () => {
    const paginatedSpec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        {
          id: "steps-paginated",
          type: "steps",
          title: "Langkah",
          collapsible: false,
          steps: [
            { id: "s1", title: "Substitusi", blocks: [{ id: "b1", type: "markdown", content: "Misalkan $u = x^2 + 1$." }] },
            { id: "s2", title: "Integrasi", blocks: [{ id: "b2", type: "markdown", content: "Hitung $\\int u^2 du$." }] },
          ],
        },
      ],
    });

    const paginatedHtml = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, { spec: paginatedSpec, courseId: "math-1" }),
    );
    expect(paginatedHtml).toContain('data-slot="tabs"');
    expect(paginatedHtml).toContain('data-slot="tabs-list"');
    expect(paginatedHtml).toContain('data-slot="tabs-indicator"');

    const collapsibleSpec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        {
          id: "steps-accordion",
          type: "steps",
          title: "Langkah lipat",
          collapsible: true,
          steps: [
            { id: "a1", title: "Satu", blocks: [{ id: "ab1", type: "markdown", content: "A" }] },
            { id: "a2", title: "Dua", blocks: [{ id: "ab2", type: "markdown", content: "B" }] },
          ],
        },
      ],
    });

    const accordionHtml = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, { spec: collapsibleSpec, courseId: "math-1" }),
    );
    expect(accordionHtml).toContain('data-slot="accordion"');
    expect(accordionHtml).toContain("Buka semua");
    expect(accordionHtml).toContain("Tutup semua");
  });

  test("renders 3D solid of revolution with sliced disks, slider, and smooth/sliced toggle", () => {
    const revSpec = assessmentUiSpecSchema.parse({
      version: 1,
      blocks: [
        {
          id: "rev-1",
          type: "scene_3d",
          title: "Volume Benda Putar y = sqrt(x)",
          spec: {
            objects: [
              {
                type: "revolution",
                fn: "sqrt(x)",
                axis: "x",
                range: [0, 4],
                method: "disk",
                slices: 8,
              },
            ],
            summary: "Potongan cakram pada [0, 4].",
          },
        },
        {
          id: "surf-1",
          type: "scene_3d",
          title: "Paraboloid",
          spec: {
            objects: [
              {
                type: "surface",
                fn: "x^2 + y^2",
                xRange: [-2, 2],
                yRange: [-2, 2],
                steps: 6,
              },
            ],
          },
        },
      ],
    });

    const html = renderToStaticMarkup(
      React.createElement(AssessmentUiRenderer, { spec: revSpec, courseId: "math-1" }),
    );

    expect(html).toContain('data-assessment-scene-3d=""');
    expect(html).toContain("<polygon");
    expect(html).toContain("<polyline");
    expect(html).toContain("8 potongan cakram");
    expect(html).toContain('data-slot="slider"');
    expect(html).toContain("Potongan");
    expect(html).toContain("Halus");
    expect(html).not.toContain('data-assessment-visual-fallback="scene_3d"');
  });

  test("instructs Zyra with explicit 2D graph and 3D revolution schemas when intent is visualize", () => {
    const prompt = buildInlineExplanationSystemPrompt({
      courseId: "math-1",
      assessmentKind: "quiz",
      assessmentId: "quiz-vol",
      questionId: "q-vol-1",
      questionPrompt: "Tentukan volume benda putar y = sqrt(x) dari x = 0 hingga x = 4.",
      selectedSnippet: "volume benda putar",
      anchorBlockId: "exp-1",
      intent: "visualize",
    });

    expect(prompt).toContain("WAJIB memanggil tool render_helper_ui");
    expect(prompt).toContain('"revolution"');
    expect(prompt).toContain('"disk"');
    expect(prompt).toContain('"washer"');
    expect(prompt).toContain('"shell"');
    expect(prompt).toContain("initialFormula");
    expect(prompt).not.toMatch(/[\u2013\u2014]/);
  });
});

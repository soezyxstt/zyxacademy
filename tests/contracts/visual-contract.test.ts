import { describe, expect, test } from "bun:test";
import {
  epsilonDeltaGraphSpecSchema,
  learningCanvasVisualSpecSchema,
  visualNumericBoundsSchema,
  visualSpecSchema,
  visualTableFallbackSchema,
  visualTextFallbackSchema,
  type EpsilonDeltaGraphSpec,
} from "@/lib/materials/visual-contract";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

describe("visual contract specification", () => {
  describe("visualNumericBoundsSchema", () => {
    test("accepts valid numeric bounds", () => {
      const bounds = visualNumericBoundsSchema.parse({
        xMin: -5,
        xMax: 5,
        yMin: 0,
        yMax: 20,
      });
      expect(bounds.xMin).toBe(-5);
      expect(bounds.xMax).toBe(5);
    });

    test("rejects inverted x bounds", () => {
      expect(() =>
        visualNumericBoundsSchema.parse({
          xMin: 10,
          xMax: 2,
          yMin: 0,
          yMax: 20,
        }),
      ).toThrow("xMin must be strictly less than xMax");
    });

    test("rejects equal x bounds", () => {
      expect(() =>
        visualNumericBoundsSchema.parse({
          xMin: 5,
          xMax: 5,
          yMin: 0,
          yMax: 20,
        }),
      ).toThrow("xMin must be strictly less than xMax");
    });

    test("rejects inverted y bounds", () => {
      expect(() =>
        visualNumericBoundsSchema.parse({
          xMin: 0,
          xMax: 10,
          yMin: 15,
          yMax: 5,
        }),
      ).toThrow("yMin must be strictly less than yMax");
    });
  });

  describe("visualTableFallbackSchema", () => {
    test("accepts consistent tabular fallback", () => {
      const table = visualTableFallbackSchema.parse({
        type: "table",
        summary: "Nilai pendekatan",
        headers: ["x", "f(x)"],
        rows: [
          [1.0, 3.0],
          [2.0, 5.0],
        ],
      });
      expect(table.rows).toHaveLength(2);
    });

    test("rejects rows with column count mismatch", () => {
      expect(() =>
        visualTableFallbackSchema.parse({
          type: "table",
          summary: "Tabel pincang",
          headers: ["x", "f(x)", "delta"],
          rows: [
            [1.0, 3.0], // missing 3rd column
          ],
        }),
      ).toThrow("All table fallback rows must have exactly the same number of columns as headers");
    });

    test("rejects empty headers", () => {
      expect(() =>
        visualTableFallbackSchema.parse({
          type: "table",
          summary: "Tabel tanpa kolom",
          headers: [],
          rows: [],
        }),
      ).toThrow();
    });

    test("rejects empty rows", () => {
      expect(() =>
        visualTableFallbackSchema.parse({
          type: "table",
          summary: "Tabel tanpa baris",
          headers: ["x", "f(x)"],
          rows: [],
        }),
      ).toThrow();
    });
  });

  describe("visualTextFallbackSchema", () => {
    test("accepts valid text fallback", () => {
      const text = visualTextFallbackSchema.parse({
        type: "text",
        summary: "Deskripsi alur",
        content: "Grafik mengilustrasikan pita vertikal selebar dua delta.",
      });
      expect(text.content).toContain("pita vertikal");
    });

    test("rejects empty content", () => {
      expect(() =>
        visualTextFallbackSchema.parse({
          type: "text",
          summary: "Deskripsi alur",
          content: "   ",
        }),
      ).toThrow();
    });
  });

  describe("epsilonDeltaGraphSpecSchema numeric coherence", () => {
    test("accepts valid linear function spec", () => {
      const parsed = epsilonDeltaGraphSpecSchema.parse(LIMIT_EPSILON_DELTA_GRAPH);
      expect(parsed.id).toBe("visual-limit-linear-2x-plus-1");
      expect(parsed.limitPoint).toBe(3);
      expect(parsed.limitValue).toBe(7);
    });

    test("accepts valid quadratic function spec", () => {
      const quadraticSpec: EpsilonDeltaGraphSpec = {
        id: "visual-quadratic-limit",
        kind: "epsilon_delta_graph",
        label: "Grafik Limit f(x) = x^2 - 1 pada x mendekati 2",
        description: "Visualisasi limit kuadratik menuju L = 3",
        bounds: {
          xMin: 0,
          xMax: 4,
          yMin: -2,
          yMax: 10,
        },
        staticFallback: {
          type: "text",
          summary: "Penjelasan nilai limit kuadratik",
          content: "Nilai fungsi mendekati 3 saat x mendekati 2.",
        },
        limitPoint: 2,
        limitValue: 3, // 1*2^2 + 0*2 - 1 = 3
        defaultDelta: 0.2,
        defaultEpsilon: 0.8,
        functionModel: {
          kind: "quadratic",
          a: 1,
          b: 0,
          c: -1,
        },
      };

      const parsed = epsilonDeltaGraphSpecSchema.parse(quadraticSpec);
      expect(parsed.limitValue).toBe(3);
    });

    test("accepts valid constant function spec", () => {
      const constantSpec: EpsilonDeltaGraphSpec = {
        id: "visual-constant-limit",
        kind: "epsilon_delta_graph",
        label: "Grafik Limit f(x) = 5 pada x mendekati 1",
        description: "Visualisasi limit fungsi konstan",
        bounds: {
          xMin: -2,
          xMax: 4,
          yMin: 0,
          yMax: 10,
        },
        staticFallback: {
          type: "text",
          summary: "Fungsi bernilai konstan 5",
          content: "Nilai fungsi selalu 5 pada seluruh domain.",
        },
        limitPoint: 1,
        limitValue: 5,
        defaultDelta: 0.5,
        defaultEpsilon: 0.5,
        functionModel: {
          kind: "constant",
          c: 5,
        },
      };

      const parsed = epsilonDeltaGraphSpecSchema.parse(constantSpec);
      expect(parsed.limitValue).toBe(5);
    });

    test("rejects limitPoint outside x bounds", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        limitPoint: 8, // xMax is 6
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "must be strictly within x bounds [0, 6]",
      );
    });

    test("rejects limitValue outside y bounds", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        limitValue: 12, // yMax is 10
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "must be strictly within y bounds [0, 10]",
      );
    });

    test("rejects defaultDelta larger than domain width", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        defaultDelta: 7, // domain width is 6 - 0 = 6
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "Default delta neighborhood",
      );
    });

    test("rejects defaultDelta non-positive", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        defaultDelta: 0,
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow();
    });

    test("rejects defaultEpsilon larger than range height", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        defaultEpsilon: 15, // range height is 10 - 0 = 10
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "Default epsilon neighborhood",
      );
    });

    test("rejects linear function value mismatch", () => {
      const spec = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        limitPoint: 3,
        limitValue: 8, // 2*3 + 1 = 7, not 8
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "deviates from declared limitValue 8",
      );
    });

    test("rejects quadratic function value mismatch", () => {
      const spec = {
        id: "visual-quadratic-mismatch",
        kind: "epsilon_delta_graph" as const,
        label: "Grafik Diskrepansi Kuadratik",
        description: "Contoh fungsi kuadratik tidak koheren",
        bounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 30 },
        staticFallback: {
          type: "text" as const,
          summary: "Deskripsi",
          content: "Teks deskripsi.",
        },
        limitPoint: 2,
        limitValue: 10, // 2^2 + 1 = 5, mismatch with 10
        defaultDelta: 0.5,
        defaultEpsilon: 1,
        functionModel: {
          kind: "quadratic" as const,
          a: 1,
          b: 0,
          c: 1,
        },
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(spec)).toThrow(
        "deviates from declared limitValue 10",
      );
    });
  });

  describe("security payload scanning", () => {
    test("rejects script tags in label", () => {
      const malicious = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        label: "Grafik Normal <script>alert('xss')</script>",
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(malicious)).toThrow(
        "Forbidden executable or markup pattern detected",
      );
    });

    test("rejects svg onload handler in description", () => {
      const malicious = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        description: "Visualisasi limit <svg onload=fetch('http://evil.com')>",
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(malicious)).toThrow(
        "Forbidden executable or markup pattern detected",
      );
    });

    test("rejects javascript: URIs in staticFallback", () => {
      const malicious = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        staticFallback: {
          type: "text" as const,
          summary: "Teks fallback",
          content: "Lihat tautan javascript:alert(1) untuk penjelasan",
        },
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(malicious)).toThrow(
        "Forbidden executable or markup pattern detected",
      );
    });

    test("rejects iframe tags in static fallback table summary", () => {
      const malicious = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        staticFallback: {
          type: "table" as const,
          summary: "<iframe src='//evil.com'></iframe> Ringkasan",
          headers: ["x", "f(x)"],
          rows: [[1, 3]],
        },
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(malicious)).toThrow(
        "Forbidden executable or markup pattern detected",
      );
    });

    test("rejects eval execution strings in static fallback table cells", () => {
      const malicious = {
        ...LIMIT_EPSILON_DELTA_GRAPH,
        staticFallback: {
          type: "table" as const,
          summary: "Tabel nilai",
          headers: ["x", "f(x)"],
          rows: [[1, "eval(document.cookie)"]],
        },
      };
      expect(() => epsilonDeltaGraphSpecSchema.parse(malicious)).toThrow(
        "Forbidden executable or markup pattern detected",
      );
    });
  });

  describe("visualSpecSchema union", () => {
    test("parses through visualSpecSchema union", () => {
      const parsed = visualSpecSchema.parse(LIMIT_EPSILON_DELTA_GRAPH);
      expect(parsed.kind).toBe("epsilon_delta_graph");
    });

    test("accepts a bounded interactive function plot with a static fallback", () => {
      const parsed = learningCanvasVisualSpecSchema.parse({
        id: "visual-line-shift",
        kind: "learning_canvas",
        label: "Pergeseran garis",
        description: "Geser k untuk membandingkan garis awal dan hasil.",
        interactive: true,
        canvas: {
          version: "zyra-learning-canvas-v1",
          type: "function_plot",
          title: "Garis sebelum dan sesudah digeser",
          purpose: "Menghubungkan nilai k dengan perubahan grafik.",
          variables: [{ id: "k", label: "Pergeseran horizontal", min: -3, max: 3, defaultValue: 1 }],
          controls: [{ variableId: "k", label: "Nilai k", min: -3, max: 3, step: 1, presets: [-1, 0, 1] }],
          claimRefs: ["claim-line-shift"],
          altText: "Garis awal putus-putus dan garis hasil penuh.",
          fallback: {
            summary: "Nilai contoh garis sebelum dan sesudah pergeseran.",
            columns: [{ id: "state", label: "Keadaan" }, { id: "formula", label: "Rumus" }],
            rows: [["awal", "y=x"], ["hasil", "y=(x-k)" ]],
          },
          domain: { min: -4, max: 4, sampleCount: 32 },
          series: [
            { id: "source", label: "Awal", expression: "x", lineStyle: "dashed", role: "reference" },
            { id: "shifted", label: "Hasil", expression: "x-k", lineStyle: "solid", role: "primary" },
          ],
        },
      });
      expect(parsed.canvas.type).toBe("function_plot");
      if (parsed.canvas.type === "function_plot") {
        expect(parsed.canvas.series[0]?.lineStyle).toBe("dashed");
        expect(parsed.canvas.controls[0]?.variableId).toBe("k");
      }
    });

    test("rejects executable markup in a Learning Canvas payload", () => {
      expect(() => learningCanvasVisualSpecSchema.parse({
        id: "visual-hostile",
        kind: "learning_canvas",
        label: "Grafik",
        description: "<iframe src='https://example.com'></iframe>",
        interactive: false,
        canvas: {
          version: "zyra-learning-canvas-v1",
          type: "table",
          title: "Tabel",
          purpose: "Tabel sederhana.",
          variables: [],
          controls: [],
          claimRefs: [],
          altText: "Tabel nilai.",
          fallback: {
            summary: "Ringkasan tabel.",
            columns: [{ id: "x", label: "x" }],
            rows: [["1"]],
          },
          rows: [["1"]],
        },
      })).toThrow("Forbidden executable or markup pattern detected");
    });
  });
});

import { describe, expect, test } from "bun:test";
import {
  formativeCheckPayloadSchema,
  sectionPedagogyMetadataSchema,
  validateSectionPedagogyReferences,
  workedExamplePayloadSchema,
} from "@/lib/materials/pedagogy-contract";
import { LIMIT_ARTICLE_FIXTURE } from "../fixtures/product-learning/limit-epsilon-delta";
import { EIGENVALUES_ARTICLE_FIXTURE } from "../fixtures/product-learning/eigenvalues";

describe("pedagogy contract specification", () => {
  describe("workedExamplePayloadSchema", () => {
    test("accepts valid worked example with monotonic steps and verification", () => {
      const payload = workedExamplePayloadSchema.parse({
        steps: [
          {
            stepIndex: 0,
            label: "Analisis Selisih Keluaran",
            explanation: "Tuliskan bentuk pertidaksamaan target.",
            reason: "|f(x) - 7| = |(2x + 1) - 7| = |2x - 6| = 2|x - 3|.",
          },
          {
            stepIndex: 1,
            label: "Pemilihan Nilai Delta",
            explanation: "Tentukan relasi delta terhadap epsilon.",
            reason: "Kita menginginkan 2|x - 3| < epsilon, sehingga pilih delta = epsilon / 2.",
          },
        ],
        verification: "Untuk sembarang epsilon > 0, jika 0 < |x - 3| < delta maka |(2x+1)-7| < 2(epsilon/2) = epsilon.",
      });

      expect(payload.steps).toHaveLength(2);
      expect(payload.verification).toContain("epsilon");
    });

    test("rejects unordered or non-monotonic steps", () => {
      expect(() =>
        workedExamplePayloadSchema.parse({
          steps: [
            {
              stepIndex: 1, // starts at 1 instead of 0
              label: "Langkah dua",
              explanation: "Penjelasan",
              reason: "Alasan",
            },
          ],
          verification: "Verifikasi.",
        }),
      ).toThrow("Worked example step indexes must be contiguous starting from 0");
    });

    test("rejects empty steps list", () => {
      expect(() =>
        workedExamplePayloadSchema.parse({
          steps: [],
          verification: "Verifikasi.",
        }),
      ).toThrow();
    });

    test("rejects missing verification", () => {
      expect(() =>
        workedExamplePayloadSchema.parse({
          steps: [
            {
              stepIndex: 0,
              label: "Langkah",
              explanation: "Penjelasan",
              reason: "Alasan",
            },
          ],
        }),
      ).toThrow();
    });
  });

  describe("formativeCheckPayloadSchema", () => {
    test("accepts valid multiple choice check", () => {
      const payload = formativeCheckPayloadSchema.parse({
        checkKind: "multiple_choice",
        answer: "opt-a",
        explanation: "Pilihan A tepat karena 2(delta) = 2(epsilon/2) = epsilon.",
        options: [
          {
            id: "opt-a",
            text: "delta = epsilon / 2",
            isCorrect: true,
          },
          {
            id: "opt-b",
            text: "delta = 2 * epsilon",
            isCorrect: false,
          },
        ],
      });

      expect(payload.checkKind).toBe("multiple_choice");
      if (payload.checkKind === "multiple_choice") {
        expect(payload.options).toHaveLength(2);
      }
    });

    test("rejects multiple choice check without correct option", () => {
      expect(() =>
        formativeCheckPayloadSchema.parse({
          checkKind: "multiple_choice",
          answer: "none",
          explanation: "Tidak ada yang benar",
          options: [
            { id: "opt-a", text: "A", isCorrect: false },
            { id: "opt-b", text: "B", isCorrect: false },
          ],
        }),
      ).toThrow("Multiple choice formative check must have exactly one correct option");
    });

    test("rejects multiple choice check with multiple correct options", () => {
      expect(() =>
        formativeCheckPayloadSchema.parse({
          checkKind: "multiple_choice",
          answer: "opt-a",
          explanation: "Dua pilihan benar",
          options: [
            { id: "opt-a", text: "A", isCorrect: true },
            { id: "opt-b", text: "B", isCorrect: true },
          ],
        }),
      ).toThrow("Multiple choice formative check must have exactly one correct option");
    });

    test("rejects multiple choice check with fewer than two options", () => {
      expect(() =>
        formativeCheckPayloadSchema.parse({
          checkKind: "multiple_choice",
          answer: "opt-a",
          explanation: "Hanya satu opsi",
          options: [
            { id: "opt-a", text: "A", isCorrect: true },
          ],
        }),
      ).toThrow("Multiple choice formative checks require at least two options");
    });

    test("accepts valid short answer check", () => {
      const payload = formativeCheckPayloadSchema.parse({
        checkKind: "short_answer",
        answer: "delta <= epsilon / 2",
        explanation: "Setiap nilai delta positif yang lebih kecil atau sama dengan epsilon/2 juga valid.",
      });

      expect(payload.checkKind).toBe("short_answer");
    });

    test("accepts valid conceptual explanation check", () => {
      const payload = formativeCheckPayloadSchema.parse({
        checkKind: "conceptual_explanation",
        answer: "Pengecualian x = c diperlukan karena limit adalah sifat lokal di sekitar c.",
        explanation: "Nilai f(c) tidak mempengaruhi eksistensi limit di c.",
      });

      expect(payload.checkKind).toBe("conceptual_explanation");
    });

    test("rejects empty answer in short answer", () => {
      expect(() =>
        formativeCheckPayloadSchema.parse({
          checkKind: "short_answer",
          answer: "   ",
          explanation: "Penjelasan.",
        }),
      ).toThrow();
    });
  });

  describe("sectionPedagogyMetadataSchema", () => {
    test("rejects empty objectives array", () => {
      expect(() =>
        sectionPedagogyMetadataSchema.parse({
          objectives: [],
          prerequisites: [],
          symbols: [],
          timeEstimate: { readingMinutes: 5, examplesMinutes: 5, practiceMinutes: 5 },
          visualRequirement: { status: "not_required", reason: "Alasan" },
        }),
      ).toThrow();
    });

    test("rejects duplicate objective IDs", () => {
      expect(() =>
        sectionPedagogyMetadataSchema.parse({
          objectives: [
            {
              id: "obj-1",
              description: "Tujuan satu",
              explanationBlockIds: ["b1"],
              formativeCheckBlockIds: ["b2"],
            },
            {
              id: "obj-1",
              description: "Tujuan duplikat",
              explanationBlockIds: ["b3"],
              formativeCheckBlockIds: ["b4"],
            },
          ],
          prerequisites: [],
          symbols: [],
          timeEstimate: { readingMinutes: 5, examplesMinutes: 5, practiceMinutes: 5 },
          visualRequirement: { status: "not_required", reason: "Alasan" },
        }),
      ).toThrow("Section objective IDs must be unique within section");
    });

    test("rejects duplicate symbols in symbol definitions", () => {
      expect(() =>
        sectionPedagogyMetadataSchema.parse({
          objectives: [
            {
              id: "obj-1",
              description: "Tujuan",
              explanationBlockIds: ["b1"],
              formativeCheckBlockIds: ["b2"],
            },
          ],
          prerequisites: [],
          symbols: [
            {
              symbol: "lambda",
              meaning: "Nilai eigen",
              introductionBlockId: "b1",
            },
            {
              symbol: "lambda",
              meaning: "Simbol duplikat",
              introductionBlockId: "b1",
            },
          ],
          timeEstimate: { readingMinutes: 5, examplesMinutes: 5, practiceMinutes: 5 },
          visualRequirement: { status: "not_required", reason: "Alasan" },
        }),
      ).toThrow("Section symbols must be unique within section");
    });
  });

  describe("validateSectionPedagogyReferences", () => {
    test("validates clean limit epsilon delta section successfully", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      expect(section.pedagogy).toBeDefined();

      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: section.pedagogy!,
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: (LIMIT_ARTICLE_FIXTURE.visuals ?? []).map((v) => v.id),
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("validates clean eigenvalues section successfully", () => {
      const section = structuredClone(EIGENVALUES_ARTICLE_FIXTURE.sections[1]);
      expect(section.pedagogy).toBeDefined();

      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: section.pedagogy!,
        availableSectionIds: EIGENVALUES_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("detects dangling explanation block reference", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          objectives: [
            {
              id: "obj-dangling",
              description: "Tujuan dengan blok gaib",
              explanationBlockIds: ["block-non-existent"],
              formativeCheckBlockIds: ["block-ed-chk-mcq"],
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_DANGLING_EXPLANATION_BLOCK"))).toBe(true);
    });

    test("detects block type mismatch for explanation block", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          objectives: [
            {
              id: "obj-type-mismatch",
              description: "Tujuan menunjuk PKA sebagai penjelasan",
              explanationBlockIds: ["block-ed-pka"], // prior_knowledge_activation, not explanation
              formativeCheckBlockIds: ["block-ed-chk-mcq"],
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_BLOCK_TYPE_MISMATCH"))).toBe(true);
    });

    test("detects dangling formative check block reference", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          objectives: [
            {
              id: "obj-dangling-chk",
              description: "Tujuan dengan formative check gaib",
              explanationBlockIds: ["block-ed-exp-def"],
              formativeCheckBlockIds: ["block-ghost-chk"],
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_DANGLING_FORMATIVE_CHECK_BLOCK"))).toBe(true);
    });

    test("detects dangling prerequisite support block reference", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          prerequisites: [
            {
              id: "prereq-broken",
              type: "external",
              label: "Kalkulus Dasar",
              supportBlockIds: ["block-ghost-support"],
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_DANGLING_SUPPORT_BLOCK"))).toBe(true);
    });

    test("detects dangling symbol introduction block reference", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          symbols: [
            {
              symbol: "gamma",
              meaning: "Konstanta",
              introductionBlockId: "block-ghost-intro",
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_DANGLING_SYMBOL_BLOCK"))).toBe(true);
    });

    test("detects dangling required visual reference", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: section.pedagogy!,
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-other-id"], // missing visual-limit-linear-2x-plus-1
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_DANGLING_VISUAL_REFERENCE"))).toBe(true);
    });

    test("detects self-referencing section prerequisite", () => {
      const section = structuredClone(LIMIT_ARTICLE_FIXTURE.sections[1]);
      const result = validateSectionPedagogyReferences({
        sectionId: section.id,
        sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
        pedagogy: {
          ...section.pedagogy!,
          prerequisites: [
            {
              id: section.id, // self-reference
              type: "section",
              label: "Bagian diri sendiri",
              supportBlockIds: ["block-ed-pka"],
            },
          ],
        },
        availableSectionIds: LIMIT_ARTICLE_FIXTURE.sections.map((s) => s.id),
        availableVisualIds: ["visual-limit-linear-2x-plus-1"],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("PEDAGOGY_SELF_PREREQUISITE"))).toBe(true);
    });
  });
});

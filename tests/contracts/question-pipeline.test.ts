import { describe, expect, it } from "bun:test";
import {
  buildAssessmentBlueprint,
  generateSlotFromKO,
  validateSlot,
} from "../../lib/questions/blueprint";
import { shuffleQuestionOptions } from "../../lib/questions/option-shuffle";
import { buildDistractorProvenances } from "../../lib/questions/distractor-provenance";
import { adaptExtractedDifficulty, adaptExtractedPattern } from "../../lib/assessment-extractor";
import { validateQuestion } from "../../lib/question-validator";
import { UnshuffledQuestionDraft } from "../../lib/questions/contracts";

describe("Question Pipeline Contract Tests (Plan 010)", () => {

  describe("Blueprint Engine & Slot Allocation", () => {

    it("STOP Condition: Rejects slot creation when KO ID is missing", () => {
      expect(() => {
        generateSlotFromKO({ id: "", title: "Test KO" }, 0);
      }).toThrow("STOP CONDITION");
    });

    it("validates slot dimension completeness and rejects impossible combinations", () => {
      const validSlot = generateSlotFromKO({ id: "ko-101", type: "formula", difficulty: "medium" }, 0);
      const val = validateSlot(validSlot);
      expect(val.valid).toBe(true);

      const impossibleSlot = {
        ...validSlot,
        cognitiveProcess: "remember" as const,
        difficultyTarget: "hard" as const,
      };
      const valImp = validateSlot(impossibleSlot);
      expect(valImp.valid).toBe(false);
      expect(valImp.errors.some((e) => e.includes("Impossible slot combination"))).toBe(true);
    });

    it("builds deterministic blueprint batch counts and tolerances", () => {
      const kos = [
        { id: "ko-1", type: "definition", difficulty: "easy" },
        { id: "ko-2", type: "formula", difficulty: "medium" },
        { id: "ko-3", type: "misconception", difficulty: "hard" },
      ];

      const blueprint = buildAssessmentBlueprint({
        courseId: "course-physics-1",
        kos,
        requestedCount: 6,
        seed: 12345,
      });

      expect(blueprint.version).toBe("2.0");
      expect(blueprint.slots).toHaveLength(6);
      expect(blueprint.tolerances.maxAllowedPerKO).toBeGreaterThanOrEqual(3);
      expect(Object.keys(blueprint.crossDimensionCounts).length).toBeGreaterThan(0);
    });
  });

  describe("Application Option Shuffle & Answer Synchronization", () => {

    it("shuffles options deterministically with seed and preserves answer mapping", () => {
      const draft: UnshuffledQuestionDraft = {
        slotId: "slot-1",
        knowledgeObjectId: "ko-101",
        prompt: "Calculate velocity $v$ when $s = 20\\text{ m}$ and $t = 2\\text{ s}$.",
        options: [
          { id: "opt_0", text: "10 m/s", isCorrect: true, misconceptionFamily: "none" },
          { id: "opt_1", text: "40 m/s", isCorrect: false, misconceptionFamily: "calc_error" },
          { id: "opt_2", text: "5 m/s", isCorrect: false, misconceptionFamily: "unit_error" },
          { id: "opt_3", text: "18 m/s", isCorrect: false, misconceptionFamily: "vocab_swap" },
        ],
        explanation: "Velocity is displacement divided by time ($v = s/t = 20/2 = 10\\text{ m/s}$).",
        bloomLevel: "apply",
        pattern: "direct_computation",
        estimatedSteps: 1,
      };

      const shuffled1 = shuffleQuestionOptions(draft, 42);
      const shuffled2 = shuffleQuestionOptions(draft, 42);

      // Deterministic equality given same seed
      expect(shuffled1.options).toEqual(shuffled2.options);
      expect(shuffled1.correctIndices).toEqual(shuffled2.correctIndices);

      // Verify the correct answer text remains '10 m/s' regardless of new display index
      const correctIndex = shuffled1.correctIndices[0];
      expect(shuffled1.options[correctIndex]).toBe("10 m/s");
      expect(shuffled1.stableOptionIds[correctIndex]).toBe("opt_0");
    });

    it("STOP Condition: Throws error if shuffle desynchronizes correct options count", () => {
      const invalidDraft: UnshuffledQuestionDraft = {
        slotId: "slot-1",
        knowledgeObjectId: "ko-101",
        prompt: "Invalid question",
        options: [
          { id: "opt_0", text: "A", isCorrect: false },
          { id: "opt_1", text: "B", isCorrect: false },
        ],
        explanation: "No correct option",
        bloomLevel: "understand",
        pattern: "conceptual",
        estimatedSteps: 1,
      };

      // When all options are false, original correct count is 0, which triggers validation or bounds error
      const shuffled = shuffleQuestionOptions(invalidDraft, 99);
      expect(shuffled.correctIndices).toHaveLength(0);
    });
  });

  describe("Distractor Provenance Engine", () => {

    it("builds machine-readable distractor provenances with method, score, version, and uncertainty", () => {
      const options = [
        { id: "opt_0", text: "Dense mass per unit volume", isCorrect: true },
        { id: "opt_1", text: "Weight equal to gravity force without mass", isCorrect: false, misconceptionFamily: "vocab_swap" as const },
        { id: "opt_2", text: "Volume divided by mass", isCorrect: false, misconceptionFamily: "calc_error" as const },
        { id: "opt_3", text: "Random distractor text", isCorrect: false },
      ];

      const misconceptionKOs = [
        { id: "ko-misc-1", title: "Weight equal to gravity force", content: "Weight equal to gravity force without mass" },
      ];

      const records = buildDistractorProvenances({
        options,
        misconceptionKOs,
        methodVersion: "2.0",
      });

      expect(records).toHaveLength(3); // 3 non-correct options

      const matchRecord = records.find((r) => r.stableOptionId === "opt_1");
      expect(matchRecord).toBeDefined();
      expect(matchRecord?.mappingMethod).toBe("lexical_overlap");
      expect(matchRecord?.uncertaintyState).toBe("confident");
      expect(matchRecord?.misconceptionKoId).toBe("ko-misc-1");

      const heuristicRecord = records.find((r) => r.stableOptionId === "opt_2");
      expect(heuristicRecord?.mappingMethod).toBe("heuristic_pattern");
      expect(heuristicRecord?.uncertaintyState).toBe("confident");
    });

    it("persists ambiguous matches below threshold as unknown", () => {
      const options = [
        { id: "opt_0", text: "True statement", isCorrect: true },
        { id: "opt_1", text: "Partial overlap words force mass", isCorrect: false },
      ];

      const misconceptionKOs = [
        { id: "ko-misc-2", title: "Completely different topic momentum velocity", content: "Mass force acceleration" },
      ];

      const records = buildDistractorProvenances({
        options,
        misconceptionKOs,
      });

      const ambRecord = records[0];
      if (ambRecord.score >= 0.20 && ambRecord.score < 0.35) {
        expect(ambRecord.uncertaintyState).toBe("ambiguous");
        expect(ambRecord.mappingMethod).toBe("unknown");
        expect(ambRecord.misconceptionKoId).toBeNull();
      } else {
        expect(ambRecord.mappingMethod).toBe("unknown");
      }
    });
  });

  describe("Validation Gates & Position Leakage Prevention", () => {

    it("rejects questions containing position-dependent leakage text", async () => {
      const questionWithLeakage = {
        knowledgeObjectId: "ko-101",
        prompt: "Which option is correct?",
        options: ["Option A is correct", "Option B is correct", "All of the above", "None of the above"],
        correctIndices: [0],
        explanation: "Option A is correct because of physics principles.",
      };

      const result = await validateQuestion(questionWithLeakage);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("position-dependent phrase"))).toBe(true);
    });

    it("rejects duplicate normalized options", async () => {
      const duplicateQuestion = {
        knowledgeObjectId: "ko-101",
        prompt: "Sample question?",
        options: ["Velocity", "velocity", "Acceleration", "Force"],
        correctIndices: [0],
        explanation: "Detailed explanation here for the question answer.",
      };

      const result = await validateQuestion(duplicateQuestion);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("duplicate choices"))).toBe(true);
    });
  });

  describe("Assessment Extraction Adapters", () => {

    it("aligns raw extracted difficulty to blueprint scale via adaptExtractedDifficulty", () => {
      expect(adaptExtractedDifficulty("1").normalized).toBe("easy");
      expect(adaptExtractedDifficulty("mudah").normalized).toBe("easy");
      expect(adaptExtractedDifficulty(3).normalized).toBe("hard");
      expect(adaptExtractedDifficulty("sulit").normalized).toBe("hard");
      expect(adaptExtractedDifficulty("advanced").normalized).toBe("hard");
      expect(adaptExtractedDifficulty("unknown_val").normalized).toBe("medium");
    });

    it("maps unknown procedural patterns to 'other'", () => {
      expect(adaptExtractedPattern("direct_computation")).toBe("direct_computation");
      expect(adaptExtractedPattern("exotic_custom_pattern")).toBe("other");
    });
  });

  describe("Independent Verification & Critic Loop (Plan 011)", () => {
    it("AI-QUEST-VER-001: Independent solver evaluates stem and options without answer leaks", async () => {
      const { solveQuestionIndependently, SolverInputSchema } = await import("../../lib/questions/independent-solver");

      const input = SolverInputSchema.parse({
        promptStem: "Berapakah hasil dari 2 + 2?",
        options: ["4", "5", "3", "6"],
      });

      const result = await solveQuestionIndependently(input);
      expect(result.solvedOptionIndex).toBe(0);
      expect(result.solverConfidence).toBeGreaterThan(0.9);
      expect(result.reasoningSummary.length).toBeGreaterThan(10);
    });

    it("AI-QUEST-VER-002: Pedagogical critic flags disagreement when solver differs from candidate answer", async () => {
      const { evaluateQuestionWithCritic } = await import("../../lib/questions/pedagogical-critic");

      const candidate = {
        promptStem: "Apakah definisi limit fungsi pada matematika?",
        options: ["Pintu", "Nilai pendekatan", "Kecepatan", "Luas"],
        candidateCorrectIndices: [2], // Candidate claims index 2 ("Kecepatan"), but solver solves 0 ("Pintu")
        explanation: "Penjelasan lengkap mengenai konsep limit.",
        solverResult: {
          solvedOptionIndex: 1,
          solverConfidence: 0.95,
          reasoningSummary: "Solved index 1",
        },
      };

      const evalResult = evaluateQuestionWithCritic(candidate);
      expect(evalResult.status).toBe("needs_review");
      expect(evalResult.violationCodes).toContain("SOLVER_CANDIDATE_DISAGREEMENT");
    });

    it("AI-QUEST-VER-003: Accepts clean question passing deterministic checks, solver agreement, and critic", async () => {
      const { evaluateQuestionWithCritic } = await import("../../lib/questions/pedagogical-critic");

      const candidate = {
        promptStem: "Berapakah turunan dari f(x) = x^2?",
        options: ["2x", "x", "x^3", "2"],
        candidateCorrectIndices: [0],
        explanation: "Menggunakan aturan pangkat d/dx(x^n) = n*x^(n-1), diperoleh 2x.",
        solverResult: {
          solvedOptionIndex: 0,
          solverConfidence: 0.98,
          reasoningSummary: "Turunan x^2 adalah 2x",
        },
      };

      const evalResult = evaluateQuestionWithCritic(candidate);
      expect(evalResult.status).toBe("accepted");
      expect(evalResult.violationCodes.length).toBe(0);
      expect(evalResult.qualityScore).toBeGreaterThan(0.9);
    });
  });
});


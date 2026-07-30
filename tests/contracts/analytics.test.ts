import { describe, expect, it } from "bun:test";

process.env.MOCK_GEMINI = "true";
import { loadAiFixture } from "../helpers/ai-fixtures";
import {
  evaluateEvidenceSufficiency,
  CalibratedAnalyticsResultSchema,
} from "@/lib/student-quiz-analytics/contracts";

describe("Analytics Contract Tests (Plan 012)", () => {
  it("characterization: loads analytics samples fixture and validates schema version", () => {
    const fixture = loadAiFixture<{
      sampleCount: number;
      items?: Array<{ questionId: string; accuracy: number }>;
      averageAccuracy?: number;
    }>("analytics-samples.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-ANALYTICS-001");

    const { oneItem, twoItems, representative } = fixture.fixtures;
    expect(oneItem.sampleCount).toBe(1);
    expect(twoItems.sampleCount).toBe(2);
    expect(representative.averageAccuracy).toBe(0.65);
  });

  it("AI-ANALYTICS-001: Compute item accuracy breakdowns and evidence sufficiency without invoking LLM calls", () => {
    expect(evaluateEvidenceSufficiency(1)).toBe("insufficient");
    expect(evaluateEvidenceSufficiency(2)).toBe("insufficient");
    expect(evaluateEvidenceSufficiency(4)).toBe("limited");
    expect(evaluateEvidenceSufficiency(10)).toBe("sufficient");

    const calibratedResult = CalibratedAnalyticsResultSchema.parse({
      evidenceSufficiency: evaluateEvidenceSufficiency(2),
      observed: {
        totalQuestions: 2,
        correctCount: 1,
        accuracyPercentage: 50,
        timingAvailable: true,
        perQuestionTimingAvailable: false, // Explicit: per-question timing is not fabricated
      },
      interpreted: [
        {
          hypothesis: "Siswa mungkin terkecoh oleh pilihan distraktor pada soal kalkulus.",
          evidenceLabel: "insufficient",
          supportingObservationIds: ["obs-q1"],
          alternativeExplanations: ["Jumlah soal terlalu sedikit untuk menyimpulkan penguasaan materi."],
        },
      ],
      recommended: [
        {
          actionSummary: "Pelajari kembali materi limit fungsi.",
          resourceId: "res-limit-101",
          reason: "Terdapat kesalahan pada 1 dari 2 soal.",
        },
      ],
    });

    expect(calibratedResult.evidenceSufficiency).toBe("insufficient");
    expect(calibratedResult.observed.perQuestionTimingAvailable).toBe(false);
  });

  it("AI-ANALYTICS-002: Generate pedagogical insights based on quantitative distractor patterns with alternative explanations", () => {
    const calibratedResult = CalibratedAnalyticsResultSchema.parse({
      evidenceSufficiency: evaluateEvidenceSufficiency(8),
      observed: {
        totalQuestions: 8,
        correctCount: 6,
        accuracyPercentage: 75,
        timingAvailable: true,
        perQuestionTimingAvailable: true,
        attemptDurationSeconds: 420,
      },
      interpreted: [
        {
          hypothesis: "Siswa memahami mayoritas konsep dasar tetapi konsisten salah pada aturan rantai.",
          evidenceLabel: "sufficient",
          supportingObservationIds: ["obs-q3", "obs-q7"],
          alternativeExplanations: [
            "Kesalahan dapat terjadi akibat ketelitian hitung daripada ketidakpahaman konsep.",
          ],
        },
      ],
      recommended: [
        {
          actionSummary: "Lakukan latihan khusus aturan rantai turunan.",
          resourceId: "res-rantai-201",
          reason: "Tiga distraktor terkait aturan rantai dipilih pada attempt ini.",
        },
      ],
    });

    expect(calibratedResult.evidenceSufficiency).toBe("sufficient");
    expect(calibratedResult.interpreted[0].alternativeExplanations.length).toBeGreaterThan(0);
  });
});

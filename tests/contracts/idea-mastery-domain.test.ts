import { describe, expect, it } from "bun:test";
import { buktiIdeJawabanSchema, buktiPembelajaranSchema, perubahanPemahamanSchema, pemahamanIdeSchema, rekomendasiFlashcardSchema } from "@/lib/pemahaman/contracts";

const now = "2026-08-02T00:00:00.000Z";
const baseEvidence = { id: "evidence-1", answerId: "answer-1", ideaId: "ide-1", scoreContribution: 0.8, weight: 1, confidence: 75, evidenceSource: "answer" as const, rubricVersion: "rubric.v1", derivationStatus: "direct" as const, affectsMastery: true, createdAt: now };

describe("Plan 004 Idea evidence and mastery contracts", () => {
  it("stores Idea evidence with provenance fields and allows independent mastery values", () => {
    expect(buktiIdeJawabanSchema.parse(baseEvidence).rubricVersion).toBe("rubric.v1");
    expect(buktiPembelajaranSchema.parse({ id: "learning-evidence-1", muridId: "murid-1", ideaId: "ide-1", scoreContribution: 0.8, weight: 1, confidence: 75, evidenceSource: "answer", rubricVersion: "rubric.v1", derivationStatus: "direct", affectsMastery: true, observedAt: now })).toBeTruthy();
    const mastery = pemahamanIdeSchema.parse({ id: "mastery-1", muridId: "murid-1", ideaId: "ide-1", skor: 25, keyakinan: 90, evidenceCount: 1, updatedAt: now });
    expect(mastery.skor).not.toBe(mastery.keyakinan);
    expect(perubahanPemahamanSchema.parse({ id: "change-1", pemahamanId: mastery.id, previousScore: 10, nextScore: 25, previousConfidence: 80, nextConfidence: 90, evidenceId: "evidence-1", changedAt: now })).toBeTruthy();
    expect(rekomendasiFlashcardSchema.parse({ id: "recommendation-1", muridId: "murid-1", ideaId: "ide-1", flashcardId: "flashcard-1", reason: "low mastery", dueAt: now, status: "pending" })).toBeTruthy();
  });

  it("stores ambiguous evidence but prevents it from affecting mastery", () => {
    expect(buktiIdeJawabanSchema.safeParse({ ...baseEvidence, derivationStatus: "ambiguous", affectsMastery: false }).success).toBe(true);
    expect(buktiIdeJawabanSchema.safeParse({ ...baseEvidence, derivationStatus: "ambiguous", affectsMastery: true }).success).toBe(false);
  });

  it("enforces independent 0..100 score and confidence bounds", () => {
    expect(pemahamanIdeSchema.safeParse({ id: "mastery-1", muridId: "murid-1", ideaId: "ide-1", skor: 0, keyakinan: 100, evidenceCount: 0, updatedAt: now }).success).toBe(true);
    expect(pemahamanIdeSchema.safeParse({ id: "mastery-1", muridId: "murid-1", ideaId: "ide-1", skor: 101, keyakinan: 50, evidenceCount: 0, updatedAt: now }).success).toBe(false);
    expect(pemahamanIdeSchema.safeParse({ id: "mastery-1", muridId: "murid-1", ideaId: "ide-1", skor: 50, keyakinan: -1, evidenceCount: 0, updatedAt: now }).success).toBe(false);
    expect(perubahanPemahamanSchema.safeParse({ id: "change-1", pemahamanId: "mastery-1", previousScore: 10, nextScore: 101, previousConfidence: 80, nextConfidence: 90, evidenceId: "evidence-1", changedAt: now }).success).toBe(false);
  });
});

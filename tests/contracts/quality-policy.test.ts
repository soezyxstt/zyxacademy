import { describe, expect, test } from "bun:test";
import {
  PEDAGOGIC_CRITERION_IDS,
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  validatePedagogicRubricDecision,
} from "@/lib/materials/quality-policy";
import {
  EIGENVALUES_CONTENT_FINGERPRINT,
  EIGENVALUES_HUMAN_REVIEW_CONDITIONAL,
  INVALID_HUMAN_REVIEW_APPROVED_WITHOUT_EXCEPTION,
  INVALID_HUMAN_REVIEW_DUPLICATE_CRITERION,
  INVALID_HUMAN_REVIEW_DUPLICATE_EXCEPTION,
  INVALID_HUMAN_REVIEW_EXCEPTION_FOR_MET,
  INVALID_HUMAN_REVIEW_MISSING_CRITERION,
  LIMIT_CONTENT_FINGERPRINT,
  LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL,
  TCP_HANDSHAKE_CONTENT_FINGERPRINT,
  TCP_HANDSHAKE_HUMAN_REVIEW_REJECTED,
} from "../fixtures/product-learning/human-rubric-cases";
import { LIMIT_ARTICLE_FIXTURE } from "../fixtures/product-learning/limit-epsilon-delta";

describe("quality policy and rubric validation", () => {
  test("maintains policy version invariant", () => {
    expect(QUALITY_POLICY_VERSION).toBe("2026.09.1");
  });

  test("defines exactly eight pedagogic criteria", () => {
    expect(PEDAGOGIC_CRITERION_IDS).toHaveLength(8);
    expect(PEDAGOGIC_CRITERION_IDS).toEqual([
      "concept_accuracy",
      "prerequisite_completeness",
      "explanation_sequence",
      "symbol_and_condition_clarity",
      "example_reasoning",
      "representation_or_visual",
      "misconceptions_and_limits",
      "formative_check_and_explanation",
    ]);
  });

  describe("human rubric reviewer decisions", () => {
    test("approves clean limit definition review where all eight criteria are met", () => {
      const result = validatePedagogicRubricDecision(LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test("approves eigenvalues review with authorized exception on representation", () => {
      const result = validatePedagogicRubricDecision(EIGENVALUES_HUMAN_REVIEW_CONDITIONAL);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test("validates rejected tcp handshake review decision structure", () => {
      const result = validatePedagogicRubricDecision(TCP_HANDSHAKE_HUMAN_REVIEW_REJECTED);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test("rejects review decision missing required criterion", () => {
      const result = validatePedagogicRubricDecision(INVALID_HUMAN_REVIEW_MISSING_CRITERION);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "RUBRIC_CRITERION_MISSING")).toBe(true);
    });

    test("rejects review decision with duplicate criterion", () => {
      const result = validatePedagogicRubricDecision(INVALID_HUMAN_REVIEW_DUPLICATE_CRITERION);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "RUBRIC_CRITERION_DUPLICATE")).toBe(true);
    });

    test("rejects review decision with duplicate exception", () => {
      const result = validatePedagogicRubricDecision(INVALID_HUMAN_REVIEW_DUPLICATE_EXCEPTION);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "RUBRIC_EXCEPTION_DUPLICATE")).toBe(true);
    });

    test("rejects exception declared for criterion already assessed as met", () => {
      const result = validatePedagogicRubricDecision(INVALID_HUMAN_REVIEW_EXCEPTION_FOR_MET);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "RUBRIC_EXCEPTION_UNNECESSARY_FOR_MET")).toBe(true);
    });

    test("rejects approved decision with unmet criterion and no authorized exception", () => {
      const result = validatePedagogicRubricDecision(INVALID_HUMAN_REVIEW_APPROVED_WITHOUT_EXCEPTION);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "RUBRIC_NON_MET_WITHOUT_EXCEPTION")).toBe(true);
    });
  });

  describe("computePedagogyContentFingerprint", () => {
    test("computes valid 64-character hex sha256 fingerprints", () => {
      expect(LIMIT_CONTENT_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
      expect(EIGENVALUES_CONTENT_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
      expect(TCP_HANDSHAKE_CONTENT_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    });

    test("produces distinct fingerprints across distinct topics", () => {
      const set = new Set([
        LIMIT_CONTENT_FINGERPRINT,
        EIGENVALUES_CONTENT_FINGERPRINT,
        TCP_HANDSHAKE_CONTENT_FINGERPRINT,
      ]);
      expect(set.size).toBe(3);
    });

    test("is deterministic and invariant to property insertion ordering", () => {
      const fp1 = computePedagogyContentFingerprint({
        article: LIMIT_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
      });

      const reorderedArticle = {
        visuals: LIMIT_ARTICLE_FIXTURE.visuals,
        title: LIMIT_ARTICLE_FIXTURE.title,
        sections: LIMIT_ARTICLE_FIXTURE.sections,
        id: LIMIT_ARTICLE_FIXTURE.id,
      };
      const fp2 = computePedagogyContentFingerprint({
        article: reorderedArticle as unknown as Record<string, unknown>,
      });

      expect(fp1).toBe(fp2);
    });

    test("is sensitive to block text edits", () => {
      const modifiedArticle = structuredClone(LIMIT_ARTICLE_FIXTURE);
      modifiedArticle.sections[1].blocks[1].content += " Tambahan kata uji sensitivitas.";

      const originalFp = computePedagogyContentFingerprint({
        article: LIMIT_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
      });
      const modifiedFp = computePedagogyContentFingerprint({
        article: modifiedArticle as unknown as Record<string, unknown>,
      });

      expect(modifiedFp).not.toBe(originalFp);
    });

    test("is sensitive to visual spec changes", () => {
      const modifiedArticle = structuredClone(LIMIT_ARTICLE_FIXTURE);
      if (modifiedArticle.visuals && modifiedArticle.visuals.length > 0) {
        (modifiedArticle.visuals[0] as any).limitValue = 7.001;
      }

      const originalFp = computePedagogyContentFingerprint({
        article: LIMIT_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
      });
      const modifiedFp = computePedagogyContentFingerprint({
        article: modifiedArticle as unknown as Record<string, unknown>,
      });

      expect(modifiedFp).not.toBe(originalFp);
    });

    test("is insensitive to reviewerState or internal generation hash", () => {
      const modifiedArticle = structuredClone(LIMIT_ARTICLE_FIXTURE);
      modifiedArticle.reviewerState = "published" as any;
      modifiedArticle.generationHash = "ff".repeat(32);

      const originalFp = computePedagogyContentFingerprint({
        article: LIMIT_ARTICLE_FIXTURE as unknown as Record<string, unknown>,
      });
      const modifiedFp = computePedagogyContentFingerprint({
        article: modifiedArticle as unknown as Record<string, unknown>,
      });

      expect(modifiedFp).toBe(originalFp);
    });
  });
});

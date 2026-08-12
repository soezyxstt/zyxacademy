import { describe, expect, test } from "bun:test";
import {
  isAllowedEvidenceField,
  ZyraLearnerPreferencesSchema,
  ZyraLearningEventInputSchema,
} from "@/lib/zyra/personalization";

describe("Zyra personalization evidence allowlist", () => {
  test("accepts bounded adaptation evidence", () => {
    const parsed = ZyraLearningEventInputSchema.parse({
      courseId: "course-1",
      eventKind: "checkpoint_answered",
      sourceType: "tutor",
      outcome: "success",
      responseLatencyBucket: "standard",
      hintLevel: "hint_1",
      representation: "stepwise",
    });

    expect(parsed.eventKind).toBe("checkpoint_answered");
    expect(parsed.representation).toBe("stepwise");
  });

  test("rejects free-form prompt text in an evidence reference", () => {
    const result = ZyraLearningEventInputSchema.safeParse({
      courseId: "course-1",
      eventKind: "tutor_question",
      sourceType: "tutor",
      evidenceRef: "learner asked how to solve this?",
    });

    expect(result.success).toBe(false);
  });

  test("rejects unknown fields instead of silently widening the profile", () => {
    const result = ZyraLearningEventInputSchema.safeParse({
      courseId: "course-1",
      eventKind: "tutor_question",
      sourceType: "tutor",
      prompt: "private text",
    });

    expect(result.success).toBe(false);
  });

  test("keeps explicit preferences as a separate allowlisted surface", () => {
    expect(isAllowedEvidenceField("explicit_preferences", "pace")).toBe(true);
    expect(isAllowedEvidenceField("explicit_preferences", "masteryScore")).toBe(false);
    expect(ZyraLearnerPreferencesSchema.parse({ pace: "slow" })).toEqual({ pace: "slow" });
  });
});

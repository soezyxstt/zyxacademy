import { describe, expect, it } from "bun:test";
import {
  ASSESSMENT_FALLBACK_REASON,
  resolveAssessmentFixtureResolution,
} from "@/lib/asesmen/staging-resolution";

describe("Plan 010 staging fixture resolution", () => {
  it("preserves the requested course while recording a canonical fallback mismatch", () => {
    expect(resolveAssessmentFixtureResolution({
      requestedCourseId: "tutorial-pka",
      requestedNormalizedCourseId: "tutorial-pka",
      requestedPublishedIdeaCount: 0,
      fallbackCourseId: "canonical-course-a",
      fallbackPublishedIdeaCount: 2,
    })).toEqual({
      requestedCourseId: "tutorial-pka",
      normalizedCourseId: "canonical-course-a",
      fixtureMode: "dedicated_canonical_fallback",
      fallbackReason: ASSESSMENT_FALLBACK_REASON,
      requestedNormalizedMismatch: true,
    });
  });

  it("uses the requested canonical course when it has two published Ideas", () => {
    expect(resolveAssessmentFixtureResolution({
      requestedCourseId: "canonical-course-a",
      requestedNormalizedCourseId: "canonical-course-a",
      requestedPublishedIdeaCount: 2,
      fallbackCourseId: "canonical-course-b",
      fallbackPublishedIdeaCount: 2,
    }).fixtureMode).toBe("dedicated");
  });

  it("fails closed when no canonical fallback has two published Ideas", () => {
    expect(() => resolveAssessmentFixtureResolution({
      requestedCourseId: "tutorial-pka",
      requestedNormalizedCourseId: null,
      requestedPublishedIdeaCount: 0,
      fallbackCourseId: null,
      fallbackPublishedIdeaCount: 0,
    })).toThrow("STAGING_ASSESSMENT_CANONICAL_FALLBACK_PREREQUISITE_MISSING");
  });
});

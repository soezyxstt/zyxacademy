export const ASSESSMENT_FALLBACK_REASON = "REQUESTED_COURSE_HAS_NO_TWO_PUBLISHED_IDEAS";
export const ASSESSMENT_REQUESTED_COURSE_NOT_FOUND_REASON = "REQUESTED_COURSE_CANONICAL_IDENTITY_NOT_FOUND";

export type AssessmentFixtureMode = "dedicated" | "dedicated_canonical_fallback";

export type AssessmentFixtureResolution = {
  requestedCourseId: string;
  normalizedCourseId: string;
  fixtureMode: AssessmentFixtureMode;
  fallbackReason: string | null;
  requestedNormalizedMismatch: boolean;
};

export function resolveAssessmentFixtureResolution(input: {
  requestedCourseId: string;
  requestedNormalizedCourseId: string | null;
  requestedPublishedIdeaCount: number;
  fallbackCourseId: string | null;
  fallbackPublishedIdeaCount: number;
}): AssessmentFixtureResolution {
  if (input.requestedNormalizedCourseId && input.requestedPublishedIdeaCount >= 2) {
    return {
      requestedCourseId: input.requestedCourseId,
      normalizedCourseId: input.requestedNormalizedCourseId,
      fixtureMode: "dedicated",
      fallbackReason: null,
      requestedNormalizedMismatch: input.requestedNormalizedCourseId !== input.requestedCourseId,
    };
  }

  if (!input.fallbackCourseId || input.fallbackPublishedIdeaCount < 2) {
    throw new Error("STAGING_ASSESSMENT_CANONICAL_FALLBACK_PREREQUISITE_MISSING");
  }

  return {
    requestedCourseId: input.requestedCourseId,
    normalizedCourseId: input.fallbackCourseId,
    fixtureMode: "dedicated_canonical_fallback",
    fallbackReason: input.requestedNormalizedCourseId
      ? ASSESSMENT_FALLBACK_REASON
      : ASSESSMENT_REQUESTED_COURSE_NOT_FOUND_REASON,
    requestedNormalizedMismatch: input.fallbackCourseId !== input.requestedCourseId,
  };
}

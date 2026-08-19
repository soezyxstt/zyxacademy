import { describe, expect, it } from "bun:test";
import {
  renderPedagogyHumanReviewPage,
  validatePedagogyHumanReview,
} from "@/lib/zyra/pedagogy/human-review";

const draft = {
  status: "pending_maintainer_review",
  plan: "007",
  runId: "plan007-review-test",
  rubricScale: { minimum: 1, maximum: 5, passingAverage: 4 },
  instructions: "Maintainer review only.",
  syntheticInputsOnly: true,
  reviewItems: [
    {
      id: "case-01",
      inputKind: "synthetic_golden",
      baselineAnswer: "Baseline <script>alert('x')</script>",
      candidateAnswer: "Candidate response",
      rubric: {
        clarity: null,
        scaffolding: null,
        helpfulness: null,
        cognitiveLoad: null,
        understandingOverAnswerReveal: null,
        reviewerNotes: "",
      },
    },
  ],
  secretsPrinted: false,
  authenticatedUrlsPrinted: false,
} as const;

function submission(scores = 4, notes = "Reviewed by maintainer.") {
  return {
    status: "submitted",
    plan: "007",
    runId: "plan007-review-test",
    reviewer: {
      type: "maintainer_human",
      identityHash: "a".repeat(64),
      reviewedAt: "2026-08-08T12:00:00.000Z",
    },
    syntheticInputsOnly: true,
    reviewItems: [
      {
        id: "case-01",
        inputKind: "synthetic_golden",
        rubric: {
          clarity: scores,
          scaffolding: scores,
          helpfulness: scores,
          cognitiveLoad: scores,
          understandingOverAnswerReveal: scores,
          reviewerNotes: notes,
        },
      },
    ],
  };
}

describe("Plan 007 maintainer human review", () => {
  it("passes a complete human rubric without retaining raw answers", () => {
    const result = validatePedagogyHumanReview(draft, submission());
    expect(result.status).toBe("passed");
    expect(result.overallAverage).toBe(4);
    expect(result.reviewItemCount).toBe(1);
    expect(result.rawAnswersStored).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Candidate response");
    expect(JSON.stringify(result)).not.toContain("Baseline");
  });

  it("fails low scores and requires reviewer notes below four", () => {
    const low = validatePedagogyHumanReview(draft, submission(2, "Needs stronger scaffolding."));
    expect(low.status).toBe("failed");
    expect(low.lowScoreCount).toBe(5);
    expect(low.reasonCodes).toContain("PEDAGOGY_REVIEW_SCORE_BELOW_THREE");

    const missingNotes = validatePedagogyHumanReview(draft, submission(3, ""));
    expect(missingNotes.reasonCodes).toContain("PEDAGOGY_REVIEW_NOTES_REQUIRED_FOR_LOW_SCORE");
  });

  it("rejects a submission for a different case set", () => {
    const invalid = submission();
    invalid.reviewItems[0].id = "case-02";
    expect(() => validatePedagogyHumanReview(draft, invalid)).toThrow("PEDAGOGY_REVIEW_ITEM_SET_MISMATCH");
  });

  it("renders a self-contained page with escaped candidate content", () => {
    const html = renderPedagogyHumanReviewPage(draft);
    expect(html).toContain("Plan 007 human review");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert('x')</script>");
    expect(html).not.toContain("https://");
    expect(html).toContain("maintainer_human");
  });
});

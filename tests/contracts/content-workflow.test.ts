import { describe, expect, it } from "bun:test";
import { CONTENT_WORKFLOW_TRANSITIONS, nextWorkflowState } from "@/lib/workflow/content-workflow";

describe("Plan 014 content workflow", () => {
  it("models the guarded source-to-publication lifecycle", () => {
    expect(CONTENT_WORKFLOW_TRANSITIONS.uploaded).toEqual(["validated"]);
    expect(CONTENT_WORKFLOW_TRANSITIONS.tutor_review).toEqual(["changes_requested", "admin_review"]);
    expect(CONTENT_WORKFLOW_TRANSITIONS.approved).toEqual(["published"]);
    expect(CONTENT_WORKFLOW_TRANSITIONS.published).toEqual(["superseded", "withdrawn"]);
  });

  it("rejects skipping review or reopening terminal states", () => {
    expect(() => nextWorkflowState("uploaded", "published")).toThrow("TRANSITION_NOT_ALLOWED");
    expect(() => nextWorkflowState("withdrawn", "staged")).toThrow("TRANSITION_NOT_ALLOWED");
    expect(nextWorkflowState("changes_requested", "staged")).toBe("staged");
  });
});

import { describe, expect, it } from "bun:test";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { buildPedagogyPromptInput } from "@/lib/zyra/pedagogy/prompt-input";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";

describe("Zyra learning presentation", () => {
  it("encourages useful visuals and local parameter exploration without an explicit graph request", () => {
    const context = buildPedagogyContext({ courseId: "math", question: "Jelaskan garis dengan analogi", action: "follow_up", activityKind: "study", attemptState: "none", answerReleaseState: "released", matchState: "none", allowDirectAnswerReveal: true, assessmentReasonCode: "STUDY", evidenceSufficiency: "sufficient" });
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), context.explicitTopic, []);
    const rules = input.outputRules.join("\n");
    expect(rules).toContain("even without a visual request");
    expect(rules).toContain("defaultValue");
    expect(rules).toContain("preserve paragraph breaks");
    expect(rules).toContain("actual explanation");
  });

  it("keeps graph, flowchart, image, and assessment guidance within the input contract", () => {
    const context = buildPedagogyContext({ courseId: "math", question: "Grafik dan diagram", action: "hint_request", activityKind: "exam", attemptState: "in_progress", answerReleaseState: "hidden", matchState: "none", allowDirectAnswerReveal: false, assessmentReasonCode: "SCAFFOLD", evidenceSufficiency: "sufficient", responseModifiers: ["graph", "flowchart"] });
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), context.explicitTopic, [], { hasImages: true });
    expect(input.outputRules.length).toBeLessThanOrEqual(16);
    expect(input.outputRules.join("\n")).toContain("approved hint level");
    expect(input.outputRules.join("\n")).toContain("unreadableRegions");
  });
});

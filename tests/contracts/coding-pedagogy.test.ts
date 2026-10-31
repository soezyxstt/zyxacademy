import { describe, expect, it } from "bun:test";
import { GoogleGenAI } from "@google/genai";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { buildPedagogyPromptInput, codingProviderResponseSchema, codingTextProviderResponseSchema } from "@/lib/zyra/pedagogy/prompt-input";
import { ZyraTeachingResponseSchema } from "@/lib/zyra/pedagogy/contracts";
import { codingHelpRequestSchema } from "@/lib/coding/http-contracts";

const context = buildPedagogyContext({ courseId: "python", question: "Jelaskan error saya", action: "follow_up", activityKind: "study", attemptState: "none", answerReleaseState: "released", matchState: "none", allowDirectAnswerReveal: true, assessmentReasonCode: "STUDY_PRACTICE_ALLOWED", evidenceSufficiency: "sufficient" });

describe("coding coaching response contract", () => {
  it("limits generation to playground requests and asks for a complete fenced program", () => {
    expect(codingHelpRequestSchema.safeParse({ kind: "playground", code: "", stdin: "", execution: null, intent: "generate" }).success).toBe(true);
    expect(codingHelpRequestSchema.safeParse({ kind: "exercise", problem: { problemId: "p", version: 1 }, code: "", intent: "generate", surface: { kind: "article", articleId: "a", articleVersion: 1, partId: "p" } }).success).toBe(false);
    const evidence = [{ id: "coding:generate:learner:session", kind: "question", title: "Python", content: "{}", href: "/courses/python/playground" }];
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), "Buat program", evidence);
    expect(input.outputRules.join(" ")).toContain("complete runnable Python program");
    expect(input.outputRules.join(" ")).toContain("fenced python code block");
    const assessment = { ...context, activeAssessment: true, allowDirectAnswerReveal: false };
    const protectedInput = buildPedagogyPromptInput(assessment, selectTeachingPlan(assessment), "Buat program", evidence);
    expect(protectedInput.outputRules.join(" ")).not.toContain("complete runnable Python program");
  });
  it("preserves long multiline playground problems in the provider input", () => {
    const question = `Buat program:\n${"syarat lengkap ".repeat(100)}\nInput:\n2\n3\nOutput:\n5`;
    const evidence = [{ id: "coding:generate:learner:session", kind: "question", title: "Python", content: "{}", href: "/courses/python/playground" }];
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), question, evidence);
    expect(input.learnerQuestion).toBe(question);
  });
  it("supplies required response fields, checkpoint and typed flowchart wire format to the model", () => {
    const input = buildPedagogyPromptInput({...context,responseModifiers:["flowchart"]}, selectTeachingPlan(context), context.explicitTopic, [{ id: "coding:learner:session", kind: "question", title: "Python", content: 'print(1 / 0)', href: '/courses/python/playground' }]);
    const rule = input.outputRules[0];
    expect(rule).toContain('"sourceVersion"');
    expect(rule).toContain('"claimRefs"');
    expect(rule).toContain('"source"');
    expect(rule).toContain('checkForUnderstanding must contain');
    // The formerly emitted shape is still rejected. No schema relaxation.
    expect(ZyraTeachingResponseSchema.safeParse({learnerFacingText:"Coba lagi",explanationBlocks:[{title:"Error",content:"Titik dua"}]}).success).toBe(false);
  });
  it("serializes the coding schema through the real SDK without making a network request", async () => {
    const originalFetch = globalThis.fetch;
    const schema = JSON.stringify(codingProviderResponseSchema);
    expect(schema).not.toContain('"exclusiveMinimum"');
    expect(schema).not.toContain('"additionalProperties"');
    try {
      globalThis.fetch = (() => { throw new Error("SCHEMA_SERIALIZED_WITHOUT_NETWORK"); }) as unknown as typeof fetch;
      const client = new GoogleGenAI({ apiKey: "local-schema-fixture-only" });
      await expect(client.models.generateContent({ model: "gemini-3.5-flash-lite", contents: "Fixture", config: { responseMimeType: "application/json", responseSchema: codingProviderResponseSchema } })).rejects.toThrow("SCHEMA_SERIALIZED_WITHOUT_NETWORK");
    } finally { globalThis.fetch = originalFetch; }
  });
  it("keeps ordinary coding explanations free of unsolicited diagram output", () => {
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), context.explicitTopic, [{id:"coding:learner:session",kind:"question",title:"Python",content:"print(1)",href:"/courses/python/playground"}]);
    expect(input.outputRules[0]).toContain("Omit canvasSpec");
    expect((codingTextProviderResponseSchema as {properties:object}).properties).not.toHaveProperty("canvasSpec");
  });
  it("does not attach Python-specific instructions to ordinary course evidence", () => {
    const input = buildPedagogyPromptInput(context, selectTeachingPlan(context), context.explicitTopic, [{id:"idea-1",kind:"idea",title:"Konsep",content:"Materi",href:"/courses/python"}]);
    expect(input.outputRules[0]).not.toContain('"canvasSpec"');
  });
});

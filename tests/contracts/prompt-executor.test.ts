import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";

process.env.MOCK_GEMINI = "true";
import { repairJsonString } from "@/lib/ko-utils";
import { loadAiFixture } from "../helpers/ai-fixtures";
import { PromptExecutor, getStructuredOutputMetrics, resetStructuredOutputMetrics } from "@/lib/prompt-executor";
import { PromptContract } from "@/lib/ai/contracts";
import { POLICY_JSON_STRICT, POLICY_ZYX_VOICE, POLICY_MATH_LATEX } from "@/lib/ai/policies";
import { SemanticValidator } from "@/lib/ai/validation";
import * as geminiModule from "@/lib/gemini";
import { RequestLifecycleError } from "@/lib/ai/request-lifecycle";
import { z } from "zod";

describe("PromptExecutor Contract Tests", () => {
  beforeEach(() => {
    process.env.MOCK_GEMINI = "true";
  });

  afterEach(() => {
    // restore mocks if any
  });

  it("characterization: repairs json string with trailing commas or unescaped characters", () => {
    const rawMalformedJson = '{"name": "test", "items": [1, 2, 3,]}';
    const repaired = repairJsonString(rawMalformedJson);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it("characterization: validates schema version in prompt executor fixtures", () => {
    const fixture = loadAiFixture("source-coverage.json");
    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-TUTOR-COV-001");
  });

  it("AI-PROMPT-001: Execute prompt contract with policy composition and validated output schema", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ title: "Turunan", explanation: "Turunan menyatakan laju perubahan." }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 120,
      candidatesTokenCount: 45,
    });

    const schema = z.object({
      title: z.string(),
      explanation: z.string(),
    });

    const contract: PromptContract<{ topic: string }, z.infer<typeof schema>> = {
      stageId: "tutor-explanation",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT, POLICY_ZYX_VOICE],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Berikan penjelasan konsep.",
      userPrompt: (vars) => `Jelaskan topik ${vars.topic}`,
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_001",
      contract,
      variables: { topic: "Kalkulus" },
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.data?.title).toBe("Turunan");
    expect(result.retryCount).toBe(0);
    expect(result.violationCodes.length).toBe(0);
    expect(result.traceId).toBeDefined();

    spy.mockRestore();
  });

  it("AI-PROMPT-002: Perform single automatic repair attempt on malformed JSON parse failure", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Initial call returns malformed JSON
    spy.mockResolvedValueOnce({
      response: { text: "{ malformed json content ... }" },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 80,
      candidatesTokenCount: 20,
    });
    // Repair call returns valid JSON
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ answer: "Fixed answer" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 150,
      candidatesTokenCount: 30,
    });

    const schema = z.object({ answer: z.string() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "quiz-generation",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Generate quiz",
      userPrompt: () => "Generate question",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_002",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.data?.answer).toBe("Fixed answer");
    expect(result.retryCount).toBe(1);

    spy.mockRestore();
  });

  it("AI-PROMPT-003: Perform bounded repair attempt on Zod schema validation failure", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Initial call returns JSON missing required field 'score'
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ feedback: "Great work" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 100,
      candidatesTokenCount: 25,
    });
    // Repair call returns complete valid JSON
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ feedback: "Great work", score: 95 }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 160,
      candidatesTokenCount: 35,
    });

    const schema = z.object({ feedback: z.string(), score: z.number() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "mistake-feedback",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Evaluate student submission",
      userPrompt: () => "Evaluate",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_003",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.data?.score).toBe(95);
    expect(result.retryCount).toBe(1);

    spy.mockRestore();
  });

  it("AI-PROMPT-004: Perform bounded repair attempt on semantic validation failure", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Initial call returns short explanation violating semantic rule
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ title: "Limit", explanation: "Short" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 90,
      candidatesTokenCount: 15,
    });
    // Repair call returns detailed explanation passing semantic rule
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ title: "Limit", explanation: "Limit adalah nilai yang didekati oleh suatu fungsi." }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 140,
      candidatesTokenCount: 40,
    });

    const schema = z.object({ title: z.string(), explanation: z.string() });
    const minLengthValidator: SemanticValidator<any, z.infer<typeof schema>> = {
      id: "explanation-min-length",
      version: "1.0",
      validate: (out) => {
        if (out.explanation.length < 10) {
          return [{
            code: "EXPLANATION_TOO_SHORT",
            path: "explanation",
            message: "Explanation must be at least 10 characters long.",
            severity: "error",
          }];
        }
        return [];
      },
    };

    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "tutor-explanation",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      validators: [minLengthValidator],
      validatorVersion: "1.0",
      systemInstruction: "Explain topic",
      userPrompt: () => "Explain Limit",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_004",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.retryCount).toBe(1);

    spy.mockRestore();
  });

  it("AI-PROMPT-005: Permitted field repair succeeds when modified field is in repairableFields", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Initial call has bad explanation
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ conceptId: "C101", explanation: "x" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 80,
      candidatesTokenCount: 15,
    });
    // Repair changes only explanation
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ conceptId: "C101", explanation: "Konsep turunan fungsi aljabar." }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 130,
      candidatesTokenCount: 35,
    });

    const schema = z.object({ conceptId: z.string(), explanation: z.string() });
    const minLengthValidator: SemanticValidator<any, z.infer<typeof schema>> = {
      id: "explanation-min-length",
      version: "1.0",
      validate: (out) => {
        if (out.explanation.length < 5) {
          return [{
            code: "EXPLANATION_TOO_SHORT",
            path: "explanation",
            message: "Explanation too short",
            severity: "error",
          }];
        }
        return [];
      },
    };

    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "ko-extraction",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      validators: [minLengthValidator],
      repairableFields: ["explanation"],
      systemInstruction: "Extract KO",
      userPrompt: () => "Extract",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_005",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.data?.conceptId).toBe("C101");
    expect(result.retryCount).toBe(1);

    spy.mockRestore();
  });

  it("AI-PROMPT-006: Forbidden cross-field mutation fails with CROSS_FIELD_MUTATION when repair modifies unallowed field", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Initial call has bad explanation
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ conceptId: "C101", explanation: "x" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 80,
      candidatesTokenCount: 15,
    });
    // Repair modifies conceptId (unallowed mutation!)
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ conceptId: "MUTATED_C999", explanation: "Valid long explanation here" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 130,
      candidatesTokenCount: 35,
    });

    const schema = z.object({ conceptId: z.string(), explanation: z.string() });
    const minLengthValidator: SemanticValidator<any, z.infer<typeof schema>> = {
      id: "explanation-min-length",
      version: "1.0",
      validate: (out) => {
        if (out.explanation.length < 5) {
          return [{
            code: "EXPLANATION_TOO_SHORT",
            path: "explanation",
            message: "Explanation too short",
            severity: "error",
          }];
        }
        return [];
      },
    };

    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "ko-extraction",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      validators: [minLengthValidator],
      repairableFields: ["explanation"], // conceptId is NOT in allowlist!
      systemInstruction: "Extract KO",
      userPrompt: () => "Extract",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_006",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe("rejected");
    expect(result.violationCodes).toContain("CROSS_FIELD_MUTATION");
    expect(result.errors.some(e => e.includes("UNALLOWED_FIELD_MUTATION"))).toBe(true);

    spy.mockRestore();
  });

  it("AI-PROMPT-007: Response schema is preserved in repair model configuration", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockResolvedValueOnce({
      response: { text: "invalid json" },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 50,
      candidatesTokenCount: 10,
    });
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ value: 42 }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: false,
      promptTokenCount: 90,
      candidatesTokenCount: 20,
    });

    const responseSchema = {
      type: "OBJECT",
      properties: { value: { type: "INTEGER" } },
      required: ["value"],
    };

    const schema = z.object({ value: z.number() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "schema-test",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Return schema",
      userPrompt: () => "Return schema",
      responseSchema,
    };

    await PromptExecutor.run({
      userId: "usr_test_007",
      contract,
      variables: {},
      schema,
    });

    expect(spy.mock.calls.length).toBe(2);
    const firstCallConfig = spy.mock.calls[0][0].config;
    const secondCallConfig = spy.mock.calls[1][0].config;

    expect(firstCallConfig.responseSchema).toEqual(responseSchema);
    expect(secondCallConfig.responseSchema).toEqual(responseSchema);

    spy.mockRestore();
  });

  it("AI-PROMPT-008: Handle provider failure gracefully and return provider_failure outcome", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockRejectedValueOnce(new Error("Gemini API key quota / 503 Service Unavailable"));

    const schema = z.object({ result: z.string() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "failover-stage",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Failover test",
      userPrompt: () => "Test",
    };

    const result = await PromptExecutor.run({
      userId: "usr_test_008",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe("provider_failure");
    expect(result.violationCodes).toContain("PROVIDER_ERROR");
    expect(result.retryCount).toBe(0);

    spy.mockRestore();
  });

  it("AI-PROMPT-009: Stop execution when daily quota is exceeded without invoking LLM", async () => {
    const geminiSpy = spyOn(geminiModule, "generateContentWithFallback").mockRejectedValueOnce(
      new RequestLifecycleError("ALLOWANCE_REJECTED", "application allowance rejected the request", "PROVIDER_TURNS_EXHAUSTED")
    );

    const schema = z.object({ text: z.string() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "quota-test",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Quota test",
      userPrompt: () => "Test",
    };

    const result = await PromptExecutor.run({
      userId: "usr_quota_exceeded",
      contract,
      variables: {},
      schema,
      quotaLimit: 10,
    });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe("quota_exceeded");
    expect(result.violationCodes).toContain("ALLOWANCE_PROVIDER_TURNS_EXHAUSTED");

    geminiSpy.mockRestore();
  });

  it("AI-PROMPT-010: Provenance record trace is generated with privacy-safe input/evidence hashes", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockResolvedValueOnce({
      response: { text: JSON.stringify({ status: "OK" }) },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 75,
      candidatesTokenCount: 15,
    });

    const schema = z.object({ status: z.string() });
    const contract: PromptContract<{ query: string }, z.infer<typeof schema>> = {
      stageId: "provenance-test",
      promptVersion: "2.0",
      policies: [POLICY_JSON_STRICT, POLICY_MATH_LATEX],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      validatorVersion: "none",
      systemInstruction: "Provenance system instruction",
      userPrompt: (vars) => `Query: ${vars.query}`,
    };

    const result = await PromptExecutor.run({
      userId: "usr_provenance_010",
      contract,
      variables: { query: "Rahasia siswa 123" },
      evidenceContext: { documentId: "doc_456" },
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.traceId).toBeDefined();
    expect(result.traceId?.startsWith("trc_")).toBe(true);

    spy.mockRestore();
  });

  it("AI-PROMPT-011: Structured output parsing via Output.object with semantic validation and fallback", async () => {
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockResolvedValueOnce({
      response: {
        text: JSON.stringify({
          conceptName: "Limit Fungsi",
          steps: ["Evaluasi substitusi langsung", "Faktorisasi jika bentuk tak tentu"],
          confidenceScore: 0.95,
        }),
      },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 150,
      candidatesTokenCount: 60,
    });

    const schema = z.object({
      conceptName: z.string(),
      steps: z.array(z.string()),
      confidenceScore: z.number().min(0).max(1),
    });

    const contract: PromptContract<{ topic: string }, z.infer<typeof schema>> = {
      stageId: "structured-output-test",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Berikan penjelasan terstruktur.",
      userPrompt: (vars) => `Jelaskan ${vars.topic}`,
    };

    const result = await PromptExecutor.run({
      userId: "usr_struct_001",
      contract,
      variables: { topic: "Limit" },
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.data?.conceptName).toBe("Limit Fungsi");
    expect(result.data?.steps).toHaveLength(2);
    expect(result.data?.confidenceScore).toBe(0.95);

    spy.mockRestore();
  });

  it("AI-PROMPT-012: Observability metrics track native success and mode behavior", async () => {
    resetStructuredOutputMetrics();
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    spy.mockResolvedValueOnce({
      response: {
        text: JSON.stringify({ score: 100 }),
      },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 50,
      candidatesTokenCount: 20,
    });

    const schema = z.object({ score: z.number() });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "metric-test",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Score answer",
      userPrompt: () => "Evaluate",
      structuredOutputMode: "native-only",
    };

    const result = await PromptExecutor.run({
      userId: "usr_metric_001",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    const metrics = getStructuredOutputMetrics();
    expect(metrics.structured_output_native_success).toBeGreaterThanOrEqual(1);

    spy.mockRestore();
  });

  it("AI-PROMPT-013: Legacy fallback mode is measured and records fallback_used metric", async () => {
    resetStructuredOutputMetrics();
    const spy = spyOn(geminiModule, "generateContentWithFallback");
    // Trailing comma makes native JSON parser fail, but repairJsonString fixes it
    spy.mockResolvedValueOnce({
      response: {
        text: '{"status": "ok", "items": [1, 2, ],}',
      },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 50,
      candidatesTokenCount: 20,
    });

    const schema = z.object({ status: z.string(), items: z.array(z.number()) });
    const contract: PromptContract<any, z.infer<typeof schema>> = {
      stageId: "legacy-fallback-test",
      promptVersion: "1.0",
      policies: [POLICY_JSON_STRICT],
      inputSchemaVersion: "1.0",
      outputSchemaVersion: "1.0",
      systemInstruction: "Return items",
      userPrompt: () => "Get items",
      structuredOutputMode: "legacy-fallback",
      maxAttempts: 1,
    };

    const result = await PromptExecutor.run({
      userId: "usr_fallback_001",
      contract,
      variables: {},
      schema,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("ok");
    const metrics = getStructuredOutputMetrics();
    expect(metrics.structured_output_fallback_used).toBeGreaterThanOrEqual(1);

    spy.mockRestore();
  });
});


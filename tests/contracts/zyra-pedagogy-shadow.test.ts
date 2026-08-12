import { describe, expect, it, spyOn } from "bun:test";

process.env.MOCK_GEMINI = "true";

import {
  boundedPedagogyShadowCaseCount,
  PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE,
  recordPedagogyShadowComparison,
  resolvePedagogyExecutionMode,
} from "@/lib/zyra/pedagogy/shadow";
import { PromptExecutor } from "@/lib/prompt-executor";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import * as geminiModule from "@/lib/gemini";
import { z } from "zod";

describe("Zyra pedagogy staging shadow", () => {
  it("uses the feature flag only for the normal primary path", () => {
    expect(resolvePedagogyExecutionMode({
      featureEnabled: false,
      environment: "development",
      userId: "student-1",
    })).toBe("legacy");
    expect(resolvePedagogyExecutionMode({
      featureEnabled: true,
      environment: "development",
      userId: "student-1",
    })).toBe("primary");
  });

  it("allows shadow mode only for the exact configured staging identity", () => {
    expect(resolvePedagogyExecutionMode({
      requestedMode: "shadow",
      featureEnabled: false,
      environment: "staging",
      configuredShadowUserId: "student-shadow",
      userId: "student-shadow",
    })).toBe("shadow");

    expect(() => resolvePedagogyExecutionMode({
      requestedMode: "shadow",
      featureEnabled: false,
      environment: "production",
      configuredShadowUserId: "student-shadow",
      userId: "student-shadow",
    })).toThrow("PEDAGOGY_SHADOW_STAGING_ONLY");

    expect(() => resolvePedagogyExecutionMode({
      requestedMode: "shadow",
      featureEnabled: false,
      environment: "staging",
      userId: "student-shadow",
    })).toThrow("PEDAGOGY_SHADOW_IDENTITY_NOT_CONFIGURED");

    expect(() => resolvePedagogyExecutionMode({
      requestedMode: "shadow",
      featureEnabled: false,
      environment: "staging",
      configuredShadowUserId: "student-shadow",
      userId: "another-student",
    })).toThrow("PEDAGOGY_SHADOW_IDENTITY_MISMATCH");
  });

  it("bounds the golden subset by the declared provider request cap", () => {
    expect(PEDAGOGY_SHADOW_PROVIDER_CALL_UPPER_BOUND_PER_CASE).toBe(7);
    expect(boundedPedagogyShadowCaseCount(40)).toBe(5);
    expect(boundedPedagogyShadowCaseCount(7)).toBe(1);
    expect(boundedPedagogyShadowCaseCount(6)).toBe(0);
    expect(() => boundedPedagogyShadowCaseCount(41)).toThrow(
      "PEDAGOGY_SHADOW_PROVIDER_BUDGET_INVALID",
    );
  });

  it("records only privacy-safe comparison metadata", async () => {
    const comparison = await recordPedagogyShadowComparison({
      runId: "plan007-test",
      caseId: "case-01",
      courseId: "private-course-id",
      baselineOutcome: "success",
      candidateOutcome: "generated",
      selectedState: "explain",
      hintLevel: "none",
      candidateUsedFallback: false,
      candidateViolationCodes: [],
      evidenceIds: ["private-source-id"],
      latencyMs: 25,
    });

    const serialized = JSON.stringify(comparison);
    expect(comparison.visibleResponse).toBe("legacy");
    expect(comparison.providerCallUpperBound).toBe(7);
    expect(comparison.traceId).toMatch(/^trc_/);
    expect(serialized).not.toContain("private-course-id");
    expect(serialized).not.toContain("private-source-id");
  });

  it("prevents a hidden legacy repair call in shadow mode", async () => {
    const previousAllowance = process.env.FEATURE_ZYRA_ALLOWANCE_V2;
    process.env.FEATURE_ZYRA_ALLOWANCE_V2 = "0";
    const budgetSpy = spyOn(UsageBudgetService, "canUseFeature").mockResolvedValueOnce(true);
    const providerSpy = spyOn(geminiModule, "generateContentWithFallback").mockResolvedValueOnce({
      response: { text: "{ malformed json content ... }" },
      modelUsed: "gemini-2.5-flash",
      viaGateway: true,
      promptTokenCount: 80,
      candidatesTokenCount: 20,
    });

    try {
      const result = await PromptExecutor.run({
        userId: "usr_shadow_001",
        prompt: {
          version: "tutor_rag/grounded_answer/v1.7.0",
          systemInstruction: "Return JSON.",
          userPrompt: () => "Return one object.",
        },
        variables: {},
        schema: z.object({ answer: z.string() }),
        maxAttempts: 1,
      });

      expect(result.success).toBe(false);
      expect(result.outcome).toBe("rejected");
      expect(result.retryCount).toBe(0);
      expect(providerSpy).toHaveBeenCalledTimes(1);
    } finally {
      budgetSpy.mockRestore();
      providerSpy.mockRestore();
      if (previousAllowance === undefined) delete process.env.FEATURE_ZYRA_ALLOWANCE_V2;
      else process.env.FEATURE_ZYRA_ALLOWANCE_V2 = previousAllowance;
    }
  });
});

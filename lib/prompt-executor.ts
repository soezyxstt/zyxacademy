import { generateContentWithFallback } from "@/lib/gemini";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { z } from "zod";
import { repairJsonString } from "./ko-utils";

export interface SystemPrompt<TVars> {
  version: string;
  systemInstruction: string;
  userPrompt: (vars: TVars) => string;
  responseSchema?: any;
}

export class PromptExecutor {
  /**
   * Executes a system prompt with variables, validates JSON output using a Zod schema,
   * runs a 1x repair loop on validation failure, checks daily usage quota, and logs usage events.
   */
  static async run<TVars, TOutput>(params: {
    userId: string;
    prompt: SystemPrompt<TVars>;
    variables: TVars;
    schema: z.ZodType<TOutput>;
    quotaLimit?: number;
    useCase?: string;
  }): Promise<{ success: boolean; data?: TOutput; errors: string[] }> {
    // 1. Check Usage Quota Guardrail
    const canUse = await UsageBudgetService.canUseFeature(params.userId, params.quotaLimit ?? 30);
    if (!canUse) {
      return {
        success: false,
        errors: ["DAILY_QUOTA_EXCEEDED: You have exhausted your daily limit of AI operations. Please try again tomorrow."],
      };
    }

    const feature = params.prompt.version.split("/")[0] || "unknown";
    const userInstruction = params.prompt.userPrompt(params.variables);

    const modelConfig: any = {
      systemInstruction: params.prompt.systemInstruction,
      responseMimeType: "application/json",
    };

    if (params.prompt.responseSchema) {
      modelConfig.responseSchema = params.prompt.responseSchema;
    }

    let modelUsedName = "mock-model";
    let rawText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      // 2. Invoke AI Router via fallback wrapper with use case routing
      const result = await generateContentWithFallback({
        contents: userInstruction,
        config: modelConfig,
        useCase: params.useCase,
      });

      modelUsedName = result.modelUsed;
      rawText = result.response.text || "";
      inputTokens = result.promptTokenCount ?? 0;
      outputTokens = result.candidatesTokenCount ?? 0;
    } catch (err: any) {
      return {
        success: false,
        errors: [`Gemini generation failed: ${err?.message || err}`],
      };
    }

    if (!rawText.trim()) {
      return {
        success: false,
        errors: ["Gemini returned empty text response"],
      };
    }

    // 3. Attempt JSON parse and Zod validation
    let candidateJSON: any = null;
    try {
      const cleanJSON = repairJsonString(rawText);
      candidateJSON = JSON.parse(cleanJSON);
    } catch (err: any) {
      return await this.repair(params, rawText, `JSON parse error: ${err.message}`, modelUsedName);
    }

    const zodResult = params.schema.safeParse(candidateJSON);
    if (zodResult.success) {
      // 4. Record Usage and Return Validated Result
      await UsageBudgetService.recordUsage({
        userId: params.userId,
        feature,
        model: modelUsedName,
        tokens: inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        requestType: params.prompt.version,
      });

      return {
        success: true,
        data: zodResult.data,
        errors: [],
      };
    }
    const zodErrorMsg = zodResult.error.issues.map(e => `[${e.path.join(".")}]: ${e.message}`).join("; ");
    return await this.repair(params, rawText, zodErrorMsg, modelUsedName);
  }

  /**
   * Runs the 1x self-repair check by feeding schema errors back to the LLM.
   */
  private static async repair<TVars, TOutput>(
    params: {
      userId: string;
      prompt: SystemPrompt<TVars>;
      variables: TVars;
      schema: z.ZodType<TOutput>;
      useCase?: string;
    },
    badText: string,
    validationError: string,
    originalModel: string
  ): Promise<{ success: boolean; data?: TOutput; errors: string[] }> {
    console.warn(`[Prompt Executor] Schema validation failed. Starting repair. Error: ${validationError}`);

    const repairPrompt = `The previous response was invalid and failed schema validation.
Original Prompt Context:
${params.prompt.userPrompt(params.variables)}

YOUR INVALID RESPONSE WAS:
${badText}

THE SPECIFIC VALIDATION ERRORS ARE:
${validationError}

Please output a corrected, fully compliant JSON object matching the requested schema.`;

    const modelConfig: any = {
      systemInstruction: params.prompt.systemInstruction,
      responseMimeType: "application/json",
    };

    let modelUsedName = originalModel;
    let rawText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const result = await generateContentWithFallback({
        contents: repairPrompt,
        config: modelConfig,
        useCase: params.useCase,
      });

      modelUsedName = result.modelUsed;
      rawText = result.response.text || "";
      inputTokens = result.promptTokenCount ?? 0;
      outputTokens = result.candidatesTokenCount ?? 0;
    } catch (err: any) {
      return {
        success: false,
        errors: [`Gemini repair generation failed: ${err?.message || err}`, validationError],
      };
    }

    try {
      const cleanJSON = repairJsonString(rawText);
      const parsed = JSON.parse(cleanJSON);
      const validated = params.schema.parse(parsed);

      const feature = params.prompt.version.split("/")[0] || "unknown";
      await UsageBudgetService.recordUsage({
        userId: params.userId,
        feature,
        model: modelUsedName,
        tokens: inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        requestType: `${params.prompt.version}:repaired`,
      });

      return {
        success: true,
        data: validated,
        errors: [],
      };
    } catch (err: any) {
      return {
        success: false,
        errors: [
          `Repair validation failed: ${err?.message || err}`,
          validationError,
        ],
      };
    }
  }
}

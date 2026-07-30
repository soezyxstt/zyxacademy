import { generateContentWithFallback } from "@/lib/gemini";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { z } from "zod";
import { repairJsonString } from "./ko-utils";
import { PromptContract } from "./ai/contracts";
import { composePolicies, POLICY_JSON_STRICT } from "./ai/policies";
import { runSemanticValidators, SemanticViolation } from "./ai/validation";
import { hashSanitizedInput, hashEvidence, recordGenerationTrace } from "./ai/provenance";

export interface SystemPrompt<TVars> {
  version: string;
  systemInstruction: string;
  userPrompt: (vars: TVars) => string;
  responseSchema?: any;
}

export type ExecutionOutcome =
  | 'success'
  | 'rejected'
  | 'quota_exceeded'
  | 'provider_failure'
  | 'invalid_contract';

export interface PromptExecutionResult<TOutput> {
  success: boolean;
  outcome: ExecutionOutcome;
  data?: TOutput;
  errors: string[];
  violationCodes: string[];
  retryCount: number;
  traceId?: string;
}

export interface RunParams<TVars, TOutput> {
  userId: string;
  prompt?: SystemPrompt<TVars>;
  contract?: PromptContract<TVars, TOutput>;
  variables: TVars;
  schema: z.ZodType<TOutput>;
  quotaLimit?: number;
  useCase?: string;
  evidenceContext?: Record<string, any>;
}

export class PromptExecutor {
  /**
   * Main entry point for executing AI prompts.
   * Supports both legacy `SystemPrompt` structures and versioned `PromptContract` boundaries.
   */
  static async run<TVars, TOutput>(
    params: RunParams<TVars, TOutput>
  ): Promise<PromptExecutionResult<TOutput>> {
    // 1. Normalize parameters into a typed PromptContract
    let contract: PromptContract<TVars, TOutput>;

    if (params.contract) {
      contract = params.contract;
    } else if (params.prompt) {
      const parts = params.prompt.version.split("/");
      contract = {
        stageId: parts[0] || "unknown",
        promptVersion: parts[1] || "1.0",
        policies: [POLICY_JSON_STRICT],
        inputSchemaVersion: "1.0",
        outputSchemaVersion: "1.0",
        validatorVersion: "none",
        systemInstruction: params.prompt.systemInstruction,
        userPrompt: params.prompt.userPrompt,
        responseSchema: params.prompt.responseSchema,
        useCase: params.useCase,
      };
    } else {
      return {
        success: false,
        outcome: "invalid_contract",
        errors: ["Neither prompt nor contract provided"],
        violationCodes: ["INVALID_CONTRACT"],
        retryCount: 0,
      };
    }

    return await this.executeContract(params.userId, contract, params.variables, params.schema, {
      quotaLimit: params.quotaLimit,
      evidenceContext: params.evidenceContext,
    });
  }

  /**
   * Executes a typed PromptContract with policy composition, semantic validation,
   * bounded field-level repair, and privacy-safe provenance tracing.
   */
  public static async executeContract<TVars, TOutput>(
    userId: string,
    contract: PromptContract<TVars, TOutput>,
    variables: TVars,
    schema: z.ZodType<TOutput>,
    options?: {
      quotaLimit?: number;
      evidenceContext?: Record<string, any>;
    }
  ): Promise<PromptExecutionResult<TOutput>> {
    const t0 = Date.now();
    const violationCodes: string[] = [];
    const errors: string[] = [];

    // 2. Compose Policies and System Instruction
    const { composedText: policyText, combinedVersion: policyVersion } = composePolicies(
      contract.policies || [],
      { isMachineOnly: contract.isMachineOnly }
    );

    const baseSysInst =
      typeof contract.systemInstruction === "function"
        ? contract.systemInstruction(variables)
        : contract.systemInstruction;

    const systemInstruction = policyText ? `${baseSysInst}\n\n[POLICIES]\n${policyText}` : baseSysInst;

    // 3. Compute Privacy-Safe Provenance Hashes
    const sanitizedInputHash = hashSanitizedInput(variables);
    const evidenceHash = hashEvidence(options?.evidenceContext);

    // 4. Check Usage Quota Guardrail
    const canUse = await UsageBudgetService.canUseFeature(userId, options?.quotaLimit ?? 30);
    if (!canUse) {
      const quotaError = "DAILY_QUOTA_EXCEEDED: You have exhausted your daily limit of AI operations. Please try again tomorrow.";
      const traceId = await recordGenerationTrace({
        userId,
        useCase: contract.useCase,
        stageId: contract.stageId,
        promptVersion: contract.promptVersion,
        policyVersion,
        inputSchemaVersion: contract.inputSchemaVersion,
        outputSchemaVersion: contract.outputSchemaVersion,
        validatorVersion: contract.validatorVersion || "none",
        sanitizedInputHash,
        evidenceHash,
        model: "none",
        inputTokens: 0,
        outputTokens: 0,
        retryCount: 0,
        terminalOutcome: "quota_exceeded",
        violationCodes: ["DAILY_QUOTA_EXCEEDED"],
        latencyMs: Date.now() - t0,
      });

      return {
        success: false,
        outcome: "quota_exceeded",
        errors: [quotaError],
        violationCodes: ["DAILY_QUOTA_EXCEEDED"],
        retryCount: 0,
        traceId,
      };
    }

    const userInstruction = contract.userPrompt(variables);
    const modelConfig: any = {
      systemInstruction,
      responseMimeType: "application/json",
    };
    if (contract.responseSchema) {
      modelConfig.responseSchema = contract.responseSchema;
    }

    let modelUsedName = "mock-model";
    let rawText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    // 5. Initial AI Router Execution
    try {
      const result = await generateContentWithFallback({
        contents: userInstruction,
        config: modelConfig,
        useCase: contract.useCase,
      });

      modelUsedName = result.modelUsed;
      rawText = result.response?.text || "";
      inputTokens = result.promptTokenCount ?? 0;
      outputTokens = result.candidatesTokenCount ?? 0;
    } catch (err: any) {
      const providerError = `Gemini generation failed: ${err?.message || err}`;
      const traceId = await recordGenerationTrace({
        userId,
        useCase: contract.useCase,
        stageId: contract.stageId,
        promptVersion: contract.promptVersion,
        policyVersion,
        inputSchemaVersion: contract.inputSchemaVersion,
        outputSchemaVersion: contract.outputSchemaVersion,
        validatorVersion: contract.validatorVersion || "none",
        sanitizedInputHash,
        evidenceHash,
        model: "unknown",
        inputTokens: 0,
        outputTokens: 0,
        retryCount: 0,
        terminalOutcome: "provider_failure",
        violationCodes: ["PROVIDER_ERROR"],
        latencyMs: Date.now() - t0,
      });

      return {
        success: false,
        outcome: "provider_failure",
        errors: [providerError],
        violationCodes: ["PROVIDER_ERROR"],
        retryCount: 0,
        traceId,
      };
    }

    if (!rawText.trim()) {
      const emptyError = "Gemini returned empty text response";
      const traceId = await recordGenerationTrace({
        userId,
        useCase: contract.useCase,
        stageId: contract.stageId,
        promptVersion: contract.promptVersion,
        policyVersion,
        inputSchemaVersion: contract.inputSchemaVersion,
        outputSchemaVersion: contract.outputSchemaVersion,
        validatorVersion: contract.validatorVersion || "none",
        sanitizedInputHash,
        evidenceHash,
        model: modelUsedName,
        inputTokens,
        outputTokens,
        retryCount: 0,
        terminalOutcome: "provider_failure",
        violationCodes: ["EMPTY_RESPONSE"],
        latencyMs: Date.now() - t0,
      });

      return {
        success: false,
        outcome: "provider_failure",
        errors: [emptyError],
        violationCodes: ["EMPTY_RESPONSE"],
        retryCount: 0,
        traceId,
      };
    }

    // 6. Initial Parse & Validation (JSON + Zod + Semantic)
    let candidateJSON: any = null;
    let jsonParseOk = false;

    try {
      const cleanJSON = repairJsonString(rawText);
      candidateJSON = JSON.parse(cleanJSON);
      jsonParseOk = true;
    } catch (err: any) {
      violationCodes.push("JSON_PARSE_ERROR");
      errors.push(`JSON parse error: ${err.message}`);
    }

    let zodData: TOutput | undefined;
    if (jsonParseOk) {
      const zodResult = schema.safeParse(candidateJSON);
      if (zodResult.success) {
        zodData = zodResult.data;
      } else {
        violationCodes.push("ZOD_SCHEMA_MISMATCH");
        const zodErrorMsg = zodResult.error.issues
          .map((e) => `[${e.path.join(".")}]: ${e.message}`)
          .join("; ");
        errors.push(zodErrorMsg);
      }
    }

    let semanticViolations: SemanticViolation[] = [];
    let validatorVersion = contract.validatorVersion || "none";
    if (zodData) {
      const semResult = await runSemanticValidators(contract.validators, zodData, {
        input: variables,
        trustedContext: options?.evidenceContext,
      });
      validatorVersion = semResult.combinedVersion;

      if (!semResult.valid) {
        semanticViolations = semResult.violations;
        for (const v of semanticViolations) {
          if (v.severity === "error") {
            violationCodes.push(v.code);
            errors.push(`[${v.path}]: ${v.message}`);
          }
        }
      }
    }

    // 7. Check if Initial Output is Valid
    if (errors.length === 0 && zodData !== undefined) {
      await UsageBudgetService.recordUsage({
        userId,
        feature: contract.stageId,
        model: modelUsedName,
        tokens: inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        requestType: `${contract.stageId}:${contract.promptVersion}`,
      });

      const traceId = await recordGenerationTrace({
        userId,
        useCase: contract.useCase,
        stageId: contract.stageId,
        promptVersion: contract.promptVersion,
        policyVersion,
        inputSchemaVersion: contract.inputSchemaVersion,
        outputSchemaVersion: contract.outputSchemaVersion,
        validatorVersion,
        sanitizedInputHash,
        evidenceHash,
        model: modelUsedName,
        inputTokens,
        outputTokens,
        retryCount: 0,
        terminalOutcome: "success",
        latencyMs: Date.now() - t0,
      });

      return {
        success: true,
        outcome: "success",
        data: zodData,
        errors: [],
        violationCodes: [],
        retryCount: 0,
        traceId,
      };
    }

    // 8. Bounded Self-Repair Loop
    const maxRepairs = contract.maxAttempts !== undefined ? Math.max(0, contract.maxAttempts - 1) : 1;
    if (maxRepairs <= 0) {
      const traceId = await recordGenerationTrace({
        userId,
        useCase: contract.useCase,
        stageId: contract.stageId,
        promptVersion: contract.promptVersion,
        policyVersion,
        inputSchemaVersion: contract.inputSchemaVersion,
        outputSchemaVersion: contract.outputSchemaVersion,
        validatorVersion,
        sanitizedInputHash,
        evidenceHash,
        model: modelUsedName,
        inputTokens,
        outputTokens,
        retryCount: 0,
        terminalOutcome: "rejected",
        violationCodes,
        latencyMs: Date.now() - t0,
      });

      return {
        success: false,
        outcome: "rejected",
        errors,
        violationCodes,
        retryCount: 0,
        traceId,
      };
    }

    // Perform 1x Bounded Repair
    return await this.performBoundedRepair({
      userId,
      contract,
      variables,
      schema,
      originalModel: modelUsedName,
      badText: rawText,
      candidateJSON,
      initialErrors: errors,
      initialViolationCodes: violationCodes,
      initialInputTokens: inputTokens,
      initialOutputTokens: outputTokens,
      policyVersion,
      validatorVersion,
      sanitizedInputHash,
      evidenceHash,
      t0,
      evidenceContext: options?.evidenceContext,
    });
  }

  /**
   * Performs bounded self-repair by feeding specific error codes, allowed field paths,
   * and previous output to the LLM, preserving the native response schema.
   */
  private static async performBoundedRepair<TVars, TOutput>(params: {
    userId: string;
    contract: PromptContract<TVars, TOutput>;
    variables: TVars;
    schema: z.ZodType<TOutput>;
    originalModel: string;
    badText: string;
    candidateJSON: any;
    initialErrors: string[];
    initialViolationCodes: string[];
    initialInputTokens: number;
    initialOutputTokens: number;
    policyVersion: string;
    validatorVersion: string;
    sanitizedInputHash: string;
    evidenceHash?: string;
    t0: number;
    evidenceContext?: Record<string, any>;
  }): Promise<PromptExecutionResult<TOutput>> {
    const repairableFields = params.contract.repairableFields;
    if (repairableFields !== undefined && repairableFields.length === 0) {
      console.warn(`[PromptExecutor] Repair rejected for stage "${params.contract.stageId}": empty repairableFields allowlist`);
      return {
        success: false,
        outcome: "rejected",
        errors: [...params.initialErrors, "Unbounded repair disallowed when repairableFields is empty"],
        violationCodes: [...new Set([...params.initialViolationCodes, "UNBOUNDED_REPAIR_DISALLOWED"])],
        retryCount: 0,
      };
    }

    const allowedFieldsStr = repairableFields && repairableFields.length > 0 ? repairableFields.join(", ") : "All invalid fields";

    const repairPrompt = `[BOUNDED REPAIR REQUEST]
The previous output produced validation errors. Correct ONLY the invalid fields specified below.

Allowed Repairable Fields: ${allowedFieldsStr}

Violation Codes:
${params.initialViolationCodes.map((c) => `- ${c}`).join("\n")}

Validation Errors:
${params.initialErrors.map((e) => `- ${e}`).join("\n")}

Previous Response:
${params.badText}

Instructions:
1. Fix ONLY the validation errors listed above.
2. Do NOT change values of fields outside the allowed repairable fields list.
3. Return a complete, valid JSON object matching the requested schema.`;

    const { composedText: policyText } = composePolicies(
      params.contract.policies || [],
      { isMachineOnly: params.contract.isMachineOnly }
    );
    const baseSysInst =
      typeof params.contract.systemInstruction === "function"
        ? params.contract.systemInstruction(params.variables)
        : params.contract.systemInstruction;
    const systemInstruction = policyText ? `${baseSysInst}\n\n[POLICIES]\n${policyText}` : baseSysInst;

    const modelConfig: any = {
      systemInstruction,
      responseMimeType: "application/json",
    };
    // Preserve original response schema on repair!
    if (params.contract.responseSchema) {
      modelConfig.responseSchema = params.contract.responseSchema;
    }

    let repairModelUsed = params.originalModel;
    let repairText = "";
    let repairInputTokens = 0;
    let repairOutputTokens = 0;

    try {
      const result = await generateContentWithFallback({
        contents: repairPrompt,
        config: modelConfig,
        useCase: params.contract.useCase,
      });

      repairModelUsed = result.modelUsed;
      repairText = result.response?.text || "";
      repairInputTokens = result.promptTokenCount ?? 0;
      repairOutputTokens = result.candidatesTokenCount ?? 0;
    } catch (err: any) {
      const repairErr = `Gemini repair generation failed: ${err?.message || err}`;
      const cumulativeInputTokens = params.initialInputTokens + repairInputTokens;
      const cumulativeOutputTokens = params.initialOutputTokens + repairOutputTokens;

      const traceId = await recordGenerationTrace({
        userId: params.userId,
        useCase: params.contract.useCase,
        stageId: params.contract.stageId,
        promptVersion: params.contract.promptVersion,
        policyVersion: params.policyVersion,
        inputSchemaVersion: params.contract.inputSchemaVersion,
        outputSchemaVersion: params.contract.outputSchemaVersion,
        validatorVersion: params.validatorVersion,
        sanitizedInputHash: params.sanitizedInputHash,
        evidenceHash: params.evidenceHash,
        model: repairModelUsed,
        inputTokens: cumulativeInputTokens,
        outputTokens: cumulativeOutputTokens,
        retryCount: 1,
        terminalOutcome: "provider_failure",
        violationCodes: [...params.initialViolationCodes, "PROVIDER_ERROR"],
        latencyMs: Date.now() - params.t0,
      });

      return {
        success: false,
        outcome: "provider_failure",
        errors: [...params.initialErrors, repairErr],
        violationCodes: [...params.initialViolationCodes, "PROVIDER_ERROR"],
        retryCount: 1,
        traceId,
      };
    }

    const cumulativeInputTokens = params.initialInputTokens + repairInputTokens;
    const cumulativeOutputTokens = params.initialOutputTokens + repairOutputTokens;

    // Parse & validate repaired response
    let repairedJSON: any = null;
    let repairJsonOk = false;
    const repairViolationCodes: string[] = [];
    const repairErrors: string[] = [];

    try {
      const cleanJSON = repairJsonString(repairText);
      repairedJSON = JSON.parse(cleanJSON);
      repairJsonOk = true;
    } catch (err: any) {
      repairViolationCodes.push("JSON_PARSE_ERROR");
      repairErrors.push(`Repair JSON parse error: ${err.message}`);
    }

    // Check for forbidden cross-field mutations
    if (
      repairJsonOk &&
      params.candidateJSON &&
      repairableFields &&
      repairableFields.length > 0
    ) {
      const unallowedMutation = this.detectCrossFieldMutation(
        params.candidateJSON,
        repairedJSON,
        repairableFields
      );
      if (unallowedMutation) {
        repairViolationCodes.push("CROSS_FIELD_MUTATION");
        repairErrors.push(
          `UNALLOWED_FIELD_MUTATION: Repair modified fields outside allowlist: ${unallowedMutation}`
        );
      }
    }

    let repairedData: TOutput | undefined;
    if (repairJsonOk && repairErrors.length === 0) {
      const zodResult = params.schema.safeParse(repairedJSON);
      if (zodResult.success) {
        repairedData = zodResult.data;
      } else {
        repairViolationCodes.push("ZOD_SCHEMA_MISMATCH");
        const zodMsg = zodResult.error.issues
          .map((e) => `[${e.path.join(".")}]: ${e.message}`)
          .join("; ");
        repairErrors.push(`Repair schema validation failed: ${zodMsg}`);
      }
    }

    if (repairedData !== undefined && repairErrors.length === 0) {
      const semResult = await runSemanticValidators(
        params.contract.validators,
        repairedData,
        {
          input: params.variables,
          trustedContext: params.evidenceContext,
        }
      );

      if (!semResult.valid) {
        for (const v of semResult.violations) {
          if (v.severity === "error") {
            repairViolationCodes.push(v.code);
            repairErrors.push(`[${v.path}]: ${v.message}`);
          }
        }
      }
    }

    if (repairedData !== undefined && repairErrors.length === 0) {
      await UsageBudgetService.recordUsage({
        userId: params.userId,
        feature: params.contract.stageId,
        model: repairModelUsed,
        tokens: cumulativeInputTokens + cumulativeOutputTokens,
        inputTokens: cumulativeInputTokens,
        outputTokens: cumulativeOutputTokens,
        requestType: `${params.contract.stageId}:${params.contract.promptVersion}:repaired`,
      });

      const traceId = await recordGenerationTrace({
        userId: params.userId,
        useCase: params.contract.useCase,
        stageId: params.contract.stageId,
        promptVersion: params.contract.promptVersion,
        policyVersion: params.policyVersion,
        inputSchemaVersion: params.contract.inputSchemaVersion,
        outputSchemaVersion: params.contract.outputSchemaVersion,
        validatorVersion: params.validatorVersion,
        sanitizedInputHash: params.sanitizedInputHash,
        evidenceHash: params.evidenceHash,
        model: repairModelUsed,
        inputTokens: cumulativeInputTokens,
        outputTokens: cumulativeOutputTokens,
        retryCount: 1,
        terminalOutcome: "success",
        latencyMs: Date.now() - params.t0,
      });

      return {
        success: true,
        outcome: "success",
        data: repairedData,
        errors: [],
        violationCodes: [],
        retryCount: 1,
        traceId,
      };
    }

    // Terminal rejection after repair attempt
    const finalViolationCodes = [...new Set([...params.initialViolationCodes, ...repairViolationCodes])];
    const traceId = await recordGenerationTrace({
      userId: params.userId,
      useCase: params.contract.useCase,
      stageId: params.contract.stageId,
      promptVersion: params.contract.promptVersion,
      policyVersion: params.policyVersion,
      inputSchemaVersion: params.contract.inputSchemaVersion,
      outputSchemaVersion: params.contract.outputSchemaVersion,
      validatorVersion: params.validatorVersion,
      sanitizedInputHash: params.sanitizedInputHash,
      evidenceHash: params.evidenceHash,
      model: repairModelUsed,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      retryCount: 1,
      terminalOutcome: "rejected",
      violationCodes: finalViolationCodes,
      latencyMs: Date.now() - params.t0,
    });

    return {
      success: false,
      outcome: "rejected",
      errors: [...params.initialErrors, ...repairErrors],
      violationCodes: finalViolationCodes,
      retryCount: 1,
      traceId,
    };
  }

  /**
   * Compares candidate (before) JSON and repaired JSON to verify no fields outside
   * the repairable allowlist were modified. Returns path of violated field or null if valid.
   */
  private static detectCrossFieldMutation(
    original: any,
    repaired: any,
    allowlist: string[]
  ): string | null {
    if (typeof original !== "object" || original === null || typeof repaired !== "object" || repaired === null) {
      return null;
    }

    const allKeys = new Set([...Object.keys(original), ...Object.keys(repaired)]);

    for (const key of allKeys) {
      const isAllowed = allowlist.some(
        (field) => field === key || field.startsWith(`${key}.`) || field.startsWith(`${key}[`)
      );

      if (!isAllowed) {
        const origVal = JSON.stringify(original[key]);
        const repVal = JSON.stringify(repaired[key]);
        if (origVal !== repVal) {
          return key;
        }
      }
    }

    return null;
  }
}

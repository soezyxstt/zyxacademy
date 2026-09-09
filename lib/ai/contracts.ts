/**
 * Prompt Contract definitions and version metadata interfaces.
 */

import { PolicyFragment } from './policies';
import { SemanticValidator } from './validation';

export interface PromptContract<TVars = any, TOutput = any> {
  /** Unique stage identifier (e.g. 'tutor-explanation', 'ko-extraction') */
  stageId: string;
  /** Stage prompt version (e.g. '1.0') */
  promptVersion: string;
  /** If true, student-facing voice/style policies are omitted */
  isMachineOnly?: boolean;
  /** Composable policy fragments */
  policies: PolicyFragment[];
  /** Version of input variables schema */
  inputSchemaVersion: string;
  /** Version of output JSON schema */
  outputSchemaVersion: string;
  /** Semantic validators to run after schema validation */
  validators?: SemanticValidator<TVars, TOutput>[];
  /** Combined version of semantic validators */
  validatorVersion?: string;
  /** Allowlist of dot-path fields permitted to be modified during self-repair */
  repairableFields?: string[];
  /** Maximum total attempts (1 initial + max repairs). Default: 2 (1 repair allowed) */
  maxAttempts?: number;
  /** Identity for model routing configuration */
  useCase?: string;
  /** Whether generated output is suitable for shared KV caching */
  allowSharedCache?: boolean;
  /** System instruction template or generator */
  systemInstruction: string | ((vars: TVars) => string);
  /** User prompt generator function */
  userPrompt: (vars: TVars) => string;
  /** Native Gemini / OpenAPI response schema */
  responseSchema?: any;
  /**
   * Mode for structured output parsing.
   * 'native-only': AI SDK Output.object only (strict).
   * 'legacy-fallback': AI SDK Output.object first, falling back to json repair and schema.safeParse.
   * Defaults to 'native-only'.
   */
  structuredOutputMode?: "native-only" | "legacy-fallback";
}

/**
 * Computes the full contract version string for logging and provenance.
 */
export function getContractVersionString<TVars, TOutput>(
  contract: PromptContract<TVars, TOutput>
): string {
  const policyVers = contract.policies.map((p) => `${p.id}@${p.version}`).join('+') || 'none';
  const valVers = contract.validatorVersion || (contract.validators?.map((v) => `${v.id}@${v.version}`).join('+') || 'none');
  return `${contract.stageId}:${contract.promptVersion} [p:${policyVers} in:${contract.inputSchemaVersion} out:${contract.outputSchemaVersion} v:${valVers}]`;
}

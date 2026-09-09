import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import type {
  OpsAiToolClass,
  OpsAiToolSecurityClassification,
  OpsAiCitation,
  OpsAiActionProposalV2,
} from "./contracts";
import type {
  AdminKnowledgeChunk,
  AdminKnowledgeSourceRecord,
} from "./admin-knowledge-contracts";
import type { CanonicalVectorProvider } from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export interface OpsAiToolContext {
  readonly callerRole?: string;
  readonly actorId?: string;
  readonly isModelCall?: boolean;
  readonly vectorProvider?: CanonicalVectorProvider;
  readonly embeddingAdapter?: CanonicalContentV2EmbeddingAdapter;
  readonly mockHydrationCatalog?: {
    sources: AdminKnowledgeSourceRecord[];
    chunks: AdminKnowledgeChunk[];
  };
  readonly includeRedactedEmail?: boolean;
  readonly runId?: string;
  readonly stepId?: string;
  readonly toolCallId?: string;
}

export interface OpsToolSecurityConfig {
  readonly toolClass: OpsAiToolClass;
  readonly isModelCallable: boolean;
  readonly requiredRole?: "admin" | "superadmin";
  readonly requiresHumanConfirmation?: boolean;
  readonly allowsMutation?: boolean;
}

export interface OpsAiToolExecutionResult {
  summary: string;
  data?: unknown;
  citations?: OpsAiCitation[];
  proposal?: OpsAiActionProposalV2;
}

export interface OpsToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TInput;
  readonly security: OpsToolSecurityConfig;
  readonly execute: (
    input: z.infer<TInput>,
    context?: OpsAiToolContext
  ) => Promise<OpsAiToolExecutionResult>;
  toAiSdkTool: (context?: OpsAiToolContext) => Tool;
  toSecurityClassification: () => OpsAiToolSecurityClassification;
}

// ============================================================================
// 2. defineOpsTool Factory
// ============================================================================

/**
 * Declares a single authoritative descriptor for an Ops AI tool.
 * Provides unified schema, security classification, and execution dispatching.
 */
export function defineOpsTool<TInput extends z.ZodTypeAny>(config: {
  name: string;
  description: string;
  inputSchema: TInput;
  security: OpsToolSecurityConfig;
  execute: (
    input: z.infer<TInput>,
    context?: OpsAiToolContext
  ) => Promise<OpsAiToolExecutionResult>;
}): OpsToolDefinition<TInput> {
  const requiresConfirmation =
    config.security.requiresHumanConfirmation ??
    (config.security.toolClass !== "read-only" && config.security.toolClass !== "retrieval");

  const allowsMutation =
    config.security.allowsMutation ??
    (config.security.toolClass === "autonomous-mutation" ||
      config.security.toolClass === "confirmation-executor");

  const definition: OpsToolDefinition<TInput> = {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    security: {
      ...config.security,
      requiredRole: config.security.requiredRole ?? "admin",
      requiresHumanConfirmation: requiresConfirmation,
      allowsMutation,
    },
    execute: config.execute,
    toAiSdkTool: (context?: OpsAiToolContext) => {
      return aiTool({
        description: config.description,
        inputSchema: config.inputSchema,
        execute: async (args: z.infer<TInput>) => {
          return config.execute(args, { ...context, isModelCall: true });
        },
      });
    },
    toSecurityClassification: (): OpsAiToolSecurityClassification => ({
      name: config.name,
      description: config.description,
      toolClass: config.security.toolClass,
      isModelCallable: config.security.isModelCallable,
      requiredRole: config.security.requiredRole ?? "admin",
      requiresHumanConfirmation: requiresConfirmation,
      allowsMutation,
    }),
  };

  return definition;
}

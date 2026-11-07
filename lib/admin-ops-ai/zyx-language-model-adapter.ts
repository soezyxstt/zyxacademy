import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Content,
} from "@ai-sdk/provider";
import { MODEL_IDS, type ModelId } from "@/lib/ai/provider/model-registry";
import { configuredModelChain } from "@/lib/ai/model-settings-store";
import {
  getOpsAiModelStreamMock,
  streamOpsAiModel,
  type OpsAiModelMessage,
  type OpsAiModelStreamProvider,
  type OpsAiModelToolDeclaration,
} from "./model-factory";
import { OPS_AI_POLICY_BOUNDS } from "./contracts";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { recordZyraOperationalEventSafe } from "@/lib/zyra/ops/telemetry";
import { randomUUID } from "node:crypto";

// ============================================================================
// 1. Zyx Language Model Adapter Implementation
// ============================================================================

export interface ZyxLanguageModelOptions {
  modelId?: string;
  actorId?: string;
  feature?: string;
  resolveModelChain?: typeof configuredModelChain;
  streamMock?: OpsAiModelStreamProvider | null;
}

/**
 * Adapter that connects AI SDK LanguageModelV3 to Zyx Gemini Provider infrastructure.
 * Integrates directly with RequestLifecycle, allowance reservation, CF AI Gateway, and circuit breaker.
 */
export class ZyxLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "zyx-gemini";
  readonly modelId: string;
  readonly actorId?: string;
  readonly feature: string;
  readonly supportedUrls = {};
  private readonly explicitModelId?: string;
  private readonly resolveModelChain: typeof configuredModelChain;
  private readonly streamMock: OpsAiModelStreamProvider | null;

  constructor(modelOrOptions?: string | ZyxLanguageModelOptions) {
    if (typeof modelOrOptions === "string") {
      this.explicitModelId = modelOrOptions;
      this.modelId = modelOrOptions;
      this.feature = "admin-ops-ai";
      this.resolveModelChain = configuredModelChain;
      this.streamMock = getOpsAiModelStreamMock();
    } else {
      this.explicitModelId = modelOrOptions?.modelId;
      this.modelId = modelOrOptions?.modelId || MODEL_IDS.stableFlash;
      this.actorId = modelOrOptions?.actorId;
      this.feature = modelOrOptions?.feature || "admin-ops-ai";
      this.resolveModelChain = modelOrOptions?.resolveModelChain ?? configuredModelChain;
      this.streamMock =
        modelOrOptions?.streamMock !== undefined
          ? modelOrOptions.streamMock
          : getOpsAiModelStreamMock();
    }
  }

  /**
   * Convert AI SDK V3 prompt messages to the lower-level Gemini-oriented Ops AI
   * protocol. Tool turns are deliberately normalized to model/functionCall followed
   * by user/functionResponse because that is the canonical Gemini conversation shape.
   */
  private convertPrompt(
    options: LanguageModelV3CallOptions
  ): {
    systemPrompt: string | undefined;
    messages: OpsAiModelMessage[];
    tools: OpsAiModelToolDeclaration[];
  } {
    let systemPrompt: string | undefined;
    const messages: OpsAiModelMessage[] = [];

    for (const msg of options.prompt) {
      if (msg.role === "system") {
        systemPrompt = msg.content;
      } else if (msg.role === "user") {
        let textContent = "";
        for (const part of msg.content) {
          if (part.type === "text") {
            textContent += part.text;
          }
        }
        messages.push({
          role: "user",
          content: textContent,
        });
      } else if (msg.role === "assistant") {
        const parts: Array<Record<string, unknown>> = [];
        let textContent = "";
        for (const part of msg.content) {
          if (part.type === "text") {
            textContent += part.text;
            parts.push({ text: part.text });
          } else if (part.type === "tool-call") {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = typeof part.input === "string"
                ? JSON.parse(part.input)
                : ((part.input as Record<string, unknown>) || {});
            } catch {
              parsedArgs = {};
            }
            parts.push({
              functionCall: {
                name: part.toolName,
                args: parsedArgs,
              },
            });
          }
        }
        messages.push({
          role: "model",
          content: textContent || undefined,
          parts: parts.length > 0 ? parts : undefined,
        });
      } else if (msg.role === "tool") {
        const parts: Array<Record<string, unknown>> = [];
        for (const part of msg.content) {
          if (part.type === "tool-result") {
            let outputVal: unknown = part.output;
            if (
              part.output &&
              typeof part.output === "object" &&
              "value" in (part.output as Record<string, unknown>)
            ) {
              outputVal = (part.output as Record<string, unknown>).value;
            }
            parts.push({
              functionResponse: {
                name: part.toolName,
                response: { output: outputVal },
              },
            });
          }
        }
        messages.push({
          role: "user",
          parts,
        });
      }
    }

    const tools: OpsAiModelToolDeclaration[] = [];
    if (options.tools) {
      for (const t of options.tools) {
        if (t.type === "function") {
          tools.push({
            name: t.name,
            description: t.description,
            parameters: (t.inputSchema ?? (t as any).parameters) as Record<string, unknown>,
          });
        }
      }
    }

    return { systemPrompt, messages, tools };
  }

  /**
   * Generates streaming output using Zyx model streaming pipeline.
   *
   * Retry belongs here rather than in the agent orchestrator. AI SDK can retry a
   * model call that fails before a stream is returned, but provider failures can
   * also surface while the returned stream is being consumed. We retry only when
   * no user-visible text/tool output has been emitted, preventing duplicated output.
   */
  async doStream(
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3StreamResult> {
    const { systemPrompt, messages, tools } = this.convertPrompt(options);
    const actorId = this.actorId || "system-ops-ai";
    const runId = `ops-turn-${randomUUID().slice(0, 8)}`;
    const startedAt = Date.now();

    const candidateModels: readonly string[] = this.explicitModelId
      ? [this.explicitModelId]
      : await (async () => {
          const resolved = await this.resolveModelChain(
            { feature: this.feature, requireGenerateContent: true },
            [this.modelId as ModelId],
          );
          return resolved.length > 0 ? resolved : [this.modelId];
        })();

    let activeModelId = candidateModels[0] || this.modelId;
    const maxRetryIndex = Math.max(
      candidateModels.length - 1,
      OPS_AI_POLICY_BOUNDS.maxRetryAttempts,
    );

    let leaseId: string | null = null;
    try {
      const reservation = await UsageBudgetService.reserve({
        userId: actorId,
        idempotencyKey: runId,
        feature: this.feature,
        model: activeModelId,
        mode: "provider",
        units: 1,
        requestType: "provider:ops-ai:stream",
        runId,
      });
      if (reservation.accepted) {
        leaseId = reservation.lease.id;
        await UsageBudgetService.markDispatched(leaseId).catch(() => undefined);
      }
    } catch {
      // In isolated mock test environments, allowance may be bypassed.
    }

    const abortHandler = async () => {
      if (leaseId) {
        const idToRefund = leaseId;
        leaseId = null;
        await UsageBudgetService.refund(idToRefund).catch(() => undefined);
      }
      void recordZyraOperationalEventSafe({
        version: "zyra-ops-event-v1",
        eventType: "provider_attempt",
        actorRole: "admin",
        routeClass: "fast",
        modelClass: activeModelId,
        resultCode: "ABORTED",
        latencyMs: Date.now() - startedAt,
        sizeBytes: 0,
        cacheResult: "bypass",
        attachmentCount: 0,
      });
    };

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        await abortHandler();
      } else {
        options.abortSignal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        let emittedVisibleOutput = false;
        let currentTextId: string | null = null;
        let providerAttempt = 0;

        controller.enqueue({
          type: "stream-start",
          warnings: [],
        });

        try {
          while (providerAttempt <= maxRetryIndex) {
            if (options.abortSignal?.aborted) {
              await abortHandler();
              controller.error(new Error("Stream aborted by caller."));
              return;
            }

            activeModelId =
              candidateModels[Math.min(providerAttempt, candidateModels.length - 1)] ||
              this.modelId;
            const attemptStartedAt = Date.now();
            let sawFinish = false;

            try {
              const generator = streamOpsAiModel({
                systemPrompt,
                messages,
                tools: tools.length > 0 ? tools : undefined,
                modelId: activeModelId,
                signal: options.abortSignal,
                timeoutMs: OPS_AI_POLICY_BOUNDS.providerTimeoutMs,
                streamMock: this.streamMock,
              });

              for await (const chunk of generator) {
                if (options.abortSignal?.aborted) {
                  await abortHandler();
                  controller.error(new Error("Stream aborted by caller."));
                  return;
                }

                if (chunk.type === "text-delta" && chunk.textDelta) {
                  emittedVisibleOutput = true;
                  if (!currentTextId) {
                    currentTextId = `text-${randomUUID().slice(0, 8)}`;
                    controller.enqueue({
                      type: "text-start",
                      id: currentTextId,
                    });
                  }
                  controller.enqueue({
                    type: "text-delta",
                    id: currentTextId,
                    delta: chunk.textDelta,
                  });
                } else if (chunk.type === "tool-call" && chunk.toolCall) {
                  emittedVisibleOutput = true;
                  if (currentTextId) {
                    controller.enqueue({
                      type: "text-end",
                      id: currentTextId,
                    });
                    currentTextId = null;
                  }
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: chunk.toolCall.id,
                    toolName: chunk.toolCall.name,
                    input: JSON.stringify(chunk.toolCall.args),
                  } as any);
                } else if (chunk.type === "finish") {
                  sawFinish = true;
                  if (currentTextId) {
                    controller.enqueue({
                      type: "text-end",
                      id: currentTextId,
                    });
                    currentTextId = null;
                  }
                  const isToolCall = chunk.finishReason === "tool-calls";
                  controller.enqueue({
                    type: "finish",
                    finishReason: {
                      unified: isToolCall ? "tool-calls" : "stop",
                      raw: chunk.finishReason,
                    },
                    usage: {
                      inputTokens: {
                        total: chunk.usage?.promptTokens ?? 0,
                        noCache: chunk.usage?.promptTokens ?? 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                      },
                      outputTokens: {
                        total: chunk.usage?.completionTokens ?? 0,
                        text: chunk.usage?.completionTokens ?? 0,
                        reasoning: 0,
                      },
                    },
                  });

                  if (leaseId) {
                    const idToCommit = leaseId;
                    leaseId = null;
                    await UsageBudgetService.commit(idToCommit, {
                      model: activeModelId,
                      inputTokens: chunk.usage?.promptTokens ?? 0,
                      outputTokens: chunk.usage?.completionTokens ?? 0,
                      requestType: "provider:success",
                    }).catch(() => undefined);
                  }
                  void recordZyraOperationalEventSafe({
                    version: "zyra-ops-event-v1",
                    eventType: "provider_attempt",
                    actorRole: "admin",
                    routeClass: "fast",
                    modelClass: activeModelId,
                    resultCode: "PROVIDER_SUCCESS",
                    latencyMs: Date.now() - attemptStartedAt,
                    sizeBytes: 0,
                    cacheResult: "bypass",
                    attachmentCount: 0,
                  });
                } else if (chunk.type === "error" && chunk.error) {
                  throw chunk.error;
                }
              }

              if (!sawFinish) {
                throw new Error("Provider stream ended without a finish event.");
              }

              controller.close();
              return;
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              if (options.abortSignal?.aborted) {
                await abortHandler();
                controller.error(err);
                return;
              }

              const canRetry =
                !emittedVisibleOutput &&
                providerAttempt < maxRetryIndex;

              void recordZyraOperationalEventSafe({
                version: "zyra-ops-event-v1",
                eventType: "provider_attempt",
                actorRole: "admin",
                routeClass: "fast",
                modelClass: activeModelId,
                resultCode: canRetry ? "PROVIDER_FALLBACK" : "PROVIDER_ERROR",
                latencyMs: Date.now() - attemptStartedAt,
                sizeBytes: 0,
                cacheResult: "bypass",
                attachmentCount: 0,
              });

              if (!canRetry) {
                if (leaseId) {
                  const idToRefund = leaseId;
                  leaseId = null;
                  await UsageBudgetService.refund(idToRefund).catch(() => undefined);
                }
                controller.error(err);
                return;
              }

              const failedModelId = activeModelId;
              providerAttempt += 1;
              const nextModelId =
                candidateModels[Math.min(providerAttempt, candidateModels.length - 1)] ||
                this.modelId;

              if (nextModelId === failedModelId) {
                const backoffMs = Math.min(
                  OPS_AI_POLICY_BOUNDS.retryInitialDelayMs * Math.pow(2, providerAttempt - 1),
                  OPS_AI_POLICY_BOUNDS.retryMaxDelayMs
                );
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
              }
            }
          }
        } finally {
          if (options.abortSignal) {
            options.abortSignal.removeEventListener("abort", abortHandler);
          }
        }
      },
    });

    return {
      stream,
      request: { body: { model: activeModelId } },
      response: { headers: {} },
    };
  }

  /**
   * Non-streaming generation by consuming doStream to completion.
   */
  async doGenerate(
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3GenerateResult> {
    const streamResult = await this.doStream(options);
    const reader = streamResult.stream.getReader();

    const content: LanguageModelV3Content[] = [];
    let finishReason: LanguageModelV3GenerateResult["finishReason"] = {
      unified: "stop",
      raw: "stop",
    };
    let usage: LanguageModelV3GenerateResult["usage"] = {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    };

    let aggregatedText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value.type === "text-delta") {
          aggregatedText += value.delta;
        } else if (value.type === "tool-call") {
          content.push({
            type: "tool-call",
            toolCallId: value.toolCallId,
            toolName: value.toolName,
            input: value.input,
          });
        } else if (value.type === "finish") {
          finishReason = value.finishReason;
          usage = value.usage;
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (aggregatedText) {
      content.unshift({
        type: "text",
        text: aggregatedText,
      });
    }

    return {
      content,
      finishReason,
      usage,
      warnings: [],
    };
  }
}

/**
 * Factory helper to create a ZyxLanguageModel instance.
 */
export function createZyxLanguageModel(
  modelId: string = MODEL_IDS.stableFlash
): ZyxLanguageModel {
  return new ZyxLanguageModel(modelId);
}

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
} from "ai";
import {
  OPS_AI_POLICY_BOUNDS,
  OPS_AI_TOOL_SECURITY_REGISTRY,
  validateOpsAiWorkStep,
  validateOpsAiErrorData,
  validateOpsAiCitation,
  validateOpsAiProposal,
  type OpsAiWorkStep,
  type OpsAiErrorData,
  type OpsAiErrorCode,
  type OpsAiStepType,
  type OpsAiCitation,
  type OpsAiActionProposalV2,
} from "./contracts";
import {
  assertProvenanceIntegrity,
  verifyInlineCitations,
  OPS_AI_CITATION_OFFICIAL_LABEL,
} from "./citations";
import {
  executeOpsAiTool,
  type OpsAiToolContext,
} from "./runtime-tools";
import {
  streamOpsAiModel,
  type OpsAiModelGenerateStreamOptions,
  type OpsAiModelStreamChunk,
  type OpsAiModelToolDeclaration,
  type OpsAiModelMessage,
} from "./model-factory";
import { type OpsAiChatRequest } from "./types";
import { randomUUID } from "node:crypto";

// ============================================================================
// 1. Types & Options
// ============================================================================

export interface ExecuteOpsAiRuntimeOptions {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  context?: OpsAiChatRequest["context"];
  modelId?: string;
  toolContext?: OpsAiToolContext;
  abortSignal?: AbortSignal;
  maxToolSteps?: number;
  maxConsecutiveToolCalls?: number;
  runId?: string;
  customModelStream?: (
    options: OpsAiModelGenerateStreamOptions
  ) => AsyncIterable<OpsAiModelStreamChunk>;
}

// ============================================================================
// 2. System Prompt Builder
// ============================================================================

export function buildOpsAiSystemPrompt(context?: OpsAiChatRequest["context"]): string {
  return `Anda adalah Zyx Ops AI, asisten teknis dan operasional untuk panel administrator Zyx Academy.
Tugas Anda adalah membantu administrator memahami fitur sistem, skema basis data, arsitektur, prosedur runbook operasional, dan menavigasi admin panel.

ATURAN DAN PEDOMAN:
1. Nama brand adalah Zyx (bukan ZYX).
2. Gaya bahasa: Singkat, lugas, profesional, kalimat dalam sentence-case bahasa Indonesia.
3. JANGAN PERNAH menggunakan em-dash (—) atau en-dash (–). Gunakan koma, titik dua, atau titik.
4. Jangan menambahkan tanda seru berlebih atau kalimat basa-basi.
5. Berikan jawaban berbasis data nyata dan dokumentasi yang diverifikasi.
6. Bila memerlukan informasi dokumentasi, skema tabel, metrik sistem, navigasi halaman, atau data pengguna, gunakan native tool calling yang tersedia. JANGAN membuat format teks buatan sendiri seperti markdown tool_call.

KONTEKS HALAMAN SAAT INI:
- Rute aktif: ${context?.currentPath || "/admin"}
- Query params: ${JSON.stringify(context?.queryParams || {})}
- Entitas aktif: ${JSON.stringify(context?.activeEntity || null)}`;
}

// ============================================================================
// 3. Tool Declarations for Model
// ============================================================================

export const DEFAULT_OPS_AI_TOOLS: OpsAiModelToolDeclaration[] = [
  {
    name: "retrieve_admin_knowledge",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Kata kunci atau topik pencarian dokumentasi teknis dan SOP Zyx",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "inspect_schema",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema.description,
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "Nama tabel database spesifik (opsional, contoh: user, enrollment_tokens)",
        },
      },
    },
  },
  {
    name: "get_system_metrics",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics.description,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "navigate_admin",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin.description,
    parameters: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "Nama fitur atau halaman admin yang dituju",
        },
      },
      required: ["destination"],
    },
  },
  {
    name: "search_users",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.search_users.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nama atau email pengguna yang dicari",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_create_token",
    description: OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token.description,
    parameters: {
      type: "object",
      properties: {
        courseIds: {
          type: "string",
          description: "Daftar ID mata kuliah dipisah koma (misal: kalkulus-1, fisika-dasar)",
        },
        capacity: {
          type: "string",
          description: "Kapasitas kuota anggota kelompok (angka 1 sampai 5)",
        },
        packageType: {
          type: "string",
          description: "Tipe paket (opsional, default: reguler_15)",
        },
      },
      required: ["courseIds", "capacity"],
    },
  },
];

// ============================================================================
// 4. Runtime Stream Orchestrator
// ============================================================================

/**
 * Creates an incremental UI Message Stream for Ops AI v2 adhering to
 * bounded multi-step loops, work-step lifecycle tracking, and strict security bounds.
 */
export function createOpsAiRuntimeStream(
  options: ExecuteOpsAiRuntimeOptions
): ReadableStream {
  const {
    messages,
    context,
    modelId,
    toolContext,
    abortSignal,
    maxToolSteps = OPS_AI_POLICY_BOUNDS.maxToolSteps,
    maxConsecutiveToolCalls = OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls,
    runId = `run-${randomUUID()}`,
    customModelStream,
  } = options;

  return createUIMessageStream({
    execute: async ({ writer }) => {
      let stepIndexCounter = 0;
      const currentStep: { value: OpsAiWorkStep | null } = { value: null };

      // Helper to emit validated work-step parts
      const emitWorkStep = (step: OpsAiWorkStep) => {
        const validation = validateOpsAiWorkStep(step);
        if (!validation.valid) {
          console.warn("[OpsAi WorkStep Validation Error]:", validation.errors);
        }
        currentStep.value = step;
        writer.write({
          type: "data-work-step",
          id: `step-${step.stepId}-${step.status}`,
          data: step,
        } as any);
      };

      // Helper to emit validated error parts
      const emitError = (
        code: OpsAiErrorCode,
        message: string,
        retryable: boolean,
        stepId?: string,
        details?: Record<string, unknown>
      ) => {
        const errorData: OpsAiErrorData = {
          code,
          message,
          retryable,
          runId,
          stepId,
          timestamp: Date.now(),
          details,
        };
        const validation = validateOpsAiErrorData(errorData);
        if (!validation.valid) {
          console.warn("[OpsAi ErrorData Validation Error]:", validation.errors);
        }
        writer.write({
          type: "data-error",
          id: `err-${Date.now()}`,
          data: errorData,
        } as any);
      };

      // Handle abort event
      const onAbort = () => {
        if (currentStep.value && currentStep.value.status !== "completed" && currentStep.value.status !== "failed") {
          const now = Date.now();
          emitWorkStep({
            ...currentStep.value,
            status: "cancelled",
            finishedAt: now,
            durationMs: Math.max(0, now - currentStep.value.startedAt),
            retryable: false,
            error: "Permintaan dibatalkan oleh pengguna atau timeout.",
          });
        }
        emitError("REQUEST_CANCELLED", "Permintaan telah dibatalkan.", false, currentStep.value?.stepId);
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        // ----------------------------------------------------------------------
        // Step 1: Input Bounds & Policy Validation
        // ----------------------------------------------------------------------
        if (!messages || messages.length === 0) {
          emitError("INVALID_REQUEST", "Daftar pesan tidak boleh kosong.", false);
          return;
        }

        if (messages.length > OPS_AI_POLICY_BOUNDS.maxMessagesHistory) {
          emitError(
            "CONTEXT_TOO_LARGE",
            `Jumlah riwayat pesan (${messages.length}) melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxMessagesHistory}).`,
            false
          );
          return;
        }

        let totalPromptChars = 0;
        for (const msg of messages) {
          if (msg.content.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength) {
            emitError(
              "CONTEXT_TOO_LARGE",
              `Panjang pesan individual melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxMessageCharLength} karakter).`,
              false
            );
            return;
          }
          totalPromptChars += msg.content.length;
        }

        if (totalPromptChars > OPS_AI_POLICY_BOUNDS.maxTotalPromptChars) {
          emitError(
            "CONTEXT_TOO_LARGE",
            `Total karakter prompt (${totalPromptChars}) melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxTotalPromptChars}).`,
            false
          );
          return;
        }

        // ----------------------------------------------------------------------
        // Step 2: Initial Reasoning & Planning Step
        // ----------------------------------------------------------------------
        const initialStepId = `step-${stepIndexCounter++}`;
        const initialStepStart = Date.now();

        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "queued",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
        });

        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "running",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
        });

        const systemPrompt = buildOpsAiSystemPrompt(context);

        // Transition initial step to completed
        const initialStepFinish = Date.now();
        emitWorkStep({
          stepId: initialStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "completed",
          title: "Analisis konteks permintaan admin",
          startedAt: initialStepStart,
          finishedAt: initialStepFinish,
          durationMs: initialStepFinish - initialStepStart,
        });

        // ----------------------------------------------------------------------
        // Step 3: Bounded Multi-Step Tool Execution Loop
        // ----------------------------------------------------------------------
        const conversationMessages: OpsAiModelMessage[] = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content,
        }));

        const allRunCitations: OpsAiCitation[] = [];
        const knownSourceIds = new Set<string>();
        const knownStepIds = new Set<string>();
        const knownToolCallIds = new Set<string>();
        let lastGeneratedText = "";

        let toolStepCount = 0;
        let consecutiveToolCalls = 0;
        const streamFn = customModelStream ?? streamOpsAiModel;

        while (toolStepCount < maxToolSteps) {
          if (abortSignal?.aborted) return;
          lastGeneratedText = "";

          // Call model stream with retries for provider resilience
          let modelStreamChunks: OpsAiModelStreamChunk[] = [];
          let providerAttempt = 0;
          let lastProviderError: Error | null = null;
          const maxRetries = OPS_AI_POLICY_BOUNDS.maxRetryAttempts;

          while (providerAttempt <= maxRetries) {
            if (abortSignal?.aborted) return;
            try {
              modelStreamChunks = [];
              const stream = streamFn({
                systemPrompt,
                messages: conversationMessages,
                tools: DEFAULT_OPS_AI_TOOLS,
                modelId,
                signal: abortSignal,
              });

              for await (const chunk of stream) {
                if (abortSignal?.aborted) return;
                modelStreamChunks.push(chunk);

                // Incremental text streaming to client
                if (chunk.type === "text-delta" && chunk.textDelta) {
                  lastGeneratedText += chunk.textDelta;
                  writer.write({
                    type: "text-delta",
                    textDelta: chunk.textDelta,
                  } as any);
                }
              }

              lastProviderError = null;
              break; // Stream succeeded
            } catch (err) {
              lastProviderError = err instanceof Error ? err : new Error(String(err));
              providerAttempt++;
              if (providerAttempt <= maxRetries) {
                const backoffMs = Math.min(
                  OPS_AI_POLICY_BOUNDS.retryInitialDelayMs * Math.pow(2, providerAttempt - 1),
                  OPS_AI_POLICY_BOUNDS.retryMaxDelayMs
                );
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
              }
            }
          }

          if (lastProviderError) {
            const isRateLimit =
              lastProviderError.message.includes("429") ||
              lastProviderError.message.includes("quota") ||
              lastProviderError.message.includes("RESOURCE_EXHAUSTED");
            const errorCode: OpsAiErrorCode = isRateLimit ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
            emitError(errorCode, lastProviderError.message, true, currentStep.value?.stepId);
            return;
          }

          // Extract tool calls from model stream
          const toolCalls = modelStreamChunks
            .filter((c) => c.type === "tool-call" && c.toolCall)
            .map((c) => c.toolCall!);

          // If no tool calls, synthesis is complete
          if (toolCalls.length === 0) {
            const finalStepId = `step-${stepIndexCounter++}`;
            const finalStart = Date.now();
            knownStepIds.add(finalStepId);

            // Inline citation verification on final text
            if (lastGeneratedText) {
              const verification = verifyInlineCitations({
                text: lastGeneratedText,
                availableCitations: allRunCitations,
                runId,
                knownStepIds,
                knownToolCallIds,
              });

              // If forged markers exist, emit invalid citation records to flag them in the trace
              if (verification.forgedMarkers.length > 0) {
                for (const forged of verification.forgedMarkers) {
                  const forgedCitation: OpsAiCitation = {
                    id: `cite-forged-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    sourceId: forged.rawReference,
                    source: "semantic-rag",
                    availability: "invalid",
                    runId,
                    stepId: finalStepId,
                    title: `Sitasi Palsu/Tidak Ditemukan: ${forged.rawReference}`,
                    snippet: `Marker inline '${forged.marker}' (${forged.reason}) tidak ditemukan pada sumber yang diberikan kepada model pada run '${runId}'.`,
                    timestamp: Date.now(),
                  };
                  writer.write({
                    type: "data-citation",
                    id: `cite-${forgedCitation.id}`,
                    data: forgedCitation,
                  } as any);
                }
              }
            }

            emitWorkStep({
              stepId: finalStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType: "synthesis",
              status: "completed",
              title: "Sintesis jawaban akhir",
              detail: allRunCitations.length > 0
                ? `Jawaban disintesis berdasarkan ${allRunCitations.length} ${OPS_AI_CITATION_OFFICIAL_LABEL.toLowerCase()}.`
                : undefined,
              startedAt: finalStart,
              finishedAt: Date.now(),
              durationMs: Date.now() - finalStart,
            });
            break;
          }

          // Check consecutive tool call bound
          if (consecutiveToolCalls >= maxConsecutiveToolCalls) {
            writer.write({
              type: "text-delta",
              textDelta: "\n\nBatas panggilan tool berturut-turut tercapai.",
            } as any);
            break;
          }

          const stepModelFunctionCalls: Array<Record<string, unknown>> = [];
          const stepUserFunctionResponses: Array<Record<string, unknown>> = [];

          // Execute requested tool calls sequentially
          for (const tc of toolCalls) {
            if (abortSignal?.aborted) return;
            if (toolStepCount >= maxToolSteps) break;

            toolStepCount++;
            consecutiveToolCalls++;

            const currentStepId = `step-${stepIndexCounter++}`;
            const currentStepStart = Date.now();
            const isRetrieval = tc.name === "retrieve_admin_knowledge";
            const stepType: OpsAiStepType = isRetrieval ? "retrieval" : "tool_call";
            let stepTitle = `Eksekusi tool: ${tc.name}`;
            if (isRetrieval) {
              stepTitle = `Pencarian pengetahuan admin: '${(tc.args.query as string) || ""}'`;
            } else if (tc.name === "propose_create_token") {
              stepTitle = `Penyiapan proposal pembuatan token pendaftaran`;
            } else {
              stepTitle = `Eksekusi tool read-only: ${tc.name}`;
            }

            // Emit queued
            emitWorkStep({
              stepId: currentStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType,
              status: "queued",
              title: stepTitle,
              toolName: tc.name,
              toolCallId: tc.id,
              startedAt: currentStepStart,
            });

            // Emit running
            emitWorkStep({
              stepId: currentStepId,
              runId,
              stepIndex: stepIndexCounter - 1,
              stepType,
              status: "running",
              title: stepTitle,
              toolName: tc.name,
              toolCallId: tc.id,
              startedAt: currentStepStart,
            });

            // Write tool-call part to stream
            writer.write({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.args,
            } as any);

            // Execute tool with security & authorization checks
            let toolOutput: {
              summary: string;
              data?: unknown;
              citations?: OpsAiCitation[];
              proposal?: OpsAiActionProposalV2;
            };
            try {
              const stepToolContext: OpsAiToolContext = {
                ...toolContext,
                runId,
                stepId: currentStepId,
                toolCallId: tc.id,
              };

              toolOutput = await executeOpsAiTool(tc.name, tc.args, stepToolContext);

              // ----------------------------------------------------------------
              // Emit Citations & Enforce Provenance Isolation
              // ----------------------------------------------------------------
              if (toolOutput.citations && toolOutput.citations.length > 0) {
                for (const citation of toolOutput.citations) {
                  // Enforce provenance integrity: non-retrieval tools cannot emit semantic-rag
                  assertProvenanceIntegrity(tc.name, citation.source);

                  // Validate citation schema
                  const validation = validateOpsAiCitation(citation);
                  const validCitation = validation.valid
                    ? citation
                    : { ...citation, availability: "invalid" as const };

                  allRunCitations.push(validCitation);
                  knownSourceIds.add(validCitation.sourceId);
                  knownStepIds.add(currentStepId);
                  knownToolCallIds.add(tc.id);

                  // Emit data-citation part into UI message stream
                  writer.write({
                    type: "data-citation",
                    id: `cite-${validCitation.id}`,
                    data: validCitation,
                  } as any);
                }
              }

              // ----------------------------------------------------------------
              // Emit Proposal Parts if tool produced an action proposal
              // ----------------------------------------------------------------
              if (toolOutput.proposal) {
                const proposalValidation = validateOpsAiProposal(toolOutput.proposal);
                if (!proposalValidation.valid) {
                  console.warn("[OpsAi Proposal Validation Error]:", proposalValidation.errors);
                }
                writer.write({
                  type: "data-proposal",
                  id: `prop-${toolOutput.proposal.id}`,
                  data: toolOutput.proposal,
                } as any);
              }

              const currentStepFinish = Date.now();
              emitWorkStep({
                stepId: currentStepId,
                runId,
                stepIndex: stepIndexCounter - 1,
                stepType,
                status: "completed",
                title: stepTitle,
                detail: toolOutput.summary,
                toolName: tc.name,
                toolCallId: tc.id,
                startedAt: currentStepStart,
                finishedAt: currentStepFinish,
                durationMs: currentStepFinish - currentStepStart,
              });

              // Write tool-result part to stream
              writer.write({
                type: "tool-result",
                toolCallId: tc.id,
                toolName: tc.name,
                output: toolOutput,
              } as any);

              // Accumulate functionCall and functionResponse for Gemini multi-turn protocol
              stepModelFunctionCalls.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });

              stepUserFunctionResponses.push({
                functionResponse: {
                  name: tc.name,
                  response: {
                    output: toolOutput,
                  },
                },
              });
            } catch (toolError) {
              const err = toolError instanceof Error ? toolError : new Error(String(toolError));
              const currentStepFinish = Date.now();

              emitWorkStep({
                stepId: currentStepId,
                runId,
                stepIndex: stepIndexCounter - 1,
                stepType,
                status: "failed",
                title: stepTitle,
                detail: `Tool ${tc.name} gagal dijalankan.`,
                toolName: tc.name,
                toolCallId: tc.id,
                startedAt: currentStepStart,
                finishedAt: currentStepFinish,
                durationMs: currentStepFinish - currentStepStart,
                retryable: false,
                error: err.message,
              });

              writer.write({
                type: "tool-result",
                toolCallId: tc.id,
                toolName: tc.name,
                output: { error: err.message },
              } as any);

              stepModelFunctionCalls.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });

              stepUserFunctionResponses.push({
                functionResponse: {
                  name: tc.name,
                  response: {
                    error: err.message,
                  },
                },
              });
            }
          }

          // Append functionCall (model turn) and functionResponse (user turn) to conversation
          if (stepModelFunctionCalls.length > 0) {
            conversationMessages.push({
              role: "model",
              parts: stepModelFunctionCalls,
            });
            conversationMessages.push({
              role: "user",
              parts: stepUserFunctionResponses,
            });
          }
        }

        // If loop terminated by reaching max tool steps, report notice
        if (toolStepCount >= maxToolSteps) {
          writer.write({
            type: "text-delta",
            textDelta: "\n\nBatas maksimum langkah penelusuran tercapai.",
          } as any);
        }
      } catch (fatalError) {
        const err = fatalError instanceof Error ? fatalError : new Error(String(fatalError));
        emitError("INTERNAL_ERROR", `Terjadi kesalahan internal: ${err.message}`, false, currentStep.value?.stepId);
      } finally {
        if (abortSignal) {
          abortSignal.removeEventListener("abort", onAbort);
        }
      }
    },
  });
}

/**
 * Creates an HTTP SSE Response streaming the Ops AI runtime output.
 */
export function createOpsAiRuntimeResponse(
  options: ExecuteOpsAiRuntimeOptions
): Response {
  const stream = createOpsAiRuntimeStream(options);
  return createUIMessageStreamResponse({ stream });
}

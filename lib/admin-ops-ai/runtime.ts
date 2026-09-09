import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  ToolLoopAgent,
  type Tool,
} from "ai";
import { ZyxLanguageModel } from "./zyx-language-model-adapter";
import {
  ALL_OPS_AI_TOOL_SECURITY_REGISTRY,
  OPS_AI_POLICY_BOUNDS,
  validateOpsAiCitation,
  validateOpsAiErrorData,
  validateOpsAiProposal,
  validateOpsAiWorkStep,
  type OpsAiActionProposalV2,
  type OpsAiCitation,
  type OpsAiErrorCode,
  type OpsAiErrorData,
  type OpsAiStepType,
  type OpsAiWorkStep,
} from "./contracts";
import {
  assertProvenanceIntegrity,
  verifyInlineCitations,
  OPS_AI_CITATION_OFFICIAL_LABEL,
} from "./citations";
import {
  createOpsAiTools,
  OPS_TOOL_DEFINITIONS,
  searchAdminKnowledge,
  type OpsAiToolContext,
} from "./runtime-tools";
import { searchDocs } from "./rag-store";
import type {
  OpsAiModelGenerateStreamOptions,
  OpsAiModelStreamChunk,
  OpsAiModelToolDeclaration,
} from "./model-factory";
import type { OpsAiChatRequest } from "./types";
import { randomUUID } from "node:crypto";

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
  /**
   * Legacy test seam retained for source compatibility. The ToolLoopAgent runtime
   * uses the model-factory mock registry (`setOpsAiModelStreamMock`) instead.
   */
  customModelStream?: (
    options: OpsAiModelGenerateStreamOptions
  ) => AsyncIterable<OpsAiModelStreamChunk>;
}

/**
 * Compatibility/introspection export. Production execution no longer consumes this
 * declaration array. Names and descriptions are derived from OPS_TOOL_DEFINITIONS,
 * the same registry used by createOpsAiTools().
 */
export const DEFAULT_OPS_AI_TOOLS: OpsAiModelToolDeclaration[] = Object.entries(
  OPS_TOOL_DEFINITIONS
)
  .filter(([, definition]) => definition.security.isModelCallable)
  .map(([name, definition]) => ({
    name,
    description: definition.description,
  }));

export function buildOpsAiSystemPrompt(context?: OpsAiChatRequest["context"]): string {
  const mode = context?.mode ?? "ask";
  const activeCapabilities = DEFAULT_OPS_AI_TOOLS
    .map((tool) => {
      const security = ALL_OPS_AI_TOOL_SECURITY_REGISTRY[tool.name];
      const description = security?.description ?? tool.description;
      return `- ${tool.name}: ${description}`;
    })
    .join("\n");

  const modeInstruction =
    mode === "edit"
      ? `\nMODE AKTIF: MODE EDIT / AKSI OPERASIONAL.\nBantu administrator menyiapkan atau menjalankan aksi HANYA bila tool aktif pada sesi ini mendukungnya. Jangan mengklaim dapat melakukan mutasi yang tool-nya tidak tersedia. Bila aksi tidak tersedia, jelaskan batas tersebut secara singkat dan tawarkan operasi read-only atau proposal yang memang tersedia.`
      : `\nMODE AKTIF: MODE TANYA / KONSULTASI OPERASIONAL.\nFokus utama Anda adalah menjawab pertanyaan, menganalisis status sistem, dan menerangkan SOP atau fitur teknis Zyx. Bila menjawab pertanyaan seputar fitur, SOP, skema, atau konfigurasi Zyx, panggil tool 'retrieve_admin_knowledge' terlebih dahulu agar sumber referensi resmi dapat tercantum pada jawaban.`;

  return `Anda adalah Zyx Ops AI, asisten teknis dan operasional untuk panel administrator Zyx Academy.
Tugas Anda adalah membantu administrator memahami dan mengoperasikan Zyx menggunakan tool yang AKTIF pada sesi ini. Jangan menganggap seluruh operasi yang ada di codebase dapat Anda jalankan.

ATURAN DAN PEDOMAN UTAMA:
1. Nama brand adalah Zyx (bukan ZYX).
2. Gaya bahasa: Singkat, lugas, profesional, kalimat dalam sentence-case bahasa Indonesia.
3. JANGAN PERNAH menggunakan em dash atau en dash. Gunakan koma, titik dua, atau titik.
4. Jangan menambahkan tanda seru berlebih atau kalimat basa-basi.
5. Berikan jawaban berbasis data nyata dan dokumentasi yang diverifikasi.
6. Bila memerlukan informasi dokumentasi, skema tabel, metrik sistem, navigasi halaman, data pengguna, kuis, jadwal, kelompok belajar, atau form, gunakan native tool calling yang tersedia. JANGAN membuat format teks buatan sendiri seperti markdown tool_call.
7. Setiap pertanyaan mengenai konfigurasi, SOP, fitur, alur kerja, atau arsitektur Zyx WAJIB memanggil tool 'retrieve_admin_knowledge' untuk menyertakan referensi resmi.
8. Untuk pertanyaan seperti "apa yang bisa Anda lakukan?", jawab HANYA berdasarkan daftar TOOL AKTIF di bawah. Jangan menyimpulkan kemampuan mutasi dari dokumentasi, nama fitur, atau tool internal yang tidak aktif.
9. Tool read-only tidak berarti Anda dapat membuat, mengubah, menghapus, mereset, atau mempublikasikan entitas tersebut. Jika tidak ada tool aktif untuk suatu aksi, katakan bahwa aksi tersebut belum dapat dijalankan dari Ops AI saat ini.

TOOL AKTIF PADA SESI INI:
${activeCapabilities}

RESOLUSI ENTITAS OTOMATIS:
10. Administrator tidak perlu menghafal ID teknis, slug, atau UUID. Jangan meminta ID jika nama atau kata kunci dapat dicari lewat tool.
11. Bila administrator menyebut nama, judul, alias, atau kata kunci entitas, proaktif gunakan tool pencarian yang tersedia untuk menemukan entitas tersebut.
12. Jika hasil pencarian unik, gunakan hasil itu langsung. Jika ambigu, tampilkan pilihan singkat dan minta pengguna memilih.
13. Hasil 0 BUKAN bukti final bahwa entitas tidak ada bila entitas pernah disebut atau ditemukan pada percakapan yang sama, scope mata kuliah belum pasti, atau input tampak berupa nama pendek/typo. Sebelum menyatakan tidak ditemukan, lakukan maksimal satu pencarian ulang yang lebih luas, misalnya tanpa filter mata kuliah, dengan kata kunci yang lebih pendek, atau dengan nama yang pernah muncul pada riwayat percakapan.
14. Jika pencarian ulang tetap 0, baru jelaskan bahwa entitas tidak ditemukan pada data yang dapat diakses saat ini. Jangan menyangkal temuan positif sebelumnya tanpa menyebut bahwa hasil terbaru tidak konsisten.

PROPOSAL AKSI DAN EKSEKUSI:
15. Hanya buat atau eksekusi proposal melalui tool proposal yang benar-benar tercantum pada TOOL AKTIF. Jangan membuat janji bahwa aksi mutasi lain akan dijalankan setelah pengguna menjawab "Ya" bila tool eksekusinya tidak aktif.
16. Jika tool proposal menghasilkan proposal, ringkas target dan detailnya dengan jelas, lalu gunakan mekanisme konfirmasi UI yang tersedia.

BANTUAN OPERASIONAL SEHARI-HARI:
17. Untuk kendala akses siswa, gunakan 'diagnose_student_access' bila relevan dan sajikan hasil diagnosis berbasis data.
18. Jika administrator meminta reset percobaan kuis, perubahan kuis, penghapusan kuis, atau mutasi lain yang tidak ada pada TOOL AKTIF, jangan mengklaim dapat melakukannya. Anda tetap boleh membantu menemukan kuis atau mendiagnosis kondisi dengan tool read-only yang tersedia.
19. Untuk audit kesiapan kurikulum, gunakan 'audit_course_completeness' setelah scope mata kuliah berhasil diresolusi.

FORMAT JAWABAN:
20. Gunakan daftar bernomor hanya untuk langkah yang memang berurutan. Untuk kategori dengan subitem, gunakan bullet bertingkat atau heading singkat, jangan mencampur judul kategori dan isi dalam satu urutan nomor.
21. Setiap jawaban akhir harus memiliki teks yang bermakna. Jangan menyelesaikan turn dengan respons kosong.

FORMAT TOMBOL INTERAKTIF (QUICK ACTIONS):
22. Saat benar-benar perlu meminta pilihan atau konfirmasi yang didukung tool aktif, gunakan blok quick-actions pada baris paling akhir:
    \`\`\`quick-actions
    ["Opsi 1", "Opsi 2"]
    \`\`\`
${modeInstruction}

KONTEKS HALAMAN SAAT INI:
- Rute aktif: ${context?.currentPath || "/admin"}
- Query params: ${JSON.stringify(context?.queryParams || {})}
- Entitas aktif: ${JSON.stringify(context?.activeEntity || null)}`;
}

interface ToolExecutionBudget {
  readonly maxExecutions: number;
  used: number;
  blocked: boolean;
}

function createBudgetedTools(
  context: OpsAiToolContext,
  budget: ToolExecutionBudget
): Record<string, Tool> {
  const tools = createOpsAiTools(context);
  const budgeted: Record<string, Tool> = {};

  for (const [name, definition] of Object.entries(tools)) {
    const originalExecute = (definition as any).execute;
    budgeted[name] = {
      ...(definition as any),
      execute: originalExecute
        ? async (input: unknown, executionOptions: unknown) => {
            if (budget.used >= budget.maxExecutions) {
              budget.blocked = true;
              throw new Error(
                `OPS_AI_TOOL_BUDGET_EXCEEDED: batas ${budget.maxExecutions} eksekusi tool tercapai.`
              );
            }
            budget.used += 1;
            return originalExecute(input, executionOptions);
          }
        : undefined,
    } as Tool;
  }

  return budgeted;
}

export interface CreateOpsAiAgentOptions {
  systemPrompt?: string;
  modelId?: string;
  toolContext?: OpsAiToolContext;
  maxToolSteps?: number;
  maxConsecutiveToolCalls?: number;
  executionBudget?: ToolExecutionBudget;
}

/**
 * Creates the production AI SDK 6 ToolLoopAgent. Tool definitions, execution,
 * schema validation, and tool-result reinjection are delegated to the SDK.
 */
export function createOpsAiAgent(options: CreateOpsAiAgentOptions = {}): ToolLoopAgent {
  const maxToolSteps = Math.max(
    1,
    options.maxToolSteps ?? OPS_AI_POLICY_BOUNDS.maxToolSteps
  );
  const maxConsecutiveToolCalls = Math.max(
    1,
    options.maxConsecutiveToolCalls ?? OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls
  );
  const maxExecutions = Math.min(maxToolSteps, maxConsecutiveToolCalls);
  const executionBudget = options.executionBudget ?? {
    maxExecutions,
    used: 0,
    blocked: false,
  };
  const model = new ZyxLanguageModel({
    modelId: options.modelId,
    actorId: options.toolContext?.actorId,
    feature: "admin-ops-ai",
  });
  const tools = createBudgetedTools(options.toolContext ?? {}, executionBudget);

  return new ToolLoopAgent({
    id: "zyx-ops-ai-agent",
    instructions: options.systemPrompt,
    model,
    tools,
    // One extra generation is reserved for synthesis after the final permitted
    // tool execution. Any additional tool attempt is blocked by executionBudget.
    stopWhen: stepCountIs(maxExecutions + 1),
    maxRetries: OPS_AI_POLICY_BOUNDS.maxRetryAttempts,
  });
}

function normalizeModelMessages(
  messages: ExecuteOpsAiRuntimeOptions["messages"]
): Array<Record<string, unknown>> {
  return messages.map((message) => ({
    role:
      message.role === "assistant"
        ? "assistant"
        : message.role === "system"
          ? "system"
          : "user",
    content: message.content,
  }));
}

function classifyProviderError(error: unknown): OpsAiErrorCode {
  const message = error instanceof Error ? error.message : String(error || "");
  if (
    message.includes("429") ||
    message.toLowerCase().includes("quota") ||
    message.includes("RESOURCE_EXHAUSTED")
  ) {
    return "RATE_LIMITED";
  }
  return "PROVIDER_UNAVAILABLE";
}

function getToolStepTitle(toolName: string, input: Record<string, unknown>): {
  stepType: OpsAiStepType;
  title: string;
} {
  if (toolName === "retrieve_admin_knowledge") {
    return {
      stepType: "retrieval",
      title: `Pencarian pengetahuan admin: '${String(input.query || "")}'`,
    };
  }
  if (toolName === "propose_create_token") {
    return {
      stepType: "tool_call",
      title: "Penyiapan proposal pembuatan token pendaftaran",
    };
  }
  if (ALL_OPS_AI_TOOL_SECURITY_REGISTRY[toolName]?.allowsMutation) {
    return { stepType: "tool_call", title: `Eksekusi aksi: ${toolName}` };
  }
  return { stepType: "tool_call", title: `Eksekusi tool read-only: ${toolName}` };
}

async function appendAutomaticKnowledgeGrounding(
  systemPrompt: string,
  messages: ExecuteOpsAiRuntimeOptions["messages"],
  toolContext?: OpsAiToolContext
): Promise<string> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const query = lastUserMessage?.content.trim() || "";
  if (!query) return systemPrompt;

  try {
    let docs: Array<{
      title: string;
      filePath: string;
      section?: string;
      snippet: string;
      score?: number;
    }> = [];

    try {
      const vectorResults = await searchAdminKnowledge({
        query,
        callerRole: toolContext?.callerRole ?? "admin",
        vectorProvider: toolContext?.vectorProvider,
        embeddingAdapter: toolContext?.embeddingAdapter,
      });
      if (vectorResults?.results?.length) docs = vectorResults.results;
    } catch {
      // Vector provider can be unavailable in isolated/local environments.
    }

    if (docs.length === 0) {
      docs = await searchDocs(query, 3);
    }

    if (docs.length === 0) return systemPrompt;

    return (
      systemPrompt +
      `\n\nDOKUMEN REFERENSI TERKAIT DARI BASIS PENGETAHUAN ZYX (Gunakan untuk menjawab secara akurat dan panggil tool 'retrieve_admin_knowledge' bila ingin merujuk resmi):\n` +
      docs
        .map(
          (doc) =>
            `--- Dokumen: ${doc.title} (${doc.filePath}${doc.section ? ` › ${doc.section}` : ""})\n${doc.snippet}`
        )
        .join("\n\n")
    );
  } catch (error) {
    console.warn("[OpsAi Knowledge Grounding Warn]:", error);
    return systemPrompt;
  }
}

interface AgentPassResult {
  finalStepText: string;
  responseMessages: Array<Record<string, unknown>>;
  providerError?: unknown;
}

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
  } = options;

  return createUIMessageStream({
    execute: async ({ writer }) => {
      let stepIndexCounter = 0;
      const currentStep: { value: OpsAiWorkStep | null } = { value: null };
      const knownStepIds = new Set<string>();
      const knownToolCallIds = new Set<string>();
      const allRunCitations: OpsAiCitation[] = [];
      const toolSteps = new Map<string, OpsAiWorkStep>();
      let abortReported = false;

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
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          data: errorData,
        } as any);
      };

      const reportAbort = () => {
        if (abortReported) return;
        abortReported = true;
        const active = currentStep.value;
        if (active && active.status !== "completed" && active.status !== "failed") {
          const now = Date.now();
          emitWorkStep({
            ...active,
            status: "cancelled",
            finishedAt: now,
            durationMs: Math.max(0, now - active.startedAt),
            retryable: false,
            error: "Permintaan dibatalkan oleh pengguna atau timeout.",
          });
        }
        emitError("REQUEST_CANCELLED", "Permintaan telah dibatalkan.", false, active?.stepId);
      };

      const startToolStep = (
        toolCallId: string,
        toolName: string,
        input: Record<string, unknown>
      ) => {
        if (toolSteps.has(toolCallId)) return;
        const stepId = `step-${toolCallId}`;
        const startedAt = Date.now();
        const { stepType, title } = getToolStepTitle(toolName, input);
        const queued: OpsAiWorkStep = {
          stepId,
          runId,
          stepIndex: stepIndexCounter++,
          stepType,
          status: "queued",
          title,
          toolName,
          toolCallId,
          startedAt,
        };
        toolSteps.set(toolCallId, queued);
        knownStepIds.add(stepId);
        knownToolCallIds.add(toolCallId);
        emitWorkStep(queued);
        const running: OpsAiWorkStep = { ...queued, status: "running" };
        toolSteps.set(toolCallId, running);
        emitWorkStep(running);
      };

      const finishToolStep = (
        toolCallId: string,
        status: "completed" | "failed",
        detail?: string,
        error?: string
      ) => {
        const existing = toolSteps.get(toolCallId);
        if (!existing) return;
        const finishedAt = Date.now();
        const finished: OpsAiWorkStep = {
          ...existing,
          status,
          detail,
          finishedAt,
          durationMs: Math.max(0, finishedAt - existing.startedAt),
          retryable: status === "failed" ? false : undefined,
          error: status === "failed" ? error : undefined,
        };
        toolSteps.set(toolCallId, finished);
        emitWorkStep(finished);
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          reportAbort();
          return;
        }
        abortSignal.addEventListener("abort", reportAbort, { once: true });
      }

      try {
        if (!messages?.length) {
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
        for (const message of messages) {
          if (message.content.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength) {
            emitError(
              "CONTEXT_TOO_LARGE",
              `Panjang pesan individual melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxMessageCharLength} karakter).`,
              false
            );
            return;
          }
          totalPromptChars += message.content.length;
        }
        if (totalPromptChars > OPS_AI_POLICY_BOUNDS.maxTotalPromptChars) {
          emitError(
            "CONTEXT_TOO_LARGE",
            `Total karakter prompt (${totalPromptChars}) melampaui batas maksimum (${OPS_AI_POLICY_BOUNDS.maxTotalPromptChars}).`,
            false
          );
          return;
        }

        const reasoningStepId = `step-${stepIndexCounter++}`;
        const reasoningStartedAt = Date.now();
        emitWorkStep({
          stepId: reasoningStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "queued",
          title: "Analisis konteks permintaan admin",
          startedAt: reasoningStartedAt,
        });
        emitWorkStep({
          stepId: reasoningStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "running",
          title: "Analisis konteks permintaan admin",
          startedAt: reasoningStartedAt,
        });

        let systemPrompt = buildOpsAiSystemPrompt(context);
        systemPrompt = await appendAutomaticKnowledgeGrounding(
          systemPrompt,
          messages,
          toolContext
        );

        const reasoningFinishedAt = Date.now();
        emitWorkStep({
          stepId: reasoningStepId,
          runId,
          stepIndex: 0,
          stepType: "reasoning",
          status: "completed",
          title: "Analisis konteks permintaan admin",
          startedAt: reasoningStartedAt,
          finishedAt: reasoningFinishedAt,
          durationMs: reasoningFinishedAt - reasoningStartedAt,
        });

        const maxExecutions = Math.max(
          1,
          Math.min(maxToolSteps, maxConsecutiveToolCalls)
        );
        const executionBudget: ToolExecutionBudget = {
          maxExecutions,
          used: 0,
          blocked: false,
        };

        const runAgentPass = async (
          modelMessages: Array<Record<string, unknown>>
        ): Promise<AgentPassResult> => {
          let finalStepText = "";
          let providerError: unknown;

          const agent = createOpsAiAgent({
            systemPrompt,
            modelId,
            toolContext: {
              ...toolContext,
              runId,
              isModelCall: true,
            },
            maxToolSteps,
            maxConsecutiveToolCalls,
            executionBudget,
          });

          const result = await agent.stream({
            messages: modelMessages as any,
            abortSignal,
            timeout: {
              totalMs: OPS_AI_POLICY_BOUNDS.providerTimeoutMs,
              stepMs: OPS_AI_POLICY_BOUNDS.stepTimeoutMs,
              chunkMs: OPS_AI_POLICY_BOUNDS.streamChunkTimeoutMs,
            },
            onStepFinish: (event: any) => {
              finalStepText = String(event.text || "");
            },
          } as any);

          try {
            for await (const rawPart of (result as any).fullStream) {
              if (abortSignal?.aborted) {
                reportAbort();
                break;
              }
              const part = rawPart as any;

              if (part.type === "text-delta" || part.type === "text") {
                const text = String(part.text ?? part.textDelta ?? part.delta ?? "");
                if (text) {
                  writer.write({ type: "text-delta", textDelta: text } as any);
                }
                continue;
              }

              if (part.type === "tool-call") {
                const toolCallId = String(part.toolCallId);
                const toolName = String(part.toolName);
                const input = (part.input ?? part.args ?? {}) as Record<string, unknown>;
                startToolStep(toolCallId, toolName, input);
                writer.write({
                  type: "tool-call",
                  toolCallId,
                  toolName,
                  input,
                } as any);
                continue;
              }

              if (part.type === "tool-result") {
                const toolCallId = String(part.toolCallId);
                const toolName = String(part.toolName);
                const output = part.output ?? part.result;
                const summary =
                  output && typeof output === "object" && "summary" in output
                    ? String((output as { summary?: unknown }).summary || "")
                    : undefined;
                finishToolStep(toolCallId, "completed", summary);
                writer.write({
                  type: "tool-result",
                  toolCallId,
                  toolName,
                  output,
                } as any);

                if (output && typeof output === "object") {
                  const toolOutput = output as {
                    citations?: OpsAiCitation[];
                    proposal?: OpsAiActionProposalV2;
                  };

                  for (const citation of toolOutput.citations || []) {
                    assertProvenanceIntegrity(toolName, citation.source);
                    const validation = validateOpsAiCitation(citation);
                    const validCitation = validation.valid
                      ? citation
                      : { ...citation, availability: "invalid" as const };
                    allRunCitations.push(validCitation);
                    knownStepIds.add(validCitation.stepId);
                    if (validCitation.toolCallId) {
                      knownToolCallIds.add(validCitation.toolCallId);
                    }
                    writer.write({
                      type: "data-citation",
                      id: `cite-${validCitation.id}`,
                      data: validCitation,
                    } as any);
                  }

                  if (toolOutput.proposal) {
                    const proposalValidation = validateOpsAiProposal(toolOutput.proposal);
                    if (!proposalValidation.valid) {
                      console.warn(
                        "[OpsAi Proposal Validation Error]:",
                        proposalValidation.errors
                      );
                    }
                    writer.write({
                      type: "data-proposal",
                      id: `prop-${toolOutput.proposal.id}`,
                      data: toolOutput.proposal,
                    } as any);
                  }
                }
                continue;
              }

              if (part.type === "tool-error") {
                const toolCallId = String(part.toolCallId || "unknown-call");
                const toolName = String(part.toolName || "unknown_tool");
                const input = (part.input ?? part.args ?? {}) as Record<string, unknown>;
                startToolStep(toolCallId, toolName, input);
                const error = part.error instanceof Error
                  ? part.error.message
                  : String(part.error || "Tool execution failed");
                finishToolStep(
                  toolCallId,
                  "failed",
                  `Tool ${toolName} gagal dijalankan.`,
                  error
                );
                if (!error.includes("OPS_AI_TOOL_BUDGET_EXCEEDED")) {
                  writer.write({
                    type: "tool-result",
                    toolCallId,
                    toolName,
                    output: { error },
                  } as any);
                }
                continue;
              }

              if (part.type === "error") {
                providerError = part.error;
              }
            }
          } catch (error) {
            providerError = error;
          }

          let responseMessages: Array<Record<string, unknown>> = [];
          try {
            const response = await (result as any).response;
            if (Array.isArray(response?.messages)) {
              responseMessages = response.messages;
            }
          } catch {
            // Response metadata is optional when the provider fails or is aborted.
          }

          return {
            finalStepText,
            responseMessages,
            providerError,
          };
        };

        let modelMessages = normalizeModelMessages(messages);
        let pass = await runAgentPass(modelMessages);

        if (abortSignal?.aborted) {
          reportAbort();
          return;
        }

        if (pass.providerError) {
          const code = classifyProviderError(pass.providerError);
          const message = pass.providerError instanceof Error
            ? pass.providerError.message
            : String(pass.providerError);
          emitError(code, message, true, currentStep.value?.stepId);
          return;
        }

        const toolBudgetHitWithoutFinalText =
          executionBudget.blocked && pass.finalStepText.trim().length === 0;

        if (toolBudgetHitWithoutFinalText) {
          const reason =
            maxConsecutiveToolCalls <= maxToolSteps
              ? "Batas panggilan tool berturut-turut tercapai."
              : "Batas maksimum langkah penelusuran tercapai.";
          writer.write({ type: "text-delta", textDelta: `\n\n${reason}` } as any);
          return;
        }

        if (pass.finalStepText.trim().length === 0) {
          modelMessages = [
            ...modelMessages,
            ...pass.responseMessages,
            {
              role: "user",
              content:
                "Respons sebelumnya kosong. Jawab permintaan admin terakhir dengan teks yang jelas dan tidak kosong. Jika hasil terbaru bertentangan dengan temuan sebelumnya, jelaskan ketidakkonsistenannya dan lakukan pencarian ulang hanya bila perlu.",
            },
          ];
          pass = await runAgentPass(modelMessages);
        }

        if (abortSignal?.aborted) {
          reportAbort();
          return;
        }

        if (pass.providerError) {
          const code = classifyProviderError(pass.providerError);
          const message = pass.providerError instanceof Error
            ? pass.providerError.message
            : String(pass.providerError);
          emitError(code, message, true, currentStep.value?.stepId);
          return;
        }

        if (pass.finalStepText.trim().length === 0) {
          const failedStepId = `step-${stepIndexCounter++}`;
          const failedAt = Date.now();
          knownStepIds.add(failedStepId);
          emitWorkStep({
            stepId: failedStepId,
            runId,
            stepIndex: stepIndexCounter - 1,
            stepType: "synthesis",
            status: "failed",
            title: "Sintesis jawaban akhir",
            detail: "Model tidak menghasilkan jawaban teks setelah satu kali retry.",
            startedAt: failedAt,
            finishedAt: failedAt,
            durationMs: 0,
            retryable: true,
            error: "EMPTY_MODEL_RESPONSE",
          });
          writer.write({
            type: "text-delta",
            textDelta: "Terjadi kendala saat menyusun jawaban. Silakan ulangi permintaan terakhir.",
          } as any);
          emitError(
            "INTERNAL_ERROR",
            "Model tidak menghasilkan jawaban teks. Silakan ulangi permintaan.",
            true,
            failedStepId,
            { reason: "EMPTY_MODEL_RESPONSE" }
          );
          return;
        }

        const synthesisStepId = `step-${stepIndexCounter++}`;
        const synthesisStartedAt = Date.now();
        knownStepIds.add(synthesisStepId);
        const verification = verifyInlineCitations({
          text: pass.finalStepText,
          availableCitations: allRunCitations,
          runId,
          knownStepIds,
          knownToolCallIds,
        });

        for (const forged of verification.forgedMarkers) {
          const forgedCitation: OpsAiCitation = {
            id: `cite-forged-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceId: forged.rawReference,
            source: "semantic-rag",
            availability: "invalid",
            runId,
            stepId: synthesisStepId,
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

        const synthesisFinishedAt = Date.now();
        emitWorkStep({
          stepId: synthesisStepId,
          runId,
          stepIndex: stepIndexCounter - 1,
          stepType: "synthesis",
          status: "completed",
          title: "Sintesis jawaban akhir",
          detail:
            allRunCitations.length > 0
              ? `Jawaban disintesis berdasarkan ${allRunCitations.length} ${OPS_AI_CITATION_OFFICIAL_LABEL.toLowerCase()}.`
              : undefined,
          startedAt: synthesisStartedAt,
          finishedAt: synthesisFinishedAt,
          durationMs: synthesisFinishedAt - synthesisStartedAt,
        });
      } catch (fatalError) {
        if (abortSignal?.aborted) {
          reportAbort();
          return;
        }
        const error = fatalError instanceof Error
          ? fatalError
          : new Error(String(fatalError));
        emitError(
          "INTERNAL_ERROR",
          `Terjadi kesalahan internal: ${error.message}`,
          false,
          currentStep.value?.stepId
        );
      } finally {
        if (abortSignal) {
          abortSignal.removeEventListener("abort", reportAbort);
        }
      }
    },
  });
}

export function createOpsAiRuntimeResponse(
  options: ExecuteOpsAiRuntimeOptions
): Response {
  return createUIMessageStreamResponse({
    stream: createOpsAiRuntimeStream(options),
  });
}

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  ToolLoopAgent,
  stepCountIs,
  type UIMessageStreamWriter,
} from "ai";
import {
  createZyxLanguageModel,
  ZyxLanguageModel,
} from "./zyx-language-model-adapter";
import {
  OPS_AI_POLICY_BOUNDS,
  OPS_AI_TOOL_SECURITY_REGISTRY,
  ALL_OPS_AI_TOOL_SECURITY_REGISTRY,
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
  searchAdminKnowledge,
  createOpsAiTools,
  type OpsAiToolContext,
} from "./runtime-tools";
import { searchDocs } from "./rag-store";
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

// ============================================================================
// 3. Tool Declarations for Model
// ============================================================================

export const DEFAULT_OPS_AI_TOOLS: OpsAiModelToolDeclaration[] = [
  // Baseline Tools
  {
    name: "retrieve_admin_knowledge",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge.description,
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
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema.description,
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
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics.description,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "navigate_admin",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin.description,
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
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.search_users.description,
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
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token.description,
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

  // 1. Academic & Curriculum
  {
    name: "list_courses",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_courses.description,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Kata kunci nama atau ID mata kuliah" },
        category: { type: "string", description: "Filter kategori mata kuliah" },
      },
    },
  },
  {
    name: "list_chapters",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_chapters.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter berdasarkan ID mata kuliah (opsional)" },
        search: { type: "string", description: "Kata kunci nama atau judul bab materi" },
      },
    },
  },
  {
    name: "list_materials",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_materials.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah" },
        chapterId: { type: "string", description: "ID bab (opsional)" },
      },
      required: ["courseId"],
    },
  },
  {
    name: "audit_course_completeness",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.audit_course_completeness.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "ID mata kuliah yang ingin diaudit" },
      },
      required: ["courseId"],
    },
  },

  // 2. Assessment & Questions
  {
    name: "list_quizzes",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_quizzes.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter mata kuliah. Boleh ID, nama lengkap, atau alias yang cukup jelas seperti PKA." },
        status: { type: "string", description: "Status kuis (draft / published)" },
        search: { type: "string", description: "Nama, potongan judul, atau nama pendek kuis. Typo kecil akan ditoleransi." },
      },
    },
  },
  {
    name: "list_questions",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_questions.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        difficulty: { type: "string", description: "Tingkat kesulitan: easy, medium, hard" },
        reviewStatus: { type: "string", description: "Status kurasi: published, reviewed, generated" },
        search: { type: "string", description: "Pencarian teks soal" },
      },
    },
  },
  {
    name: "get_quiz_insights",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_quiz_insights.description,
    parameters: {
      type: "object",
      properties: {
        quizId: { type: "string", description: "ID kuis" },
      },
      required: ["quizId"],
    },
  },

  // 3. Schedules & Meet
  {
    name: "list_schedules",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_schedules.description,
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Tanggal mulai (YYYY-MM-DD)" },
        endDate: { type: "string", description: "Tanggal akhir (YYYY-MM-DD)" },
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        status: { type: "string", description: "Filter status sesi (scheduled, cancelled, completed)" },
      },
    },
  },
  {
    name: "list_tutor_availability",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_tutor_availability.description,
    parameters: {
      type: "object",
      properties: {
        tutorId: { type: "string", description: "ID tutor (opsional)" },
      },
    },
  },

  // 4. Study Groups & Tokens
  {
    name: "list_study_groups",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_study_groups.description,
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "Filter ID mata kuliah" },
        search: { type: "string", description: "Pencarian nama kelompok" },
        hasTutor: { type: "boolean", description: "Filter kelompok yang memiliki tutor" },
      },
    },
  },
  {
    name: "list_enrollment_tokens",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_enrollment_tokens.description,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Status token: active, exhausted, atau expired" },
      },
    },
  },
  {
    name: "diagnose_student_access",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.diagnose_student_access.description,
    parameters: {
      type: "object",
      properties: {
        userIdentifier: { type: "string", description: "Nama, email, atau ID pengguna murid yang ingin didiagnosa" },
        courseId: { type: "string", description: "ID mata kuliah untuk evaluasi akses khusus (opsional)" },
      },
      required: ["userIdentifier"],
    },
  },

  // 5. Users, Notifications & Operations
  {
    name: "list_pka_registrations",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_pka_registrations.description,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Pencarian nama atau email pendaftar PKA" },
      },
    },
  },
  {
    name: "list_forms",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_forms.description,
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter kategori form" },
        search: { type: "string", description: "Pencarian nama form" },
      },
    },
  },
  {
    name: "get_form_responses_summary",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_form_responses_summary.description,
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "ID formulir" },
      },
      required: ["formId"],
    },
  },
  {
    name: "list_blog_articles",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_blog_articles.description,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Status artikel: published atau draft" },
        search: { type: "string", description: "Pencarian judul artikel" },
      },
    },
  },
  {
    name: "get_feature_flags",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_feature_flags.description,
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// ============================================================================
// 3.5. AI SDK 6 ToolLoopAgent Factory
// ============================================================================

export interface CreateOpsAiAgentOptions {
  systemPrompt?: string;
  modelId?: string;
  toolContext?: OpsAiToolContext;
  maxConsecutiveToolCalls?: number;
}

/**
 * Creates an AI SDK 6 ToolLoopAgent instance bound to ZyxLanguageModel,
 * unified Ops tools, and bounded by stepCountIs.
 */
export function createOpsAiAgent(options: CreateOpsAiAgentOptions = {}): ToolLoopAgent {
  const model = createZyxLanguageModel(options.modelId);
  const tools = createOpsAiTools(options.toolContext);
  return new ToolLoopAgent({
    id: "zyx-ops-ai-agent",
    instructions: options.systemPrompt,
    model,
    tools,
    stopWhen: stepCountIs(
      options.maxConsecutiveToolCalls ?? OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls
    ),
  });
}

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

        let systemPrompt = buildOpsAiSystemPrompt(context);

        const allRunCitations: OpsAiCitation[] = [];
        const knownSourceIds = new Set<string>();
        const knownStepIds = new Set<string>();
        const knownToolCallIds = new Set<string>();

        // ----------------------------------------------------------------------
        // Automatic Knowledge Grounding & Citation Emission
        // ----------------------------------------------------------------------
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const lastUserQuery = lastUserMsg?.content || "";

        if (lastUserQuery.trim().length > 0) {
          try {
            let initialDocs: Array<{
              title: string;
              filePath: string;
              section?: string;
              snippet: string;
              score?: number;
            }> = [];

            try {
              const vectorResults = await searchAdminKnowledge({
                query: lastUserQuery,
                callerRole: toolContext?.callerRole ?? "admin",
                vectorProvider: toolContext?.vectorProvider,
                embeddingAdapter: toolContext?.embeddingAdapter,
              });
              if (vectorResults?.results && vectorResults.results.length > 0) {
                initialDocs = vectorResults.results;
              }
            } catch {
              // Vectorize may not be available in local environment
            }

            if (initialDocs.length === 0) {
              const localDocs = await searchDocs(lastUserQuery, 3);
              initialDocs = localDocs;
            }

            if (initialDocs.length > 0) {
              systemPrompt +=
                `\n\nDOKUMEN REFERENSI TERKAIT DARI BASIS PENGETAHUAN ZYX (Gunakan untuk menjawab secara akurat dan panggil tool 'retrieve_admin_knowledge' bila ingin merujuk resmi):\n` +
                initialDocs
                  .map(
                    (d) =>
                      `--- Dokumen: ${d.title} (${d.filePath}${d.section ? ` › ${d.section}` : ""})\n${d.snippet}`
                  )
                  .join("\n\n");
            }
          } catch (err) {
            console.warn("[OpsAi Knowledge Grounding Warn]:", err);
          }
        }

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
        let lastGeneratedText = "";

        let toolStepCount = 0;
        let consecutiveToolCalls = 0;
        let emptySynthesisRetries = 0;
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

          // A model turn without a tool call is final only if it contains meaningful text.
          if (toolCalls.length === 0) {
            if (lastGeneratedText.trim().length === 0) {
              if (emptySynthesisRetries < 1) {
                emptySynthesisRetries++;
                conversationMessages.push({
                  role: "user",
                  content:
                    "Respons sebelumnya kosong. Jawab permintaan admin terakhir dengan teks yang jelas dan tidak kosong. Jika hasil terbaru bertentangan dengan temuan sebelumnya, jelaskan ketidakkonsistenannya dan lakukan pencarian ulang hanya bila perlu.",
                });
                continue;
              }

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
              emitError(
                "INTERNAL_ERROR",
                "Model tidak menghasilkan jawaban teks. Silakan ulangi permintaan.",
                true,
                failedStepId,
                { reason: "EMPTY_MODEL_RESPONSE" }
              );
              writer.write({
                type: "text-delta",
                textDelta: "Terjadi kendala saat menyusun jawaban. Silakan ulangi permintaan terakhir.",
              } as any);
              break;
            }

            const finalStepId = `step-${stepIndexCounter++}`;
            const finalStart = Date.now();
            knownStepIds.add(finalStepId);

            // Inline citation verification on final text
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

          // Check consecutive tool call bound using AI SDK stepCountIs
          const shouldStop = stepCountIs(maxConsecutiveToolCalls);
          if (shouldStop({ steps: new Array(consecutiveToolCalls) } as any) || consecutiveToolCalls >= maxConsecutiveToolCalls) {
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
            } else if (ALL_OPS_AI_TOOL_SECURITY_REGISTRY[tc.name]?.allowsMutation) {
              stepTitle = `Eksekusi aksi: ${tc.name}`;
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
                isModelCall: true,
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

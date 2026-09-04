import { randomUUID } from "node:crypto";
import { z } from "zod";
import { tool } from "ai";
import {
  OPS_AI_TOOL_SECURITY_REGISTRY,
  sanitizeUserSearchProjection,
  type OpsAiToolSecurityClassification,
  type OpsAiCitation,
  type OpsAiCitationAvailability,
  type OpsAiActionProposalV2,
  type OpsAiProposalPreview,
} from "./contracts";
import { proposalStore } from "./proposal-store";
import {
  buildSemanticRagCitation,
  buildDatabaseReadCitation,
  buildLiveToolCitation,
  assertProvenanceIntegrity,
} from "./citations";
import {
  retrieveAdminOpsKnowledge,
  type RetrieveAdminKnowledgeOptions,
} from "./admin-knowledge-retrieval";
import {
  type AdminKnowledgeSearchResult,
  type AdminKnowledgeRetrievalResult,
  type AdminKnowledgeSourceRecord,
  type AdminKnowledgeChunk,
} from "./admin-knowledge-contracts";
import {
  introspectDbSchema,
  getLiveSystemMetrics,
  type SchemaTableInfo,
} from "./schema-introspection";
import { db } from "@/db";
import { user } from "@/db/schema";
import { like, or } from "drizzle-orm";
import { createCanonicalVectorClient } from "@/lib/vectorize-client";
import type { CanonicalVectorProvider } from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { searchDocs } from "./rag-store";
import {
  executeListCourses,
  executeCreateCourse,
  executeUpdateCourse,
  executeBatchCreateChapters,
  executeUpdateChapter,
  executeListMaterials,
} from "./domain-academic";
import {
  executeListQuizzes,
  executeCreateQuiz,
  executeUpdateQuiz,
  executeListQuestions,
  executeCreateQuestion,
  executePublishQuestion,
  executeGetQuizInsights,
} from "./domain-assessment";
import {
  executeListSchedules,
  executeCreateMeetSession,
  executeRescheduleOrCancelMeet,
  executeListTutorAvailability,
} from "./domain-schedules";
import {
  executeListStudyGroups,
  executeCreateStudyGroup,
  executeAssignTutorToGroup,
  executeCreateEnrollmentToken,
  executeListEnrollmentTokens,
} from "./domain-groups";
import {
  executeUpdateUserRole,
  executeToggleUserStatus,
  executeSendBroadcastNotification,
  executeListPkaRegistrations,
  executeCreatePkaAnnouncement,
  executeCreatePkaSchedule,
  executeListForms,
  executeCreateOrUpdateForm,
  executeGetFormResponsesSummary,
  executeListBlogArticles,
  executeCreateBlogArticle,
  executePublishBlogArticle,
  executeGetFeatureFlags,
  executeSetFeatureFlag,
  executeCreateShortLink,
  executeTriggerAiJob,
} from "./domain-operations";

// ============================================================================
// 1. Sitemap Directory for Admin Navigation
// ============================================================================

export interface AdminSitemapEntry {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

export const ADMIN_SITEMAP: Readonly<Record<string, AdminSitemapEntry>> = Object.freeze({
  dashboard: {
    href: "/admin",
    label: "Panel Admin",
    description: "Ringkasan metrik utama, status pendaftaran, dan aktivitas platform.",
  },
  courses: {
    href: "/admin/courses",
    label: "Mata Kuliah",
    description: "Kelola silabus, bab materi kanonikal, dan daftar mata kuliah.",
  },
  tokens: {
    href: "/admin/tokens",
    label: "Token Aktivasi",
    description: "Generate dan pantau token aktivasi pendaftaran grup belajar.",
  },
  users: {
    href: "/admin/users",
    label: "Pengguna",
    description: "Kelola akun pengguna, peran (admin/tutor/student), dan status.",
  },
  groups: {
    href: "/admin/groups",
    label: "Kelompok Belajar",
    description: "Daftar grup belajar siswa dan penugasan tutor.",
  },
  questions: {
    href: "/admin/questions",
    label: "Bank Soal",
    description: "Kelola bank soal asesmen, kuis, LaTeX formula, dan opsi.",
  },
  quizzes: {
    href: "/admin/quizzes",
    label: "Kuis",
    description: "Daftar kuis aktif dan jadwal pengerjaan siswa.",
  },
  jobs: {
    href: "/admin/jobs",
    label: "Generasi Soal",
    description: "Antrean background job AI untuk pembuatan materi dan soal.",
  },
  flags: {
    href: "/admin/ops/flags",
    label: "Feature Flags",
    description: "Kelola toggle runtime fitur opsional dan audit log.",
  },
  ops: {
    href: "/admin/ops",
    label: "Monitor Ops",
    description: "Status server, runtime environment, dan health checklist.",
  },
  analytics: {
    href: "/admin/ops/analytics",
    label: "Analitik Zyra",
    description: "Metrik performa model AI, latensi, dan penggunaan token.",
  },
  pka: {
    href: "/admin/tutorial-pka/registrations",
    label: "Pendaftar PKA",
    description: "Verifikasi pendaftaran program Tutorial PKA gratis.",
  },
});

// ============================================================================
// 2. Tool Context and Helper Functions
// ============================================================================

export interface OpsAiToolContext {
  readonly callerRole?: string;
  readonly actorId?: string;
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

/** Alias for introspectDbSchema to match handoff naming */
export const introspectSchema = introspectDbSchema;

/**
 * Searches Admin Ops Knowledge using the isolated admin_ops_knowledge namespace.
 */
export async function searchAdminKnowledge(options: {
  query: string;
  callerRole?: string;
  limit?: number;
  vectorProvider?: CanonicalVectorProvider;
  embeddingAdapter?: CanonicalContentV2EmbeddingAdapter;
  mockHydrationCatalog?: {
    sources: AdminKnowledgeSourceRecord[];
    chunks: AdminKnowledgeChunk[];
  };
}): Promise<AdminKnowledgeRetrievalResult> {
  const callerRole = options.callerRole ?? "admin";
  const vectorProvider = options.vectorProvider ?? createCanonicalVectorClient();
  const embeddingAdapter = options.embeddingAdapter ?? (await getCanonicalContentV2EmbeddingAdapter());

  return retrieveAdminOpsKnowledge({
    query: options.query,
    callerRole,
    limit: options.limit,
    vectorProvider,
    embeddingAdapter,
    mockHydrationCatalog: options.mockHydrationCatalog,
  });
}

// ============================================================================
// 3. Tool Execution Logic
// ============================================================================

export interface OpsAiToolExecutionResult {
  summary: string;
  data?: unknown;
  citations?: OpsAiCitation[];
  proposal?: OpsAiActionProposalV2;
}

/**
 * Executes a verified read-only Ops AI tool.
 */
export async function executeOpsAiTool(
  name: string,
  input: Record<string, unknown>,
  context?: OpsAiToolContext
): Promise<OpsAiToolExecutionResult> {
  const classification: OpsAiToolSecurityClassification | undefined =
    OPS_AI_TOOL_SECURITY_REGISTRY[name];

  if (!classification) {
    throw new Error(`Tool '${name}' tidak terdaftar dalam katalog keamanan Ops AI.`);
  }

  if (!classification.isModelCallable) {
    throw new Error(`Tool '${name}' tidak diizinkan untuk dipanggil oleh model AI.`);
  }

  if (classification.allowsMutation && classification.toolClass !== "autonomous-mutation") {
    throw new Error(`Security Violation: Model-callable tool '${name}' tidak boleh menjalankan mutasi.`);
  }

  if (classification.toolClass === "autonomous-mutation" && context?.callerRole !== "admin") {
    throw new Error(`Forbidden: Mutasi otonom '${name}' hanya dapat dipanggil oleh sesi admin.`);
  }

  switch (name) {
    case "retrieve_admin_knowledge": {
      const query = String(input.query || "").trim();
      if (!query) {
        return {
          summary: "Tidak ada kata kunci pencarian yang diberikan.",
          data: [],
          citations: [],
        };
      }

      const retrieval = await searchAdminKnowledge({
        query,
        callerRole: context?.callerRole ?? "admin",
        vectorProvider: context?.vectorProvider,
        embeddingAdapter: context?.embeddingAdapter,
        mockHydrationCatalog: context?.mockHydrationCatalog,
      });

      let searchResults = retrieval.results;
      if (searchResults.length === 0 && !context?.mockHydrationCatalog) {
        try {
          const localDocs = await searchDocs(query, 4);
          searchResults = localDocs.map((doc, idx) => ({
            id: `local-${encodeURIComponent(doc.filePath).slice(0, 30)}-${idx}`,
            sourceId: doc.filePath,
            source: "semantic-rag" as const,
            title: doc.title,
            filePath: doc.filePath,
            section: doc.section,
            snippet: doc.snippet,
            score: 0.9,
            availability: "available" as const,
          }));
        } catch {
          // Ignore fallback errors
        }
      }

      const citations: OpsAiCitation[] = searchResults.map((result) =>
        buildSemanticRagCitation(result, {
          runId: context?.runId ?? "standalone-run",
          stepId: context?.stepId ?? "standalone-step",
          toolCallId: context?.toolCallId,
          availability: (result.availability as OpsAiCitationAvailability) ?? "available",
        })
      );

      return {
        summary: `Ditemukan ${searchResults.length} sumber dokumentasi relevan untuk '${query}'.`,
        data: searchResults,
        citations,
      };
    }

    case "inspect_schema": {
      const targetTable = input.tableName ? String(input.tableName).trim() : undefined;
      const schemaData = await introspectSchema(targetTable);
      const schemaCitation = buildDatabaseReadCitation({
        sourceId: targetTable ? `src-schema-${targetTable}` : "src-schema-all",
        title: targetTable ? `Skema Basis Data: ${targetTable}` : "Skema Basis Data Zyx",
        snippet: `Struktur tabel database Zyx: ${schemaData.tables.map((t) => t.tableName).join(", ")}`,
        runId: context?.runId ?? "standalone-run",
        stepId: context?.stepId ?? "standalone-step",
        toolCallId: context?.toolCallId,
      });

      return {
        summary: `Skema database ${targetTable ? `tabel '${targetTable}'` : `${schemaData.tables.length} tabel utama`}.`,
        data: schemaData,
        citations: [schemaCitation],
      };
    }

    case "get_system_metrics": {
      const metrics = await getLiveSystemMetrics();
      const metricsCitation = buildDatabaseReadCitation({
        sourceId: "src-system-metrics",
        title: "Metrik Agregat Sistem",
        snippet: `Metrik sistem: ${metrics.usersCount} pengguna, ${metrics.coursesCount} mata kuliah, ${metrics.questionsCount} soal, ${metrics.tokensCount} token, ${metrics.pkaRegistrationsCount} pendaftar PKA.`,
        runId: context?.runId ?? "standalone-run",
        stepId: context?.stepId ?? "standalone-step",
        toolCallId: context?.toolCallId,
      });

      return {
        summary: `Metrik sistem: ${metrics.usersCount} pengguna, ${metrics.coursesCount} mata kuliah, ${metrics.questionsCount} soal, ${metrics.tokensCount} token, ${metrics.pkaRegistrationsCount} pendaftar PKA.`,
        data: metrics,
        citations: [metricsCitation],
      };
    }

    case "navigate_admin": {
      const destination = String(input.destination || "").toLowerCase().trim();
      const matched = Object.entries(ADMIN_SITEMAP).find(
        ([k, v]) =>
          k.includes(destination) ||
          v.label.toLowerCase().includes(destination) ||
          v.description.toLowerCase().includes(destination)
      );

      const navCitation = buildLiveToolCitation({
        sourceId: matched ? `src-nav-${matched[0]}` : "src-nav-sitemap",
        title: matched ? `Navigasi: ${matched[1].label}` : "Daftar Rute Navigasi Admin",
        snippet: matched
          ? `${matched[1].description} (${matched[1].href})`
          : "Daftar rute navigasi admin panel yang tersedia.",
        url: matched ? matched[1].href : "/admin",
        runId: context?.runId ?? "standalone-run",
        stepId: context?.stepId ?? "standalone-step",
        toolCallId: context?.toolCallId,
      });

      if (matched) {
        return {
          summary: `Navigasi ke ${matched[1].label} (${matched[1].href}): ${matched[1].description}`,
          data: matched[1],
          citations: [navCitation],
        };
      }

      return {
        summary: "Daftar rute navigasi admin panel yang tersedia.",
        data: Object.values(ADMIN_SITEMAP),
        citations: [navCitation],
      };
    }

    case "search_users": {
      const query = String(input.query || "").trim();
      if (!query) {
        return {
          summary: "Kata kunci pencarian pengguna kosong.",
          data: [],
          citations: [],
        };
      }

      const escaped = query.replace(/[%_\\]/g, "\\$&");

      const rawUsers = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(or(like(user.name, `%${escaped}%`), like(user.email, `%${escaped}%`)))
        .limit(6);

      const sanitizedUsers = sanitizeUserSearchProjection(rawUsers, {
        includeRedactedEmail: context?.includeRedactedEmail,
      });

      const usersCitation = buildDatabaseReadCitation({
        sourceId: `src-users-${encodeURIComponent(query)}`,
        title: `Pencarian Pengguna: '${query}'`,
        snippet: `Ditemukan ${sanitizedUsers.length} pengguna dengan kata kunci '${query}'.`,
        runId: context?.runId ?? "standalone-run",
        stepId: context?.stepId ?? "standalone-step",
        toolCallId: context?.toolCallId,
      });

      return {
        summary: `Ditemukan ${sanitizedUsers.length} pengguna dengan kata kunci '${query}'.`,
        data: sanitizedUsers,
        citations: [usersCitation],
      };
    }

    case "propose_create_token": {
      const rawCourses = String(input.courseIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const capacity = Math.max(1, Math.min(5, parseInt(String(input.capacity || "5"), 10) || 5));
      const packageType = String(input.packageType || "reguler_15");

      if (rawCourses.length === 0) {
        return {
          summary: "Gagal menyiapkan proposal: Setidaknya satu ID mata kuliah harus ditentukan.",
          data: { error: "COURSE_IDS_REQUIRED" },
        };
      }

      const runId = context?.runId ?? `run-${randomUUID()}`;
      const stepId = context?.stepId ?? `step-${randomUUID()}`;

      const preview: OpsAiProposalPreview = {
        summary: `1 token pendaftaran (${rawCourses.join(", ")}, kuota ${capacity} orang, ${packageType})`,
        targetEntity: rawCourses.join(", "),
        fields: [
          { label: "Mata Kuliah", value: rawCourses.join(", ") },
          { label: "Kapasitas Kelompok", value: `${capacity} orang` },
          { label: "Tipe Paket", value: packageType },
        ],
      };

      const { publicProposal } = await proposalStore.createProposal({
        runId,
        stepId,
        type: "create_token",
        title: "Buat Token Aktivasi Pendaftaran",
        description: `Membuat 1 token pendaftaran baru untuk ${rawCourses.length} mata kuliah dengan kapasitas kelompok ${capacity} orang.`,
        preview,
        payload: {
          courseIds: rawCourses,
          capacity,
          packageType,
        },
        preconditions: {
          version: 1,
          stateFingerprint: `courses:${[...rawCourses].sort().join(",")}:active`,
        },
        actorId: context?.actorId ?? (context?.callerRole === "admin" ? "admin" : undefined),
      });

      return {
        summary: `Proposal pembuatan token telah disiapkan (ID: ${publicProposal.id}). Menunggu konfirmasi admin.`,
        data: {
          proposalId: publicProposal.id,
          type: publicProposal.type,
          preview: publicProposal.preview,
        },
        proposal: publicProposal,
      };
    }

    // ─── 1. Academic & Curriculum ──────────────────────────────────────────────
    case "list_courses": {
      const res = await executeListCourses(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_course": {
      const res = await executeCreateCourse(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "update_course": {
      const res = await executeUpdateCourse(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "batch_create_chapters": {
      const res = await executeBatchCreateChapters(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "update_chapter": {
      const res = await executeUpdateChapter(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_materials": {
      const res = await executeListMaterials(input as any);
      return { summary: res.summary, data: res.data };
    }

    // ─── 2. Assessment & Questions ─────────────────────────────────────────────
    case "list_quizzes": {
      const res = await executeListQuizzes(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_quiz": {
      const res = await executeCreateQuiz(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "update_quiz": {
      const res = await executeUpdateQuiz(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_questions": {
      const res = await executeListQuestions(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_question": {
      const res = await executeCreateQuestion(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "publish_question": {
      const res = await executePublishQuestion(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "get_quiz_insights": {
      const res = await executeGetQuizInsights(input as any);
      return { summary: res.summary, data: res.data };
    }

    // ─── 3. Schedules & Meet ───────────────────────────────────────────────────
    case "list_schedules": {
      const res = await executeListSchedules(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_meet_session": {
      const res = await executeCreateMeetSession(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "reschedule_or_cancel_meet": {
      const res = await executeRescheduleOrCancelMeet(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_tutor_availability": {
      const res = await executeListTutorAvailability(input as any);
      return { summary: res.summary, data: res.data };
    }

    // ─── 4. Study Groups & Tokens ──────────────────────────────────────────────
    case "list_study_groups": {
      const res = await executeListStudyGroups(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_study_group": {
      const res = await executeCreateStudyGroup(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "assign_tutor_to_group": {
      const res = await executeAssignTutorToGroup(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "create_enrollment_token": {
      const res = await executeCreateEnrollmentToken(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_enrollment_tokens": {
      const res = await executeListEnrollmentTokens(input as any);
      return { summary: res.summary, data: res.data };
    }

    // ─── 5. Users, Notifications & Operations ──────────────────────────────────
    case "update_user_role": {
      const res = await executeUpdateUserRole(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "toggle_user_status": {
      const res = await executeToggleUserStatus(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "send_broadcast_notification": {
      const res = await executeSendBroadcastNotification(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_pka_registrations": {
      const res = await executeListPkaRegistrations(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_pka_announcement": {
      const res = await executeCreatePkaAnnouncement(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "create_pka_schedule": {
      const res = await executeCreatePkaSchedule(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "list_forms": {
      const res = await executeListForms(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_or_update_form": {
      const res = await executeCreateOrUpdateForm(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "get_form_responses_summary": {
      const res = await executeGetFormResponsesSummary(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "list_blog_articles": {
      const res = await executeListBlogArticles(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "create_blog_article": {
      const res = await executeCreateBlogArticle(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "publish_blog_article": {
      const res = await executePublishBlogArticle(input as any);
      return { summary: res.summary, data: res.data };
    }
    case "get_feature_flags": {
      const res = await executeGetFeatureFlags();
      return { summary: res.summary, data: res.data };
    }
    case "set_feature_flag": {
      const res = await executeSetFeatureFlag(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "create_short_link": {
      const res = await executeCreateShortLink(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }
    case "trigger_ai_job": {
      const res = await executeTriggerAiJob(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    }

    default:
      throw new Error(`Tool '${name}' belum diimplementasikan.`);
  }
}

// ============================================================================
// 4. Native AI SDK Tool Definitions
// ============================================================================

/**
 * Creates native AI SDK 6 tool definitions configured with the caller context.
 */
export function createOpsAiTools(context?: OpsAiToolContext) {
  return {
    retrieve_admin_knowledge: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge.description,
      inputSchema: z.object({
        query: z.string().describe("Kata kunci atau topik pencarian dokumentasi teknis dan SOP Zyx"),
      }),
      execute: async ({ query }) => {
        return executeOpsAiTool("retrieve_admin_knowledge", { query }, context);
      },
    }),

    inspect_schema: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema.description,
      inputSchema: z.object({
        tableName: z
          .string()
          .optional()
          .describe("Nama tabel spesifik yang ingin diinspeksi (contoh: user, enrollment_tokens, questions)"),
      }),
      execute: async ({ tableName }) => {
        return executeOpsAiTool("inspect_schema", { tableName }, context);
      },
    }),

    get_system_metrics: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics.description,
      inputSchema: z.object({}),
      execute: async () => {
        return executeOpsAiTool("get_system_metrics", {}, context);
      },
    }),

    navigate_admin: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin.description,
      inputSchema: z.object({
        destination: z
          .string()
          .describe("Nama fitur, topik, atau halaman admin panel yang dituju (misal: token aktivasi, feature flags)"),
      }),
      execute: async ({ destination }) => {
        return executeOpsAiTool("navigate_admin", { destination }, context);
      },
    }),

    search_users: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.search_users.description,
      inputSchema: z.object({
        query: z.string().describe("Nama atau email pengguna yang dicari"),
      }),
      execute: async ({ query }) => {
        return executeOpsAiTool("search_users", { query }, context);
      },
    }),

    propose_create_token: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token.description,
      inputSchema: z.object({
        courseIds: z.string().describe("Daftar ID mata kuliah dipisah koma (misal: kalkulus-1, fisika-dasar)"),
        capacity: z.string().describe("Kapasitas kuota anggota kelompok (angka 1 sampai 5)"),
        packageType: z.string().optional().describe("Tipe paket (opsional, default: reguler_15)"),
      }),
      execute: async ({ courseIds, capacity, packageType }) => {
        return executeOpsAiTool("propose_create_token", { courseIds, capacity, packageType }, context);
      },
    }),

    // ─── 1. Academic & Curriculum ──────────────────────────────────────────────
    list_courses: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_courses.description,
      inputSchema: z.object({
        search: z.string().optional().describe("Kata kunci pencarian nama atau ID mata kuliah"),
        category: z.string().optional().describe("Filter kategori mata kuliah"),
      }),
      execute: async (args) => executeOpsAiTool("list_courses", args, context),
    }),

    create_course: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_course.description,
      inputSchema: z.object({
        id: z.string().describe("ID / slug mata kuliah (alfanumerik huruf kecil dan strip, misal: 'kalkulus-1')"),
        title: z.string().describe("Nama lengkap mata kuliah"),
        category: z.string().describe("Kategori mata kuliah (misal: Matematika, Fisika, Umum)"),
        description: z.string().optional().describe("Deskripsi mata kuliah"),
      }),
      execute: async (args) => executeOpsAiTool("create_course", args, context),
    }),

    update_course: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.update_course.description,
      inputSchema: z.object({
        id: z.string().describe("ID mata kuliah yang ingin diubah"),
        title: z.string().optional().describe("Nama baru mata kuliah"),
        category: z.string().optional().describe("Kategori baru mata kuliah"),
        description: z.string().optional().describe("Deskripsi baru mata kuliah"),
      }),
      execute: async (args) => executeOpsAiTool("update_course", args, context),
    }),

    batch_create_chapters: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.batch_create_chapters.description,
      inputSchema: z.object({
        courseId: z.string().describe("ID mata kuliah"),
        chapters: z.array(z.object({
          title: z.string().describe("Judul bab materi"),
          orderIndex: z.number().optional().describe("Urutan bab (angka)"),
          description: z.string().optional().describe("Deskripsi bab"),
        })).describe("Daftar bab yang akan dibuat"),
      }),
      execute: async (args) => executeOpsAiTool("batch_create_chapters", args, context),
    }),

    update_chapter: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.update_chapter.description,
      inputSchema: z.object({
        chapterId: z.string().describe("ID bab yang ingin diubah"),
        title: z.string().optional().describe("Judul baru bab"),
        orderIndex: z.number().optional().describe("Urutan bab baru"),
      }),
      execute: async (args) => executeOpsAiTool("update_chapter", args, context),
    }),

    list_materials: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_materials.description,
      inputSchema: z.object({
        courseId: z.string().describe("ID mata kuliah"),
        chapterId: z.string().optional().describe("ID bab (opsional)"),
      }),
      execute: async (args) => executeOpsAiTool("list_materials", args, context),
    }),

    // ─── 2. Assessment & Questions ─────────────────────────────────────────────
    list_quizzes: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_quizzes.description,
      inputSchema: z.object({
        courseId: z.string().optional().describe("Filter ID mata kuliah"),
        status: z.enum(["draft", "published"]).optional().describe("Status kuis"),
        search: z.string().optional().describe("Kata kunci pencarian judul kuis"),
      }),
      execute: async (args) => executeOpsAiTool("list_quizzes", args, context),
    }),

    create_quiz: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_quiz.description,
      inputSchema: z.object({
        courseId: z.string().describe("ID mata kuliah"),
        title: z.string().describe("Judul kuis"),
        durationMinutes: z.number().optional().describe("Batas waktu pengerjaan dalam menit (default: 30)"),
        category: z.enum(["daily", "weekly", "chapter", "premium", "simulation"]).optional().describe("Kategori kuis"),
        questionIds: z.array(z.string()).optional().describe("Daftar ID soal dari bank soal"),
      }),
      execute: async (args) => executeOpsAiTool("create_quiz", args, context),
    }),

    update_quiz: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.update_quiz.description,
      inputSchema: z.object({
        quizId: z.string().describe("ID kuis yang ingin diubah"),
        patch: z.object({
          title: z.string().optional().describe("Judul baru"),
          durationMinutes: z.number().optional().describe("Durasi baru dalam menit"),
          status: z.enum(["draft", "published"]).optional().describe("Status baru"),
        }),
      }),
      execute: async (args) => executeOpsAiTool("update_quiz", args, context),
    }),

    list_questions: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_questions.description,
      inputSchema: z.object({
        courseId: z.string().optional().describe("Filter ID mata kuliah"),
        difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Tingkat kesulitan"),
        reviewStatus: z.string().optional().describe("Status kurasi (generated, reviewed, published)"),
        search: z.string().optional().describe("Kata kunci pencarian teks soal"),
      }),
      execute: async (args) => executeOpsAiTool("list_questions", args, context),
    }),

    create_question: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_question.description,
      inputSchema: z.object({
        courseId: z.string().describe("ID mata kuliah"),
        prompt: z.string().describe("Teks pertanyaan/soal (mendukung LaTeX math)"),
        options: z.array(z.string()).describe("Pilihan jawaban (minimal 2 opsi, misal: ['A. ...', 'B. ...'])"),
        correctAnswer: z.string().describe("Kunci jawaban benar"),
        difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Tingkat kesulitan"),
        explanation: z.string().optional().describe("Pembahasan soal"),
      }),
      execute: async (args) => executeOpsAiTool("create_question", args, context),
    }),

    publish_question: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.publish_question.description,
      inputSchema: z.object({
        questionId: z.string().describe("ID soal yang ingin dipublikasikan"),
      }),
      execute: async (args) => executeOpsAiTool("publish_question", args, context),
    }),

    get_quiz_insights: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.get_quiz_insights.description,
      inputSchema: z.object({
        quizId: z.string().describe("ID kuis"),
      }),
      execute: async (args) => executeOpsAiTool("get_quiz_insights", args, context),
    }),

    // ─── 3. Schedules & Meet ───────────────────────────────────────────────────
    list_schedules: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_schedules.description,
      inputSchema: z.object({
        startDate: z.string().optional().describe("Filter tanggal mulai (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("Filter tanggal akhir (YYYY-MM-DD)"),
        courseId: z.string().optional().describe("Filter ID mata kuliah"),
        status: z.string().optional().describe("Filter status sesi (scheduled, completed, cancelled)"),
      }),
      execute: async (args) => executeOpsAiTool("list_schedules", args, context),
    }),

    create_meet_session: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_meet_session.description,
      inputSchema: z.object({
        tutorId: z.string().describe("ID tutor yang ditugaskan"),
        courseId: z.string().describe("ID mata kuliah"),
        dateIso: z.string().describe("Tanggal sesi (YYYY-MM-DD)"),
        timeSlot: z.string().describe("Slot waktu (misal: '09:00 - 10:30')"),
        groupId: z.string().optional().describe("ID kelompok belajar (opsional)"),
        topic: z.string().optional().describe("Topik diskusi sesi tutorial"),
      }),
      execute: async (args) => executeOpsAiTool("create_meet_session", args, context),
    }),

    reschedule_or_cancel_meet: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.reschedule_or_cancel_meet.description,
      inputSchema: z.object({
        bookingId: z.string().describe("ID sesi booking"),
        action: z.enum(["reschedule", "cancel"]).describe("Aksi: 'reschedule' atau 'cancel'"),
        newDateIso: z.string().optional().describe("Tanggal baru jika reschedule (YYYY-MM-DD)"),
        newTimeSlot: z.string().optional().describe("Jam baru jika reschedule (misal: '13:00 - 14:30')"),
        reason: z.string().optional().describe("Alasan pembatalan/reschedule"),
      }),
      execute: async (args) => executeOpsAiTool("reschedule_or_cancel_meet", args, context),
    }),

    list_tutor_availability: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_tutor_availability.description,
      inputSchema: z.object({
        tutorId: z.string().optional().describe("ID tutor (opsional)"),
      }),
      execute: async (args) => executeOpsAiTool("list_tutor_availability", args, context),
    }),

    // ─── 4. Study Groups & Tokens ──────────────────────────────────────────────
    list_study_groups: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_study_groups.description,
      inputSchema: z.object({
        courseId: z.string().optional().describe("Filter ID mata kuliah"),
        search: z.string().optional().describe("Kata kunci pencarian nama kelompok"),
        hasTutor: z.boolean().optional().describe("Filter kelompok yang sudah/belum punya tutor"),
      }),
      execute: async (args) => executeOpsAiTool("list_study_groups", args, context),
    }),

    create_study_group: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_study_group.description,
      inputSchema: z.object({
        name: z.string().describe("Nama kelompok belajar (misal: 'Kelompok Kalkulus Alpha')"),
        courseIds: z.array(z.string()).describe("Daftar ID mata kuliah"),
        capacity: z.number().optional().describe("Kapasitas siswa (1-5 orang)"),
      }),
      execute: async (args) => executeOpsAiTool("create_study_group", args, context),
    }),

    assign_tutor_to_group: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.assign_tutor_to_group.description,
      inputSchema: z.object({
        groupId: z.string().describe("ID kelompok belajar"),
        tutorId: z.string().describe("ID tutor pendamping"),
      }),
      execute: async (args) => executeOpsAiTool("assign_tutor_to_group", args, context),
    }),

    create_enrollment_token: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_enrollment_token.description,
      inputSchema: z.object({
        courseIds: z.array(z.string()).describe("Daftar ID mata kuliah"),
        capacity: z.number().describe("Kapasitas kuota kelompok (1 sampai 5 orang)"),
        packageType: z.string().optional().describe("Tipe paket (default: reguler_15)"),
      }),
      execute: async (args) => executeOpsAiTool("create_enrollment_token", args, context),
    }),

    list_enrollment_tokens: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_enrollment_tokens.description,
      inputSchema: z.object({
        status: z.enum(["active", "exhausted", "expired"]).optional().describe("Filter status token"),
      }),
      execute: async (args) => executeOpsAiTool("list_enrollment_tokens", args, context),
    }),

    // ─── 5. Users, Notifications & Operations ──────────────────────────────────
    update_user_role: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.update_user_role.description,
      inputSchema: z.object({
        userId: z.string().describe("ID pengguna"),
        roles: z.array(z.enum(["admin", "tutor", "murid"])).describe("Daftar peran baru"),
      }),
      execute: async (args) => executeOpsAiTool("update_user_role", args, context),
    }),

    toggle_user_status: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.toggle_user_status.description,
      inputSchema: z.object({
        userId: z.string().describe("ID pengguna"),
        status: z.enum(["active", "suspended"]).describe("Status akun: 'active' atau 'suspended'"),
        reason: z.string().optional().describe("Alasan perubahan status"),
      }),
      execute: async (args) => executeOpsAiTool("toggle_user_status", args, context),
    }),

    send_broadcast_notification: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.send_broadcast_notification.description,
      inputSchema: z.object({
        title: z.string().describe("Judul notifikasi"),
        body: z.string().describe("Isi pesan notifikasi"),
        target: z.enum(["all", "course", "group"]).optional().describe("Target penerima"),
        targetId: z.string().optional().describe("ID spesifik jika target 'course' atau 'group'"),
        link: z.string().optional().describe("Tautan tujuan ketika notifikasi diklik"),
      }),
      execute: async (args) => executeOpsAiTool("send_broadcast_notification", args, context),
    }),

    list_pka_registrations: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_pka_registrations.description,
      inputSchema: z.object({
        search: z.string().optional().describe("Kata kunci pencarian nama atau email pendaftar PKA"),
      }),
      execute: async (args) => executeOpsAiTool("list_pka_registrations", args, context),
    }),

    create_pka_announcement: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_announcement.description,
      inputSchema: z.object({
        title: z.string().describe("Judul pengumuman PKA"),
        content: z.string().describe("Isi pengumuman"),
        isPinned: z.boolean().optional().describe("Sematkan di bagian atas"),
      }),
      execute: async (args) => executeOpsAiTool("create_pka_announcement", args, context),
    }),

    create_pka_schedule: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_schedule.description,
      inputSchema: z.object({
        title: z.string().describe("Judul kegiatan PKA"),
        sessionAt: z.string().describe("Waktu sesi (YYYY-MM-DD HH:mm atau format ISO)"),
        meetLink: z.string().optional().describe("Link Google Meet sesi PKA"),
      }),
      execute: async (args) => executeOpsAiTool("create_pka_schedule", args, context),
    }),

    list_forms: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_forms.description,
      inputSchema: z.object({
        category: z.string().optional().describe("Filter kategori form"),
        search: z.string().optional().describe("Kata kunci pencarian nama form"),
      }),
      execute: async (args) => executeOpsAiTool("list_forms", args, context),
    }),

    create_or_update_form: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_or_update_form.description,
      inputSchema: z.object({
        formId: z.string().optional().describe("ID form jika mengedit form yang sudah ada"),
        slug: z.string().describe("Slug URL form (misal: 'evaluasi-tutor-2026')"),
        title: z.string().describe("Judul form"),
        category: z.enum(["survey", "quiz", "feedback", "registration"]).optional().describe("Kategori form"),
        description: z.string().optional().describe("Deskripsi formulir"),
      }),
      execute: async (args) => executeOpsAiTool("create_or_update_form", args, context),
    }),

    get_form_responses_summary: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.get_form_responses_summary.description,
      inputSchema: z.object({
        formId: z.string().describe("ID formulir"),
      }),
      execute: async (args) => executeOpsAiTool("get_form_responses_summary", args, context),
    }),

    list_blog_articles: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.list_blog_articles.description,
      inputSchema: z.object({
        status: z.enum(["published", "draft"]).optional().describe("Status artikel"),
        search: z.string().optional().describe("Kata kunci judul artikel"),
      }),
      execute: async (args) => executeOpsAiTool("list_blog_articles", args, context),
    }),

    create_blog_article: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_blog_article.description,
      inputSchema: z.object({
        title: z.string().describe("Judul artikel blog"),
        content: z.string().describe("Isi artikel dalam format Markdown"),
        category: z.enum(["tips_kuliah", "pojok_kampus", "fakta_seru", "kegiatan_zyx"]).optional().describe("Kategori artikel"),
        status: z.enum(["draft", "published"]).optional().describe("Status draf atau diterbitkan"),
      }),
      execute: async (args) => executeOpsAiTool("create_blog_article", args, context),
    }),

    publish_blog_article: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.publish_blog_article.description,
      inputSchema: z.object({
        articleId: z.string().describe("ID artikel"),
        publish: z.boolean().describe("true untuk terbitkan, false untuk kembalikan ke draf"),
      }),
      execute: async (args) => executeOpsAiTool("publish_blog_article", args, context),
    }),

    get_feature_flags: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.get_feature_flags.description,
      inputSchema: z.object({}),
      execute: async () => executeOpsAiTool("get_feature_flags", {}, context),
    }),

    set_feature_flag: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.set_feature_flag.description,
      inputSchema: z.object({
        flagKey: z.string().describe("Kunci feature flag (misal: 'FEATURE_PKA')"),
        enabled: z.boolean().describe("Status aktif (true) atau mati (false)"),
        reason: z.string().optional().describe("Alasan perubahan status"),
      }),
      execute: async (args) => executeOpsAiTool("set_feature_flag", args, context),
    }),

    create_short_link: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.create_short_link.description,
      inputSchema: z.object({
        slug: z.string().describe("Slug kustom (misal: 'daftar-pka')"),
        url: z.string().describe("URL tujuan lengkap (misal: 'https://zyx.academy/...')"),
        title: z.string().optional().describe("Judul / keterangan link"),
      }),
      execute: async (args) => executeOpsAiTool("create_short_link", args, context),
    }),

    trigger_ai_job: tool({
      description: OPS_AI_TOOL_SECURITY_REGISTRY.trigger_ai_job.description,
      inputSchema: z.object({
        jobType: z.enum(["generate_questions", "sync_rag", "extract_ko"]).describe("Jenis antrean job AI"),
        courseId: z.string().describe("ID mata kuliah"),
      }),
      execute: async (args) => executeOpsAiTool("trigger_ai_job", args, context),
    }),
  };
}

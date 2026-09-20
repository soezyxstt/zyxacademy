import { randomUUID } from "node:crypto";
import { z } from "zod";
import { tool, type Tool } from "ai";
import { defineOpsTool, type OpsToolDefinition } from "./ops-tool-definition";
export type { OpsToolDefinition };
import {
  OPS_AI_TOOL_SECURITY_REGISTRY,
  OPS_AI_DOMAIN_TOOL_SECURITY_REGISTRY,
  ALL_OPS_AI_TOOL_SECURITY_REGISTRY,
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
  executeListChapters,
  executeCreateCourse,
  executeUpdateCourse,
  executeBatchCreateChapters,
  executeUpdateChapter,
  executeListMaterials,
  executeBulkUpdateMaterials,
  executeAuditCourseCompleteness,
} from "./domain-academic";
import {
  executeListQuizzes,
  executeCreateQuiz,
  executeUpdateQuiz,
  executeListQuestions,
  executeCreateQuestion,
  executePublishQuestion,
  executeGetQuizInsights,
  executeResetQuizAttempt,
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
  executeDiagnoseStudentAccess,
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
// 3. Single Tool Registry via defineOpsTool
// ============================================================================

export interface OpsAiToolExecutionResult {
  summary: string;
  data?: unknown;
  citations?: OpsAiCitation[];
  proposal?: OpsAiActionProposalV2;
}

export const OPS_TOOL_DEFINITIONS: Record<string, OpsToolDefinition<any>> = {
  // ─── 0. Baseline Tools ───────────────────────────────────────────────────────
  retrieve_admin_knowledge: defineOpsTool({
    name: "retrieve_admin_knowledge",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.retrieve_admin_knowledge,
    inputSchema: z.object({
      query: z.string().describe("Kata kunci atau topik pencarian dokumentasi teknis dan SOP Zyx"),
    }),
    execute: async ({ query }, context) => {
      const q = String(query || "").trim();
      if (!q) {
        return {
          summary: "Tidak ada kata kunci pencarian yang diberikan.",
          data: [],
          citations: [],
        };
      }

      const retrieval = await searchAdminKnowledge({
        query: q,
        callerRole: context?.callerRole ?? "admin",
        vectorProvider: context?.vectorProvider,
        embeddingAdapter: context?.embeddingAdapter,
        mockHydrationCatalog: context?.mockHydrationCatalog,
      });

      let searchResults = retrieval.results;
      if (searchResults.length === 0 && !context?.mockHydrationCatalog) {
        try {
          const localDocs = await searchDocs(q, 4);
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
        summary: `Ditemukan ${searchResults.length} sumber dokumentasi relevan untuk '${q}'.`,
        data: searchResults,
        citations,
      };
    },
  }),

  inspect_schema: defineOpsTool({
    name: "inspect_schema",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.inspect_schema,
    inputSchema: z.object({
      tableName: z
        .string()
        .optional()
        .describe("Nama tabel database spesifik (opsional, contoh: user, enrollment_tokens, questions)"),
    }),
    execute: async ({ tableName }, context) => {
      const targetTable = tableName ? String(tableName).trim() : undefined;
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
    },
  }),

  get_system_metrics: defineOpsTool({
    name: "get_system_metrics",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_system_metrics,
    inputSchema: z.object({}),
    execute: async (_args, context) => {
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
    },
  }),

  navigate_admin: defineOpsTool({
    name: "navigate_admin",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.navigate_admin,
    inputSchema: z.object({
      destination: z
        .string()
        .describe("Nama fitur, topik, atau halaman admin panel yang dituju (misal: token aktivasi, feature flags)"),
    }),
    execute: async ({ destination }, context) => {
      const dest = String(destination || "").toLowerCase().trim();
      const matched = Object.entries(ADMIN_SITEMAP).find(
        ([k, v]) =>
          k.includes(dest) ||
          v.label.toLowerCase().includes(dest) ||
          v.description.toLowerCase().includes(dest)
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
    },
  }),

  search_users: defineOpsTool({
    name: "search_users",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.search_users.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.search_users,
    inputSchema: z.object({
      query: z.string().describe("Nama atau email pengguna yang dicari"),
    }),
    execute: async ({ query }, context) => {
      const q = String(query || "").trim();
      if (!q) {
        return {
          summary: "Tidak ada kata kunci pencarian pengguna yang diberikan.",
          data: [],
          citations: [],
        };
      }

      const escaped = q.replace(/[%_\\]/g, "\\$&");
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
        sourceId: `src-users-${encodeURIComponent(q)}`,
        title: `Pencarian Pengguna: '${q}'`,
        snippet: `Ditemukan ${sanitizedUsers.length} pengguna dengan kata kunci '${q}'.`,
        runId: context?.runId ?? "standalone-run",
        stepId: context?.stepId ?? "standalone-step",
        toolCallId: context?.toolCallId,
      });

      return {
        summary: `Ditemukan ${sanitizedUsers.length} pengguna dengan kata kunci '${q}'.`,
        data: sanitizedUsers,
        citations: [usersCitation],
      };
    },
  }),

  propose_create_token: defineOpsTool({
    name: "propose_create_token",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_create_token,
    inputSchema: z.object({
      courseIds: z.string().describe("Daftar ID mata kuliah dipisah koma (misal: kalkulus-1, fisika-dasar)"),
      capacity: z.string().describe("Kapasitas kuota anggota kelompok (angka 1 sampai 5)"),
      packageType: z.string().optional().describe("Tipe paket (opsional, default: reguler_15)"),
    }),
    execute: async ({ courseIds, capacity, packageType }, context) => {
      const rawCourses = String(courseIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const cap = Math.max(1, Math.min(5, parseInt(String(capacity || "5"), 10) || 5));
      const pkg = String(packageType || "reguler_15");

      if (rawCourses.length === 0) {
        return {
          summary: "Gagal menyiapkan proposal: Setidaknya satu ID mata kuliah harus ditentukan.",
          data: { error: "COURSE_IDS_REQUIRED" },
        };
      }

      const runId = context?.runId ?? `run-${randomUUID()}`;
      const stepId = context?.stepId ?? `step-${randomUUID()}`;

      const preview: OpsAiProposalPreview = {
        summary: `1 token pendaftaran (${rawCourses.join(", ")}, kuota ${cap} orang, ${pkg})`,
        targetEntity: rawCourses.join(", "),
        fields: [
          { label: "Mata Kuliah", value: rawCourses.join(", ") },
          { label: "Kapasitas Kelompok", value: `${cap} orang` },
          { label: "Tipe Paket", value: pkg },
        ],
      };

      const { publicProposal } = await proposalStore.createProposal({
        runId,
        stepId,
        type: "create_token",
        title: "Buat Token Aktivasi Pendaftaran",
        description: `Membuat 1 token pendaftaran baru untuk ${rawCourses.length} mata kuliah dengan kapasitas kelompok ${cap} orang.`,
        preview,
        payload: {
          courseIds: rawCourses,
          capacity: cap,
          packageType: pkg,
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
    },
  }),

  propose_batch_create_chapters: defineOpsTool({
    name: "propose_batch_create_chapters",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_batch_create_chapters.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_batch_create_chapters,
    inputSchema: z.object({
      courseId: z.string().describe("ID atau slug mata kuliah (misal: 'fisika-dasar-1')"),
      chapters: z.array(
        z.object({
          title: z.string().describe("Judul bab materi"),
          orderIndex: z.number().optional().describe("Nomor urut bab"),
          description: z.string().optional().describe("Deskripsi singkat bab"),
        })
      ).min(1).describe("Daftar bab materi yang akan dibuat"),
    }),
    execute: async ({ courseId, chapters }, context) => {
      const cleanCourseId = String(courseId || "").trim().toLowerCase();
      if (!cleanCourseId) {
        return {
          summary: "Gagal menyiapkan proposal: ID mata kuliah wajib disertakan.",
          data: { error: "COURSE_ID_REQUIRED" },
        };
      }
      if (!Array.isArray(chapters) || chapters.length === 0) {
        return {
          summary: "Gagal menyiapkan proposal: Daftar bab tidak boleh kosong.",
          data: { error: "CHAPTERS_REQUIRED" },
        };
      }

      const validChapters = chapters
        .map((ch, idx) => ({
          title: String(ch.title || "").trim(),
          orderIndex: typeof ch.orderIndex === "number" ? ch.orderIndex : idx + 1,
          description: ch.description ? String(ch.description).trim() : undefined,
        }))
        .filter((ch) => Boolean(ch.title));

      if (validChapters.length === 0) {
        return {
          summary: "Gagal menyiapkan proposal: Tidak ada bab dengan judul yang valid.",
          data: { error: "VALID_CHAPTERS_REQUIRED" },
        };
      }

      const runId = context?.runId ?? `run-${randomUUID()}`;
      const stepId = context?.stepId ?? `step-${randomUUID()}`;

      const chapterTitlesPreview = validChapters
        .slice(0, 5)
        .map((c) => `${c.orderIndex}. ${c.title}`)
        .join(", ");
      const moreSuffix = validChapters.length > 5 ? `, dan ${validChapters.length - 5} bab lainnya` : "";

      const preview: OpsAiProposalPreview = {
        summary: `Pembuatan ${validChapters.length} bab materi untuk mata kuliah '${cleanCourseId}'`,
        targetEntity: cleanCourseId,
        fields: [
          { label: "Mata Kuliah", value: cleanCourseId },
          { label: "Jumlah Bab", value: `${validChapters.length} bab` },
          { label: "Daftar Bab", value: `${chapterTitlesPreview}${moreSuffix}` },
        ],
      };

      const { publicProposal } = await proposalStore.createProposal({
        runId,
        stepId,
        type: "batch_create_chapters",
        title: `Buat ${validChapters.length} Bab Materi Massal`,
        description: `Membuat ${validChapters.length} bab materi baru untuk mata kuliah '${cleanCourseId}'.`,
        preview,
        payload: {
          courseId: cleanCourseId,
          chapters: validChapters,
        },
        preconditions: {
          version: 1,
          stateFingerprint: `course:${cleanCourseId}:chapters:${validChapters.length}`,
        },
        actorId: context?.actorId ?? (context?.callerRole === "admin" ? "admin" : undefined),
      });

      return {
        summary: `Proposal pembuatan ${validChapters.length} bab materi telah disiapkan (ID: ${publicProposal.id}). Menunggu konfirmasi admin.`,
        data: {
          proposalId: publicProposal.id,
          type: publicProposal.type,
          preview: publicProposal.preview,
        },
        proposal: publicProposal,
      };
    },
  }),

  propose_bulk_update_materials: defineOpsTool({
    name: "propose_bulk_update_materials",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_bulk_update_materials.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.propose_bulk_update_materials,
    inputSchema: z.object({
      materialIds: z.array(z.string()).min(1).describe("Daftar ID berkas materi kuliah yang akan diubah"),
      patch: z.object({
        title: z.string().optional().describe("Judul berkas baru"),
        type: z.enum(["materi", "soal", "pembahasan_soal", "materi_kelas", "contoh_soal"]).optional().describe("Tipe dokumen"),
        subcategory: z.enum(["materi_dosen", "scl", "modul", "ebook", "kuis", "kbf", "tutorial", "uts", "uas", "lainnya"]).nullable().optional().describe("Subkategori dokumen"),
        year: z.number().nullable().optional().describe("Tahun dokumen"),
        chapterIds: z.array(z.string()).optional().describe("Daftar ID bab baru penugasan berkas"),
        addChapterIds: z.array(z.string()).optional().describe("Daftar ID bab tambahan"),
        removeChapterIds: z.array(z.string()).optional().describe("Daftar ID bab yang dilepas"),
      }).describe("Perubahan metadata yang akan diterapkan"),
    }),
    execute: async ({ materialIds, patch }, context) => {
      const cleanIds = Array.from(new Set((materialIds || []).map((id) => String(id).trim()).filter(Boolean)));
      if (cleanIds.length === 0) {
        return {
          summary: "Gagal menyiapkan proposal: Setidaknya satu ID materi harus ditentukan.",
          data: { error: "MATERIAL_IDS_REQUIRED" },
        };
      }

      const runId = context?.runId ?? `run-${randomUUID()}`;
      const stepId = context?.stepId ?? `step-${randomUUID()}`;

      const changedFields: Array<{ label: string; value: string }> = [
        { label: "Target Berkas", value: `${cleanIds.length} berkas (${cleanIds.slice(0, 3).join(", ")}${cleanIds.length > 3 ? "..." : ""})` },
      ];
      if (patch.title) changedFields.push({ label: "Judul Baru", value: patch.title });
      if (patch.type) changedFields.push({ label: "Tipe Baru", value: patch.type });
      if (patch.subcategory !== undefined) changedFields.push({ label: "Subkategori Baru", value: String(patch.subcategory ?? "null") });
      if (patch.year !== undefined) changedFields.push({ label: "Tahun Baru", value: String(patch.year ?? "null") });
      if (patch.addChapterIds?.length) changedFields.push({ label: "Tambah Bab", value: patch.addChapterIds.join(", ") });
      if (patch.removeChapterIds?.length) changedFields.push({ label: "Hapus Bab", value: patch.removeChapterIds.join(", ") });
      if (patch.chapterIds?.length) changedFields.push({ label: "Set Relasi Bab", value: patch.chapterIds.join(", ") });

      const preview: OpsAiProposalPreview = {
        summary: `Pembaruan metadata untuk ${cleanIds.length} berkas materi`,
        targetEntity: cleanIds.join(", "),
        fields: changedFields,
      };

      const { publicProposal } = await proposalStore.createProposal({
        runId,
        stepId,
        type: "bulk_update_materials",
        title: `Pembaruan Metadata ${cleanIds.length} Berkas Materi`,
        description: `Menerapkan pembaruan metadata pada ${cleanIds.length} berkas materi kuliah.`,
        preview,
        payload: {
          materialIds: cleanIds,
          patch,
        },
        preconditions: {
          version: 1,
          stateFingerprint: `materials:${[...cleanIds].sort().join(",")}`,
        },
        actorId: context?.actorId ?? (context?.callerRole === "admin" ? "admin" : undefined),
      });

      return {
        summary: `Proposal pembaruan metadata ${cleanIds.length} berkas materi telah disiapkan (ID: ${publicProposal.id}). Menunggu konfirmasi admin.`,
        data: {
          proposalId: publicProposal.id,
          type: publicProposal.type,
          preview: publicProposal.preview,
        },
        proposal: publicProposal,
      };
    },
  }),

  // ─── 1. Academic & Curriculum ──────────────────────────────────────────────
  list_courses: defineOpsTool({
    name: "list_courses",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_courses.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_courses,
    inputSchema: z.object({
      search: z.string().optional().describe("Kata kunci pencarian nama atau ID mata kuliah"),
      category: z.string().optional().describe("Filter kategori mata kuliah"),
    }),
    execute: async (input) => {
      const res = await executeListCourses(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_chapters: defineOpsTool({
    name: "list_chapters",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_chapters.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_chapters,
    inputSchema: z.object({
      courseId: z.string().optional().describe("Filter berdasarkan ID mata kuliah (opsional)"),
      search: z.string().optional().describe("Kata kunci pencarian judul bab materi"),
    }),
    execute: async (input) => {
      const res = await executeListChapters(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_course: defineOpsTool({
    name: "create_course",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_course.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_course,
    inputSchema: z.object({
      id: z.string().describe("Slug unik huruf kecil dan strip (misal: 'fisika-dasar-1')"),
      title: z.string().describe("Nama lengkap mata kuliah"),
      category: z.string().describe("Kategori mata kuliah (misal: Matematika, Fisika, Umum)"),
      description: z.string().optional().describe("Deskripsi mata kuliah"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateCourse(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  update_course: defineOpsTool({
    name: "update_course",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_course.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_course,
    inputSchema: z.object({
      id: z.string().describe("ID mata kuliah yang diubah"),
      title: z.string().optional().describe("Nama baru mata kuliah"),
      category: z.string().optional().describe("Kategori baru"),
      description: z.string().optional().describe("Deskripsi baru"),
    }),
    execute: async (input, context) => {
      const res = await executeUpdateCourse(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  batch_create_chapters: defineOpsTool({
    name: "batch_create_chapters",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.batch_create_chapters.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.batch_create_chapters,
    inputSchema: z.object({
      courseId: z.string().describe("ID mata kuliah"),
      chapters: z.array(
        z.object({
          title: z.string().describe("Judul bab"),
          orderIndex: z.number().optional().describe("Nomor urut bab"),
          description: z.string().optional().describe("Deskripsi bab"),
        })
      ).describe("Daftar bab yang dibuat"),
    }),
    execute: async (input, context) => {
      const res = await executeBatchCreateChapters(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  update_chapter: defineOpsTool({
    name: "update_chapter",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_chapter.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_chapter,
    inputSchema: z.object({
      chapterId: z.string().describe("ID bab yang diubah"),
      title: z.string().optional().describe("Judul baru bab"),
      orderIndex: z.number().optional().describe("Nomor urut baru"),
    }),
    execute: async (input, context) => {
      const res = await executeUpdateChapter(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_materials: defineOpsTool({
    name: "list_materials",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_materials.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_materials,
    inputSchema: z.object({
      courseId: z.string().describe("ID mata kuliah"),
      chapterId: z.string().optional().describe("ID bab (opsional)"),
    }),
    execute: async (input) => {
      const res = await executeListMaterials(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  bulk_update_materials: defineOpsTool({
    name: "bulk_update_materials",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.bulk_update_materials.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.bulk_update_materials,
    inputSchema: z.object({
      materialIds: z.array(z.string()).describe("Daftar ID berkas materi"),
      patch: z.record(z.string(), z.unknown()).describe("Objek patch metadata yang diubah"),
    }),
    execute: async (input, context) => {
      const res = await executeBulkUpdateMaterials(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  audit_course_completeness: defineOpsTool({
    name: "audit_course_completeness",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.audit_course_completeness.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.audit_course_completeness,
    inputSchema: z.object({
      courseId: z.string().describe("ID mata kuliah yang ingin diaudit"),
    }),
    execute: async (input) => {
      const res = await executeAuditCourseCompleteness(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  // ─── 2. Assessment & Questions ─────────────────────────────────────────────
  list_quizzes: defineOpsTool({
    name: "list_quizzes",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_quizzes.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_quizzes,
    inputSchema: z.object({
      courseId: z.string().optional().describe("Filter ID mata kuliah"),
      status: z.enum(["draft", "published"]).optional().describe("Status kuis"),
      search: z.string().optional().describe("Kata kunci pencarian judul kuis"),
    }),
    execute: async (input) => {
      const res = await executeListQuizzes(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_quiz: defineOpsTool({
    name: "create_quiz",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_quiz.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_quiz,
    inputSchema: z.object({
      courseId: z.string().describe("ID mata kuliah"),
      title: z.string().describe("Judul kuis"),
      durationMinutes: z.number().optional().describe("Durasi pengerjaan dalam menit"),
      category: z.string().optional().describe("Kategori kuis: daily, weekly, chapter, simulation"),
      questionIds: z.array(z.string()).optional().describe("Daftar ID soal dari bank soal"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateQuiz(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  update_quiz: defineOpsTool({
    name: "update_quiz",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_quiz.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_quiz,
    inputSchema: z.object({
      quizId: z.string().describe("ID kuis"),
      patch: z.object({
        title: z.string().optional().describe("Judul baru"),
        durationMinutes: z.number().optional().describe("Durasi baru (menit)"),
        status: z.string().optional().describe("Status: draft atau published"),
      }).describe("Objek perubahan kuis"),
    }),
    execute: async (input, context) => {
      const res = await executeUpdateQuiz(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_questions: defineOpsTool({
    name: "list_questions",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_questions.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_questions,
    inputSchema: z.object({
      courseId: z.string().optional().describe("Filter ID mata kuliah"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Tingkat kesulitan"),
      reviewStatus: z.string().optional().describe("Status kurasi (generated, reviewed, published)"),
      search: z.string().optional().describe("Kata kunci pencarian teks soal"),
    }),
    execute: async (input) => {
      const res = await executeListQuestions(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_question: defineOpsTool({
    name: "create_question",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_question.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_question,
    inputSchema: z.object({
      courseId: z.string().describe("ID mata kuliah"),
      prompt: z.string().describe("Teks soal (mendukung LaTeX)"),
      options: z.array(z.string()).describe("Pilihan jawaban (minimal 2 opsi)"),
      correctAnswer: z.string().describe("Kunci jawaban benar"),
      difficulty: z.string().optional().describe("easy, medium, atau hard"),
      explanation: z.string().optional().describe("Pembahasan soal"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateQuestion(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  publish_question: defineOpsTool({
    name: "publish_question",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.publish_question.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.publish_question,
    inputSchema: z.object({
      questionId: z.string().describe("ID soal yang ingin dipublikasikan"),
    }),
    execute: async (input, context) => {
      const res = await executePublishQuestion(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  get_quiz_insights: defineOpsTool({
    name: "get_quiz_insights",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_quiz_insights.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_quiz_insights,
    inputSchema: z.object({
      quizId: z.string().describe("ID kuis"),
    }),
    execute: async (input) => {
      const res = await executeGetQuizInsights(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  reset_quiz_attempt: defineOpsTool({
    name: "reset_quiz_attempt",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.reset_quiz_attempt.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.reset_quiz_attempt,
    inputSchema: z.object({
      attemptId: z.string().optional().describe("ID percobaan kuis yang ingin direset"),
      userId: z.string().optional().describe("ID pengguna / murid"),
      quizId: z.string().optional().describe("ID kuis"),
      reason: z.string().describe("Alasan reset percobaan kuis"),
    }),
    execute: async (input, context) => {
      const res = await executeResetQuizAttempt(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  // ─── 3. Schedules & Meet ───────────────────────────────────────────────────
  list_schedules: defineOpsTool({
    name: "list_schedules",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_schedules.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_schedules,
    inputSchema: z.object({
      startDate: z.string().optional().describe("Filter tanggal mulai (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Filter tanggal akhir (YYYY-MM-DD)"),
      courseId: z.string().optional().describe("Filter ID mata kuliah"),
      status: z.string().optional().describe("Filter status sesi (scheduled, completed, cancelled)"),
    }),
    execute: async (input) => {
      const res = await executeListSchedules(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_meet_session: defineOpsTool({
    name: "create_meet_session",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_meet_session.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_meet_session,
    inputSchema: z.object({
      tutorId: z.string().describe("ID tutor yang ditugaskan"),
      courseId: z.string().describe("ID mata kuliah"),
      dateIso: z.string().describe("Tanggal sesi (YYYY-MM-DD)"),
      timeSlot: z.string().describe("Waktu sesi (misal: '09:00 - 10:30')"),
      groupId: z.string().optional().describe("ID kelompok belajar (opsional)"),
      topic: z.string().optional().describe("Topik diskusi sesi tutorial"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateMeetSession(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  reschedule_or_cancel_meet: defineOpsTool({
    name: "reschedule_or_cancel_meet",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.reschedule_or_cancel_meet.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.reschedule_or_cancel_meet,
    inputSchema: z.object({
      bookingId: z.string().describe("ID sesi booking"),
      action: z.string().describe("reschedule atau cancel"),
      newDateIso: z.string().optional().describe("Tanggal baru bila reschedule"),
      newTimeSlot: z.string().optional().describe("Waktu baru bila reschedule"),
      reason: z.string().optional().describe("Alasan perubahan/pembatalan"),
    }),
    execute: async (input, context) => {
      const res = await executeRescheduleOrCancelMeet(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_tutor_availability: defineOpsTool({
    name: "list_tutor_availability",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_tutor_availability.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_tutor_availability,
    inputSchema: z.object({
      tutorId: z.string().optional().describe("ID tutor (opsional)"),
    }),
    execute: async (input) => {
      const res = await executeListTutorAvailability(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  // ─── 4. Study Groups & Tokens ──────────────────────────────────────────────
  list_study_groups: defineOpsTool({
    name: "list_study_groups",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_study_groups.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_study_groups,
    inputSchema: z.object({
      courseId: z.string().optional().describe("Filter ID mata kuliah"),
      search: z.string().optional().describe("Kata kunci pencarian nama kelompok"),
      hasTutor: z.boolean().optional().describe("Filter kelompok yang sudah/belum punya tutor"),
    }),
    execute: async (input) => {
      const res = await executeListStudyGroups(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_study_group: defineOpsTool({
    name: "create_study_group",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_study_group.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_study_group,
    inputSchema: z.object({
      name: z.string().describe("Nama kelompok belajar"),
      courseIds: z.array(z.string()).describe("Daftar ID mata kuliah"),
      capacity: z.number().optional().describe("Kapasitas kuota anggota (1-5)"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateStudyGroup(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  assign_tutor_to_group: defineOpsTool({
    name: "assign_tutor_to_group",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.assign_tutor_to_group.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.assign_tutor_to_group,
    inputSchema: z.object({
      groupId: z.string().describe("ID kelompok belajar"),
      tutorId: z.string().describe("ID tutor pendamping"),
    }),
    execute: async (input, context) => {
      const res = await executeAssignTutorToGroup(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_enrollment_token: defineOpsTool({
    name: "create_enrollment_token",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_enrollment_token.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_enrollment_token,
    inputSchema: z.object({
      courseIds: z.array(z.string()).describe("Daftar ID mata kuliah"),
      capacity: z.number().describe("Kapasitas kuota anggota (1 sampai 5 orang)"),
      packageType: z.string().optional().describe("Tipe paket (opsional, default: reguler_15)"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateEnrollmentToken(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_enrollment_tokens: defineOpsTool({
    name: "list_enrollment_tokens",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_enrollment_tokens.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_enrollment_tokens,
    inputSchema: z.object({
      status: z.enum(["active", "exhausted", "expired"]).optional().describe("Filter status token"),
    }),
    execute: async (input) => {
      const res = await executeListEnrollmentTokens(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  diagnose_student_access: defineOpsTool({
    name: "diagnose_student_access",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.diagnose_student_access.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.diagnose_student_access,
    inputSchema: z.object({
      userIdentifier: z.string().describe("Nama, email, atau ID pengguna murid yang ingin didiagnosa"),
      courseId: z.string().optional().describe("ID mata kuliah untuk evaluasi akses khusus (opsional)"),
    }),
    execute: async (input) => {
      const res = await executeDiagnoseStudentAccess(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  // ─── 5. Users, Notifications & Operations ──────────────────────────────────
  update_user_role: defineOpsTool({
    name: "update_user_role",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_user_role.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.update_user_role,
    inputSchema: z.object({
      userId: z.string().describe("ID pengguna"),
      roles: z.array(z.string()).describe("Daftar peran baru (admin, tutor, murid)"),
    }),
    execute: async (input, context) => {
      const res = await executeUpdateUserRole(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  toggle_user_status: defineOpsTool({
    name: "toggle_user_status",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.toggle_user_status.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.toggle_user_status,
    inputSchema: z.object({
      userId: z.string().describe("ID pengguna"),
      status: z.string().describe("Status akun: active atau suspended"),
      reason: z.string().optional().describe("Alasan perubahan status"),
    }),
    execute: async (input, context) => {
      const res = await executeToggleUserStatus(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  send_broadcast_notification: defineOpsTool({
    name: "send_broadcast_notification",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.send_broadcast_notification.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.send_broadcast_notification,
    inputSchema: z.object({
      title: z.string().describe("Judul notifikasi"),
      body: z.string().describe("Isi pesan notifikasi"),
      target: z.string().optional().describe("Target penerima: all, course, atau group"),
      targetId: z.string().optional().describe("ID spesifik jika target course atau group"),
      link: z.string().optional().describe("Tautan URL ketika notifikasi diklik"),
    }),
    execute: async (input, context) => {
      const res = await executeSendBroadcastNotification(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_pka_registrations: defineOpsTool({
    name: "list_pka_registrations",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_pka_registrations.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_pka_registrations,
    inputSchema: z.object({
      search: z.string().optional().describe("Kata kunci pencarian nama atau email pendaftar PKA"),
    }),
    execute: async (input) => {
      const res = await executeListPkaRegistrations(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_pka_announcement: defineOpsTool({
    name: "create_pka_announcement",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_announcement.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_announcement,
    inputSchema: z.object({
      title: z.string().describe("Judul pengumuman PKA"),
      content: z.string().describe("Isi pengumuman"),
      isPinned: z.boolean().optional().describe("Sematkan pengumuman di atas"),
    }),
    execute: async (input, context) => {
      const res = await executeCreatePkaAnnouncement(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_pka_schedule: defineOpsTool({
    name: "create_pka_schedule",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_schedule.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_pka_schedule,
    inputSchema: z.object({
      title: z.string().describe("Judul kegiatan PKA"),
      sessionAt: z.string().describe("Waktu sesi (YYYY-MM-DD HH:mm atau format ISO)"),
      meetLink: z.string().optional().describe("Link Google Meet sesi PKA"),
    }),
    execute: async (input, context) => {
      const res = await executeCreatePkaSchedule(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_forms: defineOpsTool({
    name: "list_forms",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_forms.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_forms,
    inputSchema: z.object({
      category: z.string().optional().describe("Filter kategori form"),
      search: z.string().optional().describe("Kata kunci pencarian nama form"),
    }),
    execute: async (input) => {
      const res = await executeListForms(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_or_update_form: defineOpsTool({
    name: "create_or_update_form",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_or_update_form.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_or_update_form,
    inputSchema: z.object({
      formId: z.string().optional().describe("ID form jika mengedit form lama"),
      slug: z.string().describe("Slug URL form (/f/[slug])"),
      title: z.string().describe("Judul formulir"),
      category: z.string().optional().describe("survey, quiz, feedback, registration"),
      description: z.string().optional().describe("Keterangan formulir"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateOrUpdateForm(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  get_form_responses_summary: defineOpsTool({
    name: "get_form_responses_summary",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_form_responses_summary.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_form_responses_summary,
    inputSchema: z.object({
      formId: z.string().describe("ID formulir"),
    }),
    execute: async (input) => {
      const res = await executeGetFormResponsesSummary(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  list_blog_articles: defineOpsTool({
    name: "list_blog_articles",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_blog_articles.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.list_blog_articles,
    inputSchema: z.object({
      status: z.enum(["published", "draft"]).optional().describe("Status artikel"),
      search: z.string().optional().describe("Kata kunci judul artikel"),
    }),
    execute: async (input) => {
      const res = await executeListBlogArticles(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_blog_article: defineOpsTool({
    name: "create_blog_article",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_blog_article.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_blog_article,
    inputSchema: z.object({
      title: z.string().describe("Judul artikel blog"),
      content: z.string().describe("Konten teks artikel (format Markdown)"),
      category: z.string().optional().describe("tips_kuliah, pojok_kampus, fakta_seru, kegiatan_zyx"),
      status: z.string().optional().describe("draft atau published"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateBlogArticle(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  publish_blog_article: defineOpsTool({
    name: "publish_blog_article",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.publish_blog_article.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.publish_blog_article,
    inputSchema: z.object({
      articleId: z.string().describe("ID artikel blog"),
      publish: z.boolean().optional().describe("true untuk publikasikan, false untuk draf"),
    }),
    execute: async (input) => {
      const res = await executePublishBlogArticle(input as any);
      return { summary: res.summary, data: res.data };
    },
  }),

  get_feature_flags: defineOpsTool({
    name: "get_feature_flags",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_feature_flags.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.get_feature_flags,
    inputSchema: z.object({}),
    execute: async () => {
      const res = await executeGetFeatureFlags();
      return { summary: res.summary, data: res.data };
    },
  }),

  set_feature_flag: defineOpsTool({
    name: "set_feature_flag",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.set_feature_flag.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.set_feature_flag,
    inputSchema: z.object({
      flagKey: z.string().describe("Kunci feature flag (misal: 'FEATURE_PKA')"),
      enabled: z.boolean().describe("Status aktif (true) atau mati (false)"),
      reason: z.string().optional().describe("Alasan perubahan status"),
    }),
    execute: async (input, context) => {
      const res = await executeSetFeatureFlag(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  create_short_link: defineOpsTool({
    name: "create_short_link",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_short_link.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.create_short_link,
    inputSchema: z.object({
      slug: z.string().describe("Slug kustom (/s/[slug])"),
      url: z.string().describe("URL target lengkap"),
      title: z.string().optional().describe("Keterangan short link"),
    }),
    execute: async (input, context) => {
      const res = await executeCreateShortLink(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),

  trigger_ai_job: defineOpsTool({
    name: "trigger_ai_job",
    description: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.trigger_ai_job.description,
    security: ALL_OPS_AI_TOOL_SECURITY_REGISTRY.trigger_ai_job,
    inputSchema: z.object({
      jobType: z.string().describe("generate_questions, sync_rag, extract_ko"),
      courseId: z.string().describe("ID mata kuliah"),
    }),
    execute: async (input, context) => {
      const res = await executeTriggerAiJob(input as any, context?.actorId);
      return { summary: res.summary, data: res.data };
    },
  }),
};

// ============================================================================
// 4. Unified Dispatcher & AI SDK Tool Factory
// ============================================================================

/**
 * Executes a verified Ops AI tool via the unified tool registry.
 */
export async function executeOpsAiTool(
  name: string,
  input: Record<string, unknown>,
  context?: OpsAiToolContext
): Promise<OpsAiToolExecutionResult> {
  // Confirmation executor is strictly human-confirmed on UI, never callable via tool dispatcher
  if (name === "execute_confirmed_proposal") {
    throw new Error(`Tool '${name}' tidak diizinkan untuk dipanggil oleh model AI.`);
  }

  const toolDef = OPS_TOOL_DEFINITIONS[name];

  if (!toolDef) {
    throw new Error(`Tool '${name}' tidak terdaftar dalam katalog keamanan Ops AI.`);
  }

  if (context?.isModelCall && !toolDef.security.isModelCallable) {
    throw new Error(`Tool '${name}' tidak diizinkan untuk dipanggil oleh model AI.`);
  }

  if (toolDef.security.toolClass === "autonomous-mutation" && context?.callerRole !== "admin") {
    throw new Error(`Forbidden: Mutasi otonom '${name}' hanya dapat dipanggil oleh sesi admin.`);
  }

  return toolDef.execute(input, context);
}

/**
 * Creates native AI SDK 6 tool definitions configured with the caller context.
 * Only tools marked isModelCallable: true are exposed to the model.
 */
export function createOpsAiTools(context?: OpsAiToolContext): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [name, def] of Object.entries(OPS_TOOL_DEFINITIONS)) {
    if (def.security.isModelCallable) {
      tools[name] = def.toAiSdkTool(context);
    }
  }

  return tools;
}

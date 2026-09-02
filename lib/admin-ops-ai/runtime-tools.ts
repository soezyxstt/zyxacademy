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
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import type { CanonicalVectorProvider } from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";

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

  if (classification.allowsMutation) {
    throw new Error(`Security Violation: Model-callable tool '${name}' tidak boleh menjalankan mutasi.`);
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

      const citations: OpsAiCitation[] = retrieval.results.map((result) =>
        buildSemanticRagCitation(result, {
          runId: context?.runId ?? "standalone-run",
          stepId: context?.stepId ?? "standalone-step",
          toolCallId: context?.toolCallId,
          availability: (result.availability as OpsAiCitationAvailability) ?? "available",
        })
      );

      return {
        summary: `Ditemukan ${retrieval.results.length} sumber dokumentasi relevan untuk '${query}'.`,
        data: retrieval.results,
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
  };
}

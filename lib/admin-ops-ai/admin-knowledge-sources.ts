import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  AdminKnowledgeSecurityError,
  type AdminKnowledgeSourceType,
} from "./admin-knowledge-contracts";
import { KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags";
import { OPS_AI_TOOL_SECURITY_REGISTRY } from "@/lib/admin-ops-ai/contracts";

/**
 * Curated Source Registry for Admin Ops Knowledge.
 *
 * Enforces strict allowlisting, secret-path rejection, and safe structural
 * projections for database schemas, feature flags, admin routes, and tools.
 */

export interface CuratedSourceDefinition {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceType: AdminKnowledgeSourceType;
  readonly title: string;
  readonly isVirtual?: boolean;
}

export interface CuratedSourceContent {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceType: AdminKnowledgeSourceType;
  readonly title: string;
  readonly rawContent: string;
  readonly normalizedContent: string;
  readonly contentHash: string;
  readonly isVirtual: boolean;
}

/**
 * Authoritative Curated Allowlist for Admin Ops Knowledge.
 * Only files and virtual projections explicitly listed here are ingested.
 */
export const CURATED_ADMIN_KNOWLEDGE_ALLOWLIST: readonly CuratedSourceDefinition[] = [
  // 1. Core Documentation
  {
    id: "doc:architecture",
    sourcePath: "docs/ARCHITECTURE.md",
    sourceType: "doc",
    title: "Architecture and System Boundaries",
  },
  {
    id: "doc:features",
    sourcePath: "docs/features.md",
    sourceType: "doc",
    title: "Product Features and Workflows",
  },
  {
    id: "doc:db_schema",
    sourcePath: "docs/DB_SCHEMA.md",
    sourceType: "doc",
    title: "Database Schema and Catalog Reference",
  },
  {
    id: "doc:development",
    sourcePath: "docs/DEVELOPMENT.md",
    sourceType: "doc",
    title: "Development Guide and Feature Flags",
  },
  {
    id: "doc:deployment",
    sourcePath: "docs/DEPLOYMENT.md",
    sourceType: "doc",
    title: "Deployment Topology and Infrastructure",
  },

  // 2. Active Operations Runbooks & Checklists
  {
    id: "doc:production_readiness_checklist",
    sourcePath: "docs/operations/production-readiness-checklist.md",
    sourceType: "runbook",
    title: "Production Readiness Checklist",
  },
  {
    id: "doc:zyra_ops_runbooks",
    sourcePath: "docs/operations/zyra-ops-runbooks.md",
    sourceType: "runbook",
    title: "Zyra AI Operations Runbooks and Incident Handling",
  },

  // 3. Active Bundle Contracts
  {
    id: "doc:bundle_authoring_context_pack_v1",
    sourcePath: "docs/bundle/authoring-context-pack-v1.md",
    sourceType: "bundle_contract",
    title: "Authoring Context Pack V1 Contract",
  },
  {
    id: "doc:bundle_authoring_job_pack_v1",
    sourcePath: "docs/bundle/authoring-job-pack-v1.md",
    sourceType: "bundle_contract",
    title: "Authoring Job Pack V1 Contract",
  },
  {
    id: "doc:bundle_idea_bundle_v3",
    sourcePath: "docs/bundle/idea-bundle-v3.md",
    sourceType: "bundle_contract",
    title: "Idea Bundle V3 Contract",
  },
  {
    id: "doc:bundle_product_bundle_v3",
    sourcePath: "docs/bundle/product-bundle-v3.md",
    sourceType: "bundle_contract",
    title: "Product Bundle V3 Contract",
  },

  // 4. Safe Structural Projections & Catalogs
  {
    id: "projection:db_schema",
    sourcePath: "virtual:schema_projection",
    sourceType: "schema_projection",
    title: "Database Schema Structural Projection",
    isVirtual: true,
  },
  {
    id: "catalog:feature_flags",
    sourcePath: "virtual:feature_flags_catalog",
    sourceType: "catalog",
    title: "Feature Flags Catalog",
    isVirtual: true,
  },
  {
    id: "catalog:admin_routes",
    sourcePath: "virtual:admin_routes_catalog",
    sourceType: "catalog",
    title: "Admin Routes and Sitemap Catalog",
    isVirtual: true,
  },
  {
    id: "catalog:ops_ai_tools",
    sourcePath: "virtual:ops_ai_tools_catalog",
    sourceType: "catalog",
    title: "Admin Ops AI Tools Security Catalog",
    isVirtual: true,
  },
] as const;

/**
 * Forbidden path patterns that must be rejected unconditionally.
 */
const FORBIDDEN_PATH_PATTERNS = [
  /^\.?env/i,
  /\.env(\.|$)/i,
  /secret/i,
  /credential/i,
  /id_rsa/i,
  /cookie/i,
  /session/i,
  /token/i,
  /password/i,
  /private[._-]?key/i,
  /^node_modules\//i,
  /^\.git\//i,
  /^\.gemini\//i,
  /^plans\//i,
  /^docs\/audit\//i,
  /^docs\/handoffs\//i,
  /^artifacts\//i,
  /^tests\//i,
  /^scripts\//i,
  /^\.next\//i,
  /^dist\//i,
  /^tmp\//i,
];

/**
 * Normalizes a file path for security validation.
 */
export function normalizeSourcePath(rawPath: string): string {
  const sanitized = rawPath.replace(/\\/g, "/").trim().replace(/^\.\//, "");
  return sanitized;
}

/**
 * Checks if a given path is allowed for Admin Ops Knowledge ingestion.
 */
export function isPathAllowedForAdminKnowledge(rawPath: string): boolean {
  const normalized = normalizeSourcePath(rawPath);

  // 1. Check against forbidden patterns
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // 2. Check if present in explicit allowlist
  return CURATED_ADMIN_KNOWLEDGE_ALLOWLIST.some(
    (item) => item.sourcePath === normalized
  );
}

/**
 * Asserts that a given path is explicitly allowed for Admin Ops Knowledge ingestion.
 * Throws AdminKnowledgeSecurityError on violation.
 */
export function assertPathAllowedForAdminKnowledge(rawPath: string): void {
  const normalized = normalizeSourcePath(rawPath);

  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new AdminKnowledgeSecurityError(
        "FORBIDDEN_SOURCE_PATH",
        `Access to path '${rawPath}' is forbidden: matches sensitive or excluded pattern '${pattern.source}'.`,
        { path: rawPath, normalized, pattern: pattern.source }
      );
    }
  }

  const isAllowed = CURATED_ADMIN_KNOWLEDGE_ALLOWLIST.some(
    (item) => item.sourcePath === normalized
  );

  if (!isAllowed) {
    throw new AdminKnowledgeSecurityError(
      "UNREGISTERED_SOURCE_PATH",
      `Path '${rawPath}' is not registered in the curated Admin Ops Knowledge allowlist.`,
      { path: rawPath, normalized }
    );
  }
}

/**
 * Generates a safe markdown projection of the database schema without exposing raw code or credentials.
 */
export function generateDbSchemaProjection(): string {
  return `# Database Schema Structural Projection

This document provides a safe, structured architectural summary of the database tables, columns, primary keys, and relationships in Zyx Academy.

## Core Identity and Access
- **user**: Primary Better Auth identity table. Columns: id (text, PK), name (text), email (text, unique), emailVerified (boolean), role (text), lastActivityAt (timestamp), createdAt (timestamp), updatedAt (timestamp).
- **pengguna**: Canonical domain user identity linked to user.id. Status: active | suspended.
- **peran**: Access role definitions. Role codes: admin | tutor | murid.
- **pengguna_peran**: Independent many-to-many role assignments for domain identities.

## Academic & Course Structure
- **courses**: Course / curriculum modules. Columns: id (text, PK slug), title (text), description (text), semester (integer), published (boolean), canonicalContent (text).
- **chapters**: Chapters within courses. Linked to courseId.
- **master_teaching_documents**: Authoritative master teaching documents (MTD) per chapter.
- **knowledge_objects**: Extracted granular concepts (KOs) linked to chapters and MTDs.
- **learning_objectives**: Educational goals with Bloom taxonomy cognitive levels.

## Evaluasi & Bank Soal
- **questions**: Assessment and quiz items with difficulty (easy | medium | hard), content, options JSON, correctAnswer.
- **itb_question_references**: Reference exam problems from historical test archives.
- **quizzes**: Chapter quizzes, practice exams, and diagnostic assessments.
- **quiz_attempts**: Student quiz participation records, answers, and scores.

## Kelompok Belajar & Token Aktivasi
- **groups**: Study groups formed by activation tokens.
- **enrollment_tokens**: Activation tokens formatted as \`Zyx-XXXXXXXX-{capacity}-{courseIds.length}\`. Capacity: 1 to 5 members. Linked to group and courses.
- **group_members**: Student memberships within study groups.

## Admin Ops & Knowledge Pipeline
- **admin_ops_knowledge_sources**: Catalog of curated operational documentation, runbooks, and schema projections.
- **admin_ops_knowledge_chunks**: Semantic vector chunks with heading hierarchy, character offsets, and content hashes.
- **admin_ops_knowledge_sync_queue**: Transactional queue for Inngest vector synchronization.
- **vector_sync_queue**: Transactional outbox for learning content vector synchronization to Cloudflare Vectorize.
- **export_spreadsheets**: Integration metadata for Google Spreadsheet sync.
- **search_documents**: Cross-entity lexical search index.
`;
}

/**
 * Generates a safe markdown catalog of feature flags.
 */
export function generateFeatureFlagsCatalog(): string {
  const lines: string[] = [
    "# Feature Flags Catalog",
    "",
    "Daftar feature flags resmi Zyx Academy beserta deskripsi, kategori, dan aturan konfigurasinya.",
    "",
    "| Key | Nama Fitur | Kategori | Deskripsi |",
    "|---|---|---|---|",
  ];

  for (const flag of KNOWN_FEATURE_FLAGS) {
    lines.push(
      `| \`${flag.key}\` | ${flag.name} | ${flag.categoryLabel} | ${flag.description} |`
    );
  }

  lines.push("");
  lines.push("### Panduan Operasional Flag");
  lines.push("- Flag aktif jika bernilai '1' atau 'true' di environment variables.");
  lines.push("- Flag default tidak aktif (false) jika tidak disetel.");
  lines.push("- Perubahan flag diatur melalui proposal aksi Ops AI atau file environment.");

  return lines.join("\n");
}

/**
 * Generates a safe markdown catalog of admin routes and navigation tabs.
 */
export function generateAdminRoutesCatalog(): string {
  return `# Admin Routes and Sitemap Catalog

Daftar halaman dan menu navigasi pada Admin Panel Zyx Academy (/admin).

## 1. Navigasi Utama
- **/admin** (Panel Admin): Dashboard ringkasan metriks pengguna, aktivitas, dan evaluasi.
- **/admin/blog** (Blog): Manajemen artikel blog publik, tips kuliah, dan kegiatan kampus.

## 2. Akademik & Konten
- **/admin/courses** (Mata Kuliah): Manajemen silabus, modul, dan materi kanonikal.
- **/admin/schedules** (Jadwal): Pengaturan jadwal sesi live, tutorial, dan ujian.
- **/admin/materials/review** (Review Materi): Antarmuka review materi unggahan tutor.
- **/admin/materials/manual** (Upload Manual): Unggah berkas dokumen silabus atau materi PDF.

## 3. Evaluasi & Bank Soal
- **/admin/questions** (Bank Soal): Manajemen bank soal, LaTeX, distraktor, dan kunci jawaban.
- **/admin/quizzes** (Kuis): Konfigurasi paket kuis, durasi, dan bobot penilaian.
- **/admin/leaderboard** (Papan Peringkat): Pantauan peringkat capaian belajar siswa.
- **/admin/quiz-insights** (Analisis Kuis): Analisis statistik butir soal dan tingkat kesulitan (Beta).
- **/admin/jobs** (Generasi Soal): Antrean background job pembuatan soal AI.
- **/admin/distractors** (Distraktor): Manajemen distraktor pilihan ganda berbasis AI (Beta).

## 4. Alat & Komunikasi
- **/admin/forms** (Form Studio): Pembuat kuesioner dan formulir dinamis.
- **/admin/meet** (Meet): Manajemen tautan ruang pertemuan kelas live.
- **/admin/media** (Pustaka Media): Manajemen berkas aset gambar dan dokumen Cloudflare R2.
- **/admin/tautan** (Tautan Publik): Tautan promosi dan pendaftaran eksternal.

## 5. Pengguna & Akses
- **/admin/users** (Pengguna): Manajemen akun pengguna, pencarian siswa, dan status peran.
- **/admin/groups** (Kelompok Belajar): Daftar kelompok belajar yang terbentuk dari token.
- **/admin/tokens** (Token Aktivasi): Pembuatan dan pemantauan kuota token kelompok.
- **/admin/notifications** (Notifikasi): Pengiriman pengumuman siaran kepada siswa.

## 6. Sistem & Ops
- **/admin/ops** (Monitor Ops): Monitor kesehatan server, antrean Inngest, dan status database.
- **/admin/ops/tutor-activity** (Aktivitas Tutor): Log keaktifan dan audit kinerja tutor.
- **/admin/ops/flags** (Feature Flags): Status dan konfigurasi flag fitur sistem.
- **/admin/ops/analytics** (Analitik Zyra): Statistik token, biaya, dan latensi asisten AI.
- **/admin/ops/keys** (API Keys): Pengelolaan kuota kunci Google Gemini AI.
`;
}

/**
 * Generates a safe markdown catalog of Ops AI tools and their security contracts.
 */
export function generateOpsAiToolsCatalog(): string {
  const lines: string[] = [
    "# Admin Ops AI Tools Security Catalog",
    "",
    "Katalog alat operasional AI Zyx Academy beserta klasifikasi keamanan dan izin eksekusinya.",
    "",
    "| Tool Name | Class | Model Callable | Required Role | Mutation Allowed | Description |",
    "|---|---|---|---|---|---|",
  ];

  for (const [name, tool] of Object.entries(OPS_AI_TOOL_SECURITY_REGISTRY)) {
    lines.push(
      `| \`${name}\` | ${tool.toolClass} | ${tool.isModelCallable ? "Yes" : "No"} | ${tool.requiredRole} | ${tool.allowsMutation ? "Yes" : "No"} | ${tool.description} |`
    );
  }

  lines.push("");
  lines.push("### Kebijakan Keamanan Ops AI");
  lines.push("1. Model AI tidak dapat memicu mutasi database langsung.");
  lines.push("2. Proposal kartu aksi wajib dikonfirmasi oleh admin sebelum dieksekusi.");
  lines.push("3. Semua pembacaan skema dan pencarian data menerapkan proyeksi kolom non-sensitif.");

  return lines.join("\n");
}

/**
 * Loads and normalizes content for a curated source definition.
 */
export async function loadCuratedSourceContent(
  def: CuratedSourceDefinition,
  baseDir: string = process.cwd()
): Promise<CuratedSourceContent> {
  let rawContent: string;

  if (def.isVirtual) {
    switch (def.id) {
      case "projection:db_schema":
        rawContent = generateDbSchemaProjection();
        break;
      case "catalog:feature_flags":
        rawContent = generateFeatureFlagsCatalog();
        break;
      case "catalog:admin_routes":
        rawContent = generateAdminRoutesCatalog();
        break;
      case "catalog:ops_ai_tools":
        rawContent = generateOpsAiToolsCatalog();
        break;
      default:
        throw new AdminKnowledgeSecurityError(
          "UNKNOWN_VIRTUAL_SOURCE",
          `Unknown virtual source ID '${def.id}'.`
        );
    }
  } else {
    assertPathAllowedForAdminKnowledge(def.sourcePath);
    const fullPath = path.resolve(baseDir, def.sourcePath);
    try {
      rawContent = await fs.readFile(fullPath, "utf-8");
    } catch (err) {
      throw new AdminKnowledgeSecurityError(
        "SOURCE_READ_FAILED",
        `Failed to read curated source file '${def.sourcePath}': ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Normalize line endings deterministically
  const normalizedContent = rawContent.replace(/\r\n/g, "\n");
  const contentHash = createHash("sha256").update(normalizedContent, "utf-8").digest("hex");

  return {
    id: def.id,
    sourcePath: def.sourcePath,
    sourceType: def.sourceType,
    title: def.title,
    rawContent,
    normalizedContent,
    contentHash,
    isVirtual: Boolean(def.isVirtual),
  };
}

/**
 * Loads all curated Admin Ops Knowledge sources.
 */
export async function loadAllCuratedAdminKnowledgeSources(
  baseDir: string = process.cwd()
): Promise<CuratedSourceContent[]> {
  const results: CuratedSourceContent[] = [];
  for (const def of CURATED_ADMIN_KNOWLEDGE_ALLOWLIST) {
    const source = await loadCuratedSourceContent(def, baseDir);
    results.push(source);
  }
  return results;
}

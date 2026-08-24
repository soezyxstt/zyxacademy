import { randomUUID } from "node:crypto";
import { searchDocs } from "./rag-store";
import { introspectDbSchema, getLiveSystemMetrics } from "./schema-introspection";
import { db } from "@/db";
import { user, courses } from "@/db/schema";
import { like, or, eq } from "drizzle-orm";
import { generateEnrollmentToken } from "@/app/(admin)/admin/(academic)/tokens/actions";
import { type OpsAiActionProposal, type ActionProposalType } from "./types";
import { KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags";


export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export const OPS_AI_TOOLS: ToolDefinition[] = [
  {
    name: "search_admin_docs",
    description: "Cari informasi mendalam dari dokumentasi teknis, fitur, arsitektur, dan runbook SOP Zyx Academy.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci atau topik pencarian (misal: token aktivasi, backup database, runbook cache)" },
      },
      required: ["query"],
    },
  },
  {
    name: "introspect_db_schema",
    description: "Membaca struktur tabel, kolom, tipe data, dan relasi basis data Zyx Academy.",
    parameters: {
      type: "object",
      properties: {
        tableName: { type: "string", description: "Nama tabel spesifik yang ingin diinspeksi (opsional, contoh: user, enrollment_tokens, questions)" },
      },
    },
  },
  {
    name: "get_live_system_metrics",
    description: "Mengambil statistik langsung ringkasan database (jumlah user, soal, token, pendaftar PKA) dan status feature flags.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "navigate_admin",
    description: "Mendapatkan link rute admin panel yang tepat untuk tujuan tertentu.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", description: "Nama fitur atau halaman yang dicari (misal: feature flags, token aktivasi, bank soal, pendaftar PKA)" },
      },
      required: ["destination"],
    },
  },
  {
    name: "search_users",
    description: "Mencari pengguna di sistem berdasarkan nama atau alamat email.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nama atau email pengguna yang dicari" },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_create_token",
    description: "Menyiapkan proposal kartu aksi untuk membuat token aktivasi kelas baru bagi kelompok belajar.",
    parameters: {
      type: "object",
      properties: {
        courseIds: { type: "string", description: "Daftar ID mata kuliah dipisah koma (misal: kalkulus-1,fisika-dasar)" },
        capacity: { type: "string", description: "Kapasitas kuota anggota kelompok (angka 1 sampai 5)" },
        packageType: { type: "string", description: "Tipe paket (opsional, default: reguler_15)" },
      },
      required: ["courseIds", "capacity"],
    },
  },
  {
    name: "propose_toggle_flag",
    description: "Menyiapkan proposal kartu aksi untuk mengaktifkan atau menonaktifkan feature flag.",
    parameters: {
      type: "object",
      properties: {
        flagKey: { type: "string", description: "Kunci feature flag (misal: FEATURE_PKA, FEATURE_LIVE, FEATURE_DIKTAT_AI)" },
        enabled: { type: "string", description: "Status target: 'true' untuk aktifkan, 'false' untuk matikan" },
        reason: { type: "string", description: "Alasan atau justifikasi perubahan flag" },
      },
      required: ["flagKey", "enabled"],
    },
  },
];

const ADMIN_SITEMAP: Record<string, { href: string; label: string; description: string }> = {
  dashboard: { href: "/admin", label: "Panel Admin", description: "Ringkasan metrik utama, status pendaftaran, dan aktivitas platform." },
  courses: { href: "/admin/courses", label: "Mata Kuliah", description: "Kelola silabus, bab materi kanonikal, dan daftar mata kuliah." },
  tokens: { href: "/admin/tokens", label: "Token Aktivasi", description: "Generate dan pantau token aktivasi pendaftaran grup belajar." },
  users: { href: "/admin/users", label: "Pengguna", description: "Kelola akun pengguna, peran (admin/tutor/student), dan status." },
  groups: { href: "/admin/groups", label: "Kelompok Belajar", description: "Daftar grup belajar siswa dan penugasan tutor." },
  questions: { href: "/admin/questions", label: "Bank Soal", description: "Kelola bank soal asesmen, kuis, LaTeX formula, dan opsi." },
  quizzes: { href: "/admin/quizzes", label: "Kuis", description: "Daftar kuis aktif dan jadwal pengerjaan siswa." },
  jobs: { href: "/admin/jobs", label: "Generasi Soal", description: "Antrean background job AI untuk pembuatan materi dan soal." },
  flags: { href: "/admin/ops/flags", label: "Feature Flags", description: "Kelola toggle runtime fitur opsional dan audit log." },
  ops: { href: "/admin/ops", label: "Monitor Ops", description: "Status server, runtime environment, dan health checklist." },
  analytics: { href: "/admin/ops/analytics", label: "Analitik Zyra", description: "Metrik performa model AI, latensi, dan penggunaan token." },
  pka: { href: "/admin/tutorial-pka/registrations", label: "Pendaftar PKA", description: "Verifikasi pendaftaran program Tutorial PKA gratis." },
};

/**
 * Execute read-only tools or generate proposals for mutating actions
 */
export async function executeToolCall(name: string, args: Record<string, any>): Promise<{
  summary: string;
  data?: unknown;
  proposal?: OpsAiActionProposal;
}> {
  switch (name) {
    case "search_admin_docs": {
      const query = String(args.query || "");
      const results = await searchDocs(query, 4);
      return {
        summary: `Ditemukan ${results.length} bagian dokumentasi relevan untuk '${query}'.`,
        data: results,
      };
    }

    case "introspect_db_schema": {
      const target = args.tableName ? String(args.tableName) : undefined;
      const schemaData = await introspectDbSchema(target);
      return {
        summary: `Skema database ${target ? `tabel '${target}'` : `${schemaData.tables.length} tabel utama`}.`,
        data: schemaData,
      };
    }

    case "get_live_system_metrics": {
      const metrics = await getLiveSystemMetrics();
      return {
        summary: `Metrik sistem: ${metrics.usersCount} pengguna, ${metrics.coursesCount} mata kuliah, ${metrics.questionsCount} soal, ${metrics.tokensCount} token, ${metrics.pkaRegistrationsCount} pendaftar PKA.`,
        data: metrics,
      };
    }

    case "navigate_admin": {
      const dest = String(args.destination || "").toLowerCase();
      const matched = Object.entries(ADMIN_SITEMAP).find(
        ([k, v]) => k.includes(dest) || v.label.toLowerCase().includes(dest) || v.description.toLowerCase().includes(dest)
      );
      if (matched) {
        return {
          summary: `Navigasi ke ${matched[1].label} (${matched[1].href}): ${matched[1].description}`,
          data: matched[1],
        };
      }
      return {
        summary: "Daftar navigasi halaman admin yang tersedia.",
        data: Object.values(ADMIN_SITEMAP),
      };
    }

    case "search_users": {
      const q = String(args.query || "").trim();
      const results = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(or(like(user.name, `%${q}%`), like(user.email, `%${q}%`)))
        .limit(6);

      return {
        summary: `Ditemukan ${results.length} pengguna dengan kata kunci '${q}'.`,
        data: results,
      };
    }

    case "propose_create_token": {
      const rawCourses = String(args.courseIds || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const capacity = Math.max(1, Math.min(5, parseInt(String(args.capacity || "5"), 10) || 5));
      const packageType = String(args.packageType || "reguler_15");

      const proposal: OpsAiActionProposal = {
        id: randomUUID(),
        type: "create_token",
        title: "Buat Token Aktivasi Pendaftaran",
        description: `Membuat 1 token pendaftaran baru untuk ${rawCourses.length} mata kuliah dengan kapasitas kelompok ${capacity} orang.`,
        params: {
          courseIds: rawCourses,
          capacity,
          packageType,
        },
        status: "pending",
      };

      return {
        summary: `Proposal pembuatan token disiapkan. Memerlukan konfirmasi admin.`,
        proposal,
      };
    }

    case "propose_toggle_flag": {
      const flagKey = String(args.flagKey || "").trim();
      const enabled = String(args.enabled || "").toLowerCase() === "true";
      const reason = String(args.reason || "Diubah melalui Zyx Ops AI");

      const proposal: OpsAiActionProposal = {
        id: randomUUID(),
        type: "toggle_flag" as ActionProposalType,
        title: `Ubah Feature Flag: ${flagKey}`,
        description: `Mengubah status feature flag '${flagKey}' menjadi ${enabled ? "AKTIF (true)" : "NONAKTIF (false)"}.`,
        params: {
          flagKey,
          enabled,
          reason,
        },
        status: "pending",
      };

      return {
        summary: `Proposal pengubahan feature flag disiapkan. Memerlukan konfirmasi admin.`,
        proposal,
      };
    }

    default:
      return {
        summary: `Tool '${name}' tidak dikenali.`,
      };
  }
}

/**
 * Execute proposal after explicit Admin confirmation click
 */
export async function executeConfirmedProposal(proposal: OpsAiActionProposal): Promise<{
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}> {
  if (proposal.type === "create_token") {
    const courseIds = (proposal.params.courseIds as string[]) || [];
    const capacity = Number(proposal.params.capacity) || 5;
    const packageType = (proposal.params.packageType as any) || "reguler_15";

    const res = await generateEnrollmentToken(courseIds, capacity, packageType);
    if (!res.success) {
      return { success: false, error: res.error || "Gagal membuat token" };
    }
    return {
      success: true,
      result: {
        token: (res as any).token,
        link: (res as any).link,
        capacity,
        message: "Token aktivasi berhasil dibuat.",
      },
    };
  }

  if (proposal.type === ("toggle_flag" as any) || proposal.type === "toggle_feature_flag") {
    const flagKey = String(proposal.params.flagKey);
    const enabled = Boolean(proposal.params.enabled);
    const matched = KNOWN_FEATURE_FLAGS.find((f) => f.key === flagKey);

    if (!matched) {
      return { success: false, error: `Feature flag '${flagKey}' tidak ditemukan dalam katalog resmi.` };
    }

    return {
      success: true,
      result: {
        flagKey,
        enabled,
        name: matched.name,
        envDirective: `${flagKey}=${enabled ? "1" : "0"}`,
        message: `Konfigurasi feature flag ${flagKey} disiapkan: ${flagKey}=${enabled ? "1" : "0"}.`,
      },
    };
  }

  return { success: false, error: `Tipe proposal '${proposal.type}' belum didukung untuk eksekusi otomatis.` };
}

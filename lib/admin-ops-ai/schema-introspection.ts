import { db } from "@/db";
import { sql, count } from "drizzle-orm";
import {
  user,
  courses,
  questions,
  enrollmentTokens,
  pkaRegistrations,
  groups,
  academicSchedules,
} from "@/db/schema";
import { KNOWN_FEATURE_FLAGS, getAllFeatureFlagsStatus } from "@/lib/feature-flags";

export interface SchemaTableInfo {
  tableName: string;
  description: string;
  columns: Array<{ name: string; type: string; isPrimary?: boolean; description?: string }>;
  relations: string[];
}

export const SCHEMA_DEFINITIONS: Record<string, SchemaTableInfo> = {
  user: {
    tableName: "user",
    description: "Tabel pengguna utama sistem Better Auth dan Zyx (role, email, name, image).",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "ID unik pengguna (UUID/string)" },
      { name: "name", type: "text", description: "Nama lengkap pengguna" },
      { name: "email", type: "text", description: "Alamat email terdaftar" },
      { name: "emailVerified", type: "boolean", description: "Status verifikasi email" },
      { name: "role", type: "text", description: "Peran pengguna (admin, tutor, student)" },
      { name: "image", type: "text", description: "URL avatar profil" },
      { name: "createdAt", type: "timestamp", description: "Waktu pembuatan akun" },
    ],
    relations: ["penggunaPeran", "enrollments", "groupMembers", "submissions"],
  },
  courses: {
    tableName: "courses",
    description: "Daftar mata kuliah / modul belajar di Zyx Academy.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "Slug unik mata kuliah (misal: kalkulus-1, fisika-dasar)" },
      { name: "title", type: "text", description: "Judul lengkap mata kuliah" },
      { name: "description", type: "text", description: "Deskripsi silabus dan ringkasan" },
      { name: "semester", type: "integer", description: "Tingkat semester target" },
      { name: "published", type: "boolean", description: "Status publikasi kursus" },
      { name: "canonicalContent", type: "text", description: "Konten kanonikal markdown terstruktur" },
    ],
    relations: ["enrollments", "questions", "groupCourses", "academicSchedules"],
  },
  enrollment_tokens: {
    tableName: "enrollment_tokens",
    description: "Token aktivasi pendaftaran grup belajar dan kelas.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "UUID token" },
      { name: "token", type: "text", description: "String token (Zyx-XXXXXXXX-{capacity}-{courses.length})" },
      { name: "capacity", type: "integer", description: "Kapasitas kuota anggota (1-5 orang)" },
      { name: "groupId", type: "text", description: "Relasi ke kelompok yang terbentuk" },
      { name: "createdAt", type: "timestamp", description: "Waktu dibuat" },
      { name: "expiresAt", type: "timestamp", description: "Waktu kedaluwarsa token" },
    ],
    relations: ["enrollmentTokenCourses", "groups"],
  },
  questions: {
    tableName: "questions",
    description: "Bank soal evaluasi, asesmen, dan kuis Zyx.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "ID soal" },
      { name: "courseId", type: "text", description: "ID course terkait" },
      { name: "content", type: "text", description: "Teks soal (mendukung LaTeX/markdown)" },
      { name: "difficulty", type: "text", description: "Tingkat kesulitan (easy, medium, hard)" },
      { name: "options", type: "json", description: "Pilihan jawaban ganda" },
      { name: "correctAnswer", type: "text", description: "Kunci jawaban yang benar" },
    ],
    relations: ["courses", "submissions"],
  },
  pka_registrations: {
    tableName: "pka_registrations",
    description: "Pendaftar program Tutorial PKA gratis dan status verifikasi bukti.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "ID pendaftaran" },
      { name: "userId", type: "text", description: "ID akun siswa pendaftar" },
      { name: "status", type: "text", description: "Status verifikasi (pending, approved, rejected)" },
      { name: "proofUrl", type: "text", description: "URL bukti follow / repost media sosial" },
      { name: "createdAt", type: "timestamp", description: "Waktu pendaftaran" },
    ],
    relations: ["user"],
  },
  groups: {
    tableName: "groups",
    description: "Kelompok belajar siswa yang terbentuk melalui token aktivasi.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "ID kelompok" },
      { name: "name", type: "text", description: "Nama kelompok belajar" },
      { name: "capacity", type: "integer", description: "Kapasitas maksimal" },
      { name: "createdAt", type: "timestamp", description: "Waktu dibentuk" },
    ],
    relations: ["groupMembers", "groupCourses", "enrollmentTokens"],
  },
  academic_schedules: {
    tableName: "academic_schedules",
    description: "Jadwal sesi live, tutorial, atau evaluasi akademik.",
    columns: [
      { name: "id", type: "text", isPrimary: true, description: "ID jadwal" },
      { name: "courseId", type: "text", description: "Mata kuliah terkait" },
      { name: "title", type: "text", description: "Judul sesi" },
      { name: "startTime", type: "timestamp", description: "Waktu mulai sesi" },
      { name: "endTime", type: "timestamp", description: "Waktu selesai sesi" },
    ],
    relations: ["courses"],
  },
};

/**
 * Introspect database schema definitions
 */
export async function introspectDbSchema(targetTable?: string): Promise<{
  tables: SchemaTableInfo[];
  totalKnownTables: number;
}> {
  if (targetTable) {
    const key = targetTable.toLowerCase().replace(/-/g, "_");
    const matched = Object.entries(SCHEMA_DEFINITIONS).find(
      ([k, v]) => k === key || v.tableName.toLowerCase() === key
    );
    if (matched) {
      return { tables: [matched[1]], totalKnownTables: Object.keys(SCHEMA_DEFINITIONS).length };
    }
  }

  return {
    tables: Object.values(SCHEMA_DEFINITIONS),
    totalKnownTables: Object.keys(SCHEMA_DEFINITIONS).length,
  };
}

/**
 * Live table counts & aggregate metrics
 */
export async function getLiveSystemMetrics(): Promise<{
  usersCount: number;
  coursesCount: number;
  questionsCount: number;
  tokensCount: number;
  groupsCount: number;
  pkaRegistrationsCount: number;
  featureFlags: Array<{ key: string; name: string; enabled: boolean }>;
}> {
  try {
    const [
      usersResult,
      coursesResult,
      questionsResult,
      tokensResult,
      groupsResult,
      pkaResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(user),
      db.select({ count: count() }).from(courses),
      db.select({ count: count() }).from(questions),
      db.select({ count: count() }).from(enrollmentTokens),
      db.select({ count: count() }).from(groups),
      db.select({ count: count() }).from(pkaRegistrations),
    ]);

    const allFlags = getAllFeatureFlagsStatus();
    const flags = allFlags.map((f) => ({
      key: f.key,
      name: f.name,
      enabled: f.enabled,
    }));

    return {
      usersCount: usersResult[0]?.count ?? 0,
      coursesCount: coursesResult[0]?.count ?? 0,
      questionsCount: questionsResult[0]?.count ?? 0,
      tokensCount: tokensResult[0]?.count ?? 0,
      groupsCount: groupsResult[0]?.count ?? 0,
      pkaRegistrationsCount: pkaResult[0]?.count ?? 0,
      featureFlags: flags,
    };
  } catch (error) {
    console.warn("[OpsAi Metrics] Error fetching live metrics:", error);
    return {
      usersCount: 0,
      coursesCount: 0,
      questionsCount: 0,
      tokensCount: 0,
      groupsCount: 0,
      pkaRegistrationsCount: 0,
      featureFlags: getAllFeatureFlagsStatus().map((f) => ({
        key: f.key,
        name: f.name,
        enabled: f.enabled,
      })),
    };
  }
}

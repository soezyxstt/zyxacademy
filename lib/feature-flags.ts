import { env } from "@/lib/env";

export type FeatureCategory = 
  | "academic_student"
  | "pedagogy_eif"
  | "ai_v2_architecture"
  | "quiz_live"
  | "platform";

export interface FeatureFlagMeta {
  key: string;
  name: string;
  category: FeatureCategory;
  categoryLabel: string;
  description: string;
}

export interface FeatureFlagStatus extends FeatureFlagMeta {
  enabled: boolean;
  rawValue: string | undefined;
}

export const FEATURE_CATEGORIES: Record<FeatureCategory, string> = {
  academic_student: "Akademik & Siswa",
  pedagogy_eif: "Pedagogi & Objek Pembelajaran (EIF)",
  ai_v2_architecture: "AI & Arsitektur V2",
  quiz_live: "Kuis & Kelas Live",
  platform: "Platform & Workflow",
};

export const KNOWN_FEATURE_FLAGS: FeatureFlagMeta[] = [
  // Akademik & Siswa
  {
    key: "FEATURE_MASTERY",
    name: "Mastery Tracking",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Pelacakan tingkat penguasaan materi dan skor mastery siswa per mata kuliah.",
  },
  {
    key: "FEATURE_TODAY",
    name: "Today Feed",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Jadwal dan rekomendasi kegiatan belajar harian siswa pada Halaman Utama.",
  },
  {
    key: "FEATURE_STUDY_PATH",
    name: "Study Path Adaptif",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Jalur belajar adaptif dan urutan rekomendasi topik berdasarkan performa siswa.",
  },
  {
    key: "FEATURE_REFLECTION",
    name: "Refleksi Mingguan",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Fitur refleksi mingguan dan ringkasan evaluasi belajar siswa.",
  },
  {
    key: "FEATURE_REFLECTION_EMAIL",
    name: "Email Refleksi",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Pengiriman email pengingat dan ringkasan refleksi mingguan ke mahasiswa.",
  },
  {
    key: "FEATURE_PKA",
    name: "Tutorial PKA Campaign",
    category: "academic_student",
    categoryLabel: FEATURE_CATEGORIES.academic_student,
    description: "Kampanye gratis Tutorial PKA, simulasi kuis bertahap, dan pengumuman admin.",
  },

  // Pedagogi & Objek Pembelajaran (EIF)
  {
    key: "FEATURE_EMBED",
    name: "EIF E0: Learning Context Fabric",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Fabric konteks pembelajaran E0 dan permukaan materi terkonfigurasi.",
  },
  {
    key: "FEATURE_MISCONCEPTION",
    name: "EIF E1: Misconception Analytics",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Analisis distraktor E1 dan umpan balik miskonsepsi deterministik.",
  },
  {
    key: "FEATURE_REMEDIATION",
    name: "EIF E2: Quiz Remediation Surfacing",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Remediasi kuis E2 berbasis delta penguasaan dan diagnosa akar masalah.",
  },
  {
    key: "FEATURE_MATERIAL_LIVE",
    name: "EIF E3: Interactive Material Layer",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Layer materi interaktif E3 untuk seleksi teks dan aksi objek pengetahuan.",
  },
  {
    key: "FEATURE_FC_DIFFICULTY",
    name: "EIF E4: Flashcard Difficulty & SM-2",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Penilaian kesulitan daya ingat flashcard E4 dan algoritma pengulangan SM-2.",
  },
  {
    key: "FEATURE_GRAPH",
    name: "EIF E5: Navigable Concept Graph",
    category: "pedagogy_eif",
    categoryLabel: FEATURE_CATEGORIES.pedagogy_eif,
    description: "Graf konsep terarah E5 dan penelusuran prasyarat materi oleh AI tutor.",
  },

  // Kuis & Kelas Live
  {
    key: "FEATURE_ADAPTIVE_QUIZ",
    name: "Kuis Adaptif",
    category: "quiz_live",
    categoryLabel: FEATURE_CATEGORIES.quiz_live,
    description: "Penyesuaian komposisi kesulitan soal kuis berdasarkan penguasaan siswa.",
  },
  {
    key: "FEATURE_LIVE",
    name: "Real-time Live Classroom",
    category: "quiz_live",
    categoryLabel: FEATURE_CATEGORIES.quiz_live,
    description: "Kuis interaktif langsung P9 berbasis WebSocket / Worker real-time.",
  },
  {
    key: "FEATURE_FEEDBACK",
    name: "Mistake Feedback Engine",
    category: "quiz_live",
    categoryLabel: FEATURE_CATEGORIES.quiz_live,
    description: "Umpan balik penjelasan kesalahan otomatis setelah menjawab kuis.",
  },
  {
    key: "FEATURE_TUTOR_ANALYTICS",
    name: "Tutor Analytics Portal",
    category: "quiz_live",
    categoryLabel: FEATURE_CATEGORIES.quiz_live,
    description: "Dashboard analitik interaksi AI tutor bagi pengajar dan dosen.",
  },

  // AI & Arsitektur V2
  {
    key: "FEATURE_TUTOR_RAG",
    name: "Tutor RAG Pipeline",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Pipeline AI tutor berbasis RAG, KV cache, dan memori percakapan.",
  },
  {
    key: "FEATURE_TUTOR_PIPELINE_V2",
    name: "Tutor Pipeline V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Isolasi cache Tier 1, routing aksi kueri terstruktur, dan payload bebas siswa.",
  },
  {
    key: "FEATURE_TUTOR_EVIDENCE_V2",
    name: "Tutor Evidence V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Pipeline verifikasi bukti, sitasi sumber, penanganan konflik, dan abstensi tutor.",
  },
  {
    key: "FEATURE_AI_CONTRACT_V2",
    name: "AI Prompt Contracts V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Kontrak prompt AI terkonfigurasi versi 2, pemulihan bounded repair, dan provansi trace.",
  },
  {
    key: "FEATURE_ASSESSMENT_ASSISTANCE_POLICY",
    name: "Assessment Assistance Policy",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Aturan proteksi deterministik yang membatasi bantuan AI tutor saat kuis aktif.",
  },
  {
    key: "FEATURE_KO_PIPELINE_V2",
    name: "Knowledge Object Pipeline V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Identitas stabil, semantic hash, dan rekonsiliasi otomatis Objek Pengetahuan.",
  },
  {
    key: "FEATURE_QUESTION_GENERATOR_V2",
    name: "Question Generator V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Blueprint multidimensi, option shuffle seeded, dan provansi distraktor.",
  },
  {
    key: "FEATURE_TUTOR_PEDAGOGY_V2",
    name: "Tutor Pedagogy V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Strategi pedagogi kontekstual dan adaptasi respon tutor sesuai progres siswa.",
  },
  {
    key: "FEATURE_MATERIAL_COMPILER_V2",
    name: "Material Compiler V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Kompilator materi semantik, validasi preflight KO, dan perbandingan revisi.",
  },
  {
    key: "FEATURE_FLASHCARD_GENERATOR_V2",
    name: "Flashcard Generator V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Generator flashcard atomik active recall dan validasi kepadatan konsep.",
  },
  {
    key: "FEATURE_DIKTAT_QA_V2",
    name: "Diktat QA V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Audit diktat otomatis, registri formula LaTeX, dan gating publikasi PDF.",
  },
  {
    key: "FEATURE_ANALYTICS_DIAGNOSIS_V2",
    name: "Analytics Diagnosis V2",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Diagnosa analitik kuis terkalibrasi kecukupan bukti kuantitatif.",
  },
  {
    key: "FEATURE_VECTORIZE_ONLY_V1",
    name: "Canonical Vectorize Only",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Rute embedding Gemini Embedding 2 768 dimensi ke index Vectorize canonical staging.",
  },
  {
    key: "FEATURE_ZYRA_IDEA_RUNTIME_V1",
    name: "Zyra Idea Runtime",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "Retrieval Zyra yang fail-closed dan hanya memakai Idea canonical yang sudah dihidrasi.",
  },
  {
    key: "FEATURE_ZYRA_PEDAGOGY_V3",
    name: "Zyra Pedagogy V3",
    category: "ai_v2_architecture",
    categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
    description: "State machine pedagogi deterministik, response contract bertipe, dan checkpoint learner.",
  },
  {
    key: "FEATURE_ADMIN_TUTOR_WORKFLOW_V1",
    name: "Admin Tutor Workflow",
    category: "platform",
    categoryLabel: FEATURE_CATEGORIES.platform,
    description: "Transisi workflow konten admin dan tutor dengan audit mutasi terpusat.",
  },
  {
    key: "FEATURE_MURID_IDEA_WORKFLOW_V1",
    name: "Murid Idea Workflow",
    category: "platform",
    categoryLabel: FEATURE_CATEGORIES.platform,
    description: "Read model murid berbasis Idea dengan adapter kompatibilitas Tutorial PKA.",
  },
];

/**
 * Returns true if a feature flag environment variable is active ("1" or "true").
 */
export function isFeatureFlagActive(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true";
}

/**
 * Retrieves the full list of feature flag statuses at runtime.
 * Automatically checks known catalog flags + any extra `FEATURE_*` env vars in process.env.
 */
export function getAllFeatureFlagsStatus(): FeatureFlagStatus[] {
  const knownKeys = new Set(KNOWN_FEATURE_FLAGS.map((f) => f.key));
  const envObj = env as unknown as Record<string, string | undefined>;

  const statuses: FeatureFlagStatus[] = KNOWN_FEATURE_FLAGS.map((meta) => {
    const rawVal = envObj[meta.key] ?? process.env[meta.key];
    return {
      ...meta,
      rawValue: rawVal,
      enabled: isFeatureFlagActive(rawVal),
    };
  });

  // Pick up any extra dynamic FEATURE_* env vars not in the static catalog
  if (typeof process !== "undefined" && process.env) {
    for (const [key, rawVal] of Object.entries(process.env)) {
      if (key.startsWith("FEATURE_") && !knownKeys.has(key)) {
        statuses.push({
          key,
          name: key.replace("FEATURE_", "").replace(/_/g, " "),
          category: "ai_v2_architecture",
          categoryLabel: FEATURE_CATEGORIES.ai_v2_architecture,
          description: "Feature flag terdeteksi otomatis dari variabel lingkungan runtime.",
          rawValue: rawVal,
          enabled: isFeatureFlagActive(rawVal),
        });
      }
    }
  }

  return statuses;
}

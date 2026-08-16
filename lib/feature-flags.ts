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

function flag(
  key: string,
  name: string,
  category: FeatureCategory,
  description: string,
): FeatureFlagMeta {
  return {
    key,
    name,
    category,
    categoryLabel: FEATURE_CATEGORIES[category],
    description,
  };
}

/**
 * Only granular, non-foundational capabilities remain runtime configurable.
 * Foundational product behavior is intentionally absent from this catalog.
 */
export const KNOWN_FEATURE_FLAGS: FeatureFlagMeta[] = [
  flag("FEATURE_REMEDIATION", "Quiz Remediation Surfacing", "pedagogy_eif", "Remediasi kuis berbasis delta penguasaan dan diagnosa akar masalah."),
  flag("FEATURE_MATERIAL_LIVE", "Interactive Material Layer", "pedagogy_eif", "Layer materi interaktif untuk seleksi teks dan aksi objek pengetahuan."),
  flag("FEATURE_GRAPH", "Navigable Concept Graph", "pedagogy_eif", "Graf konsep dan penelusuran prasyarat materi oleh AI tutor."),
  flag("FEATURE_REFLECTION", "Refleksi Mingguan", "academic_student", "Refleksi mingguan dan ringkasan evaluasi belajar siswa."),
  flag("FEATURE_REFLECTION_EMAIL", "Email Refleksi", "academic_student", "Pengiriman email pengingat dan ringkasan refleksi mingguan."),
  flag("FEATURE_PKA", "Tutorial PKA Campaign", "academic_student", "Kampanye gratis Tutorial PKA, simulasi kuis bertahap, dan pengumuman admin."),
  flag("FEATURE_ADAPTIVE_QUIZ", "Kuis Adaptif", "quiz_live", "Penyesuaian komposisi kesulitan soal berdasarkan penguasaan siswa."),
  flag("FEATURE_LIVE", "Real-time Live Classroom", "quiz_live", "Kuis interaktif langsung berbasis Worker real-time."),
  flag("FEATURE_TUTOR_ANALYTICS", "Tutor Analytics Portal", "quiz_live", "Dashboard analitik interaksi AI tutor bagi pengajar dan dosen."),
  flag("FEATURE_QUESTION_GENERATOR_V2", "Question Generator V2", "ai_v2_architecture", "Blueprint soal, option shuffle seeded, dan provenance distraktor."),
  flag("FEATURE_DIKTAT_AI", "Diktat AI Audit Suggestions", "ai_v2_architecture", "Saran audit berbantuan AI untuk penyusunan dan pemeriksaan Diktat."),
  flag("FEATURE_IDEA_BUNDLE_V2", "Idea Bundle V2", "platform", "Workflow ZIP Idea Bundle yang ketat dan tervalidasi."),
  flag("FEATURE_AUTHORING_CONTEXT_V1", "Authoring Context Pack", "platform", "Ekspor Authoring Context Pack yang deterministik dan ter-redaksi."),
  flag("FEATURE_PRODUCT_BUNDLE_V2", "Product Bundle V2", "platform", "Workflow ZIP Product Bundle untuk produk konten yang disetujui."),
  flag("FEATURE_ZYRA_ALLOWANCE_V2", "Zyra Allowance Ledger", "ai_v2_architecture", "Ledger kuota dan usage lease Zyra berbasis peran."),
  flag("FEATURE_ZYRA_PROVIDER_ROUTER_V2", "Zyra Provider Router", "ai_v2_architecture", "Routing provider yang sadar kesehatan proyek dan fallback."),
  flag("FEATURE_ZYRA_SEMANTIC_CACHE_V1", "Zyra Semantic Cache", "ai_v2_architecture", "Cache semantic yang profile-free dengan validasi scope."),
  flag("FEATURE_ZYRA_PERSONALIZATION_V1", "Zyra Personalization", "ai_v2_architecture", "Adaptasi presentasi belajar berbasis preferensi dan profil yang aman."),
  flag("FEATURE_ZYRA_LEARNING_CANVAS_V1", "Zyra Learning Canvas", "ai_v2_architecture", "Visual Learning Canvas lokal dengan evaluasi ekspresi yang aman."),
  flag("FEATURE_ZYRA_IMAGE_INPUT_V1", "Zyra Image Input", "ai_v2_architecture", "Input gambar privat untuk tutoring multimodal Zyra."),
  flag("FEATURE_ZYRA_SELECTION_ASK_V1", "Zyra Selection Ask", "ai_v2_architecture", "Handoff konteks dari teks terseleksi ke pertanyaan tutor."),
  flag("FEATURE_ZYRA_PET_V1", "Zyra Pet", "ai_v2_architecture", "Indikator state pendamping Zyra yang dimiliki aplikasi."),
  flag("FEATURE_ZYRA_TUTOR_COPILOT_V1", "Zyra Tutor Copilot", "ai_v2_architecture", "Workflow proposal read-only untuk tutor."),
  flag("FEATURE_ZYRA_ADMIN_COPILOT_V1", "Zyra Admin Copilot", "ai_v2_architecture", "Workflow proposal read-only untuk admin."),
  flag("FEATURE_ZYRA_AI_OPS_V1", "Zyra AI Ops", "ai_v2_architecture", "Monitor operasi Zyra dengan data yang privacy-safe."),
  flag("FEATURE_DRIVE_EDITOR_SYNC", "Drive Editor Sync", "platform", "Sinkronisasi akses editor admin pada artefak Google Drive."),
  flag("FEATURE_MEDIA_LIBRARY", "Media Library", "platform", "Library media admin untuk upload, organize, preview, dan manage."),
  flag("FEATURE_LINK_LIBRARY", "Link Library", "platform", "Library tautan penting yang dikelola admin."),
  flag("FEATURE_FORM_PRESETS", "Form Presets", "platform", "Preset pertanyaan dan pengaturan Form Studio yang dapat digunakan ulang."),
];

/** Returns true if a retained flag is active ("1" or "true"). */
export function isFeatureFlagActive(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true";
}

/** Returns statuses only for the retained category 4 catalog. */
export function getAllFeatureFlagsStatus(): FeatureFlagStatus[] {
  const envObj = env as unknown as Record<string, string | undefined>;
  return KNOWN_FEATURE_FLAGS.map((meta) => {
    const rawValue = envObj[meta.key];
    return {
      ...meta,
      rawValue,
      enabled: isFeatureFlagActive(rawValue),
    };
  });
}

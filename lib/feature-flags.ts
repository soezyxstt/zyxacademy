import { env } from "@/lib/env";

export type FeatureCategory =
  | "academic_student"
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
 * Explicitly approved optional capability catalog.
 * Stable foundational behavior is always-on.
 */
export const KNOWN_FEATURE_FLAGS: FeatureFlagMeta[] = [
  flag("FEATURE_PKA", "Tutorial PKA Campaign", "academic_student", "Kampanye gratis Tutorial PKA, simulasi kuis bertahap, dan pengumuman admin."),
  flag("FEATURE_REFLECTION_EMAIL", "Email Refleksi", "academic_student", "Pengiriman email pengingat dan ringkasan refleksi mingguan."),
  flag("FEATURE_LIVE", "Real-time Live Classroom", "quiz_live", "Kuis interaktif langsung berbasis Worker real-time."),
  flag("FEATURE_DIKTAT_AI", "Diktat AI Audit Suggestions", "ai_v2_architecture", "Saran audit berbantuan AI untuk penyusunan dan pemeriksaan Diktat."),
  flag("FEATURE_ZYRA_IMAGE_INPUT_V1", "Zyra Image Input", "ai_v2_architecture", "Input gambar privat untuk tutoring multimodal Zyra."),
  flag("FEATURE_ZYRA_SEMANTIC_CACHE_V1", "Zyra Semantic Cache", "ai_v2_architecture", "Cache semantic yang profile-free dengan validasi scope."),
  flag("FEATURE_DRIVE_EDITOR_SYNC", "Drive Editor Sync", "platform", "Sinkronisasi akses editor admin pada artefak Google Drive."),
  flag("FEATURE_STRUCTURED_ARTICLE_READER_V1", "Structured Article Reader", "academic_student", "Rollout sementara authoring, review, dan reader Artikel V3 berbasis subtopik."),
];

/** Returns true if a retained flag is active ("1" or "true"). */
export function isFeatureFlagActive(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true";
}

/** Returns statuses only for the approved optional capability catalog. */
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

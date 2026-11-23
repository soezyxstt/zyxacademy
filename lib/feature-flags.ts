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
  flag("FEATURE_REFLECTION_EMAIL", "Email Refleksi", "academic_student", "Pengiriman email pengingat dan ringkasan refleksi mingguan."),
  flag("FEATURE_DRIVE_EDITOR_SYNC", "Drive Editor Sync", "platform", "Sinkronisasi akses editor admin pada artefak Google Drive."),
  flag("FEATURE_STRUCTURED_ARTICLE_READER_V1", "Structured Article V3", "platform", "Rollout sementara authoring, submission, dan review Artikel V3 berbasis subtopik."),
];

/** Returns true if a retained flag is active ("1" or "true"). */
export function isFeatureFlagActive(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true";
}

/** Returns statuses only for the approved optional capability catalog. */
export function getAllFeatureFlagsStatus(): FeatureFlagStatus[] {
  const envObj = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return KNOWN_FEATURE_FLAGS.map((meta) => {
    const rawValue = envObj[meta.key];
    return {
      ...meta,
      rawValue,
      enabled: meta.key === "FEATURE_STRUCTURED_ARTICLE_READER_V1" ? isFeatureFlagActive(rawValue) : rawValue === "1",
    };
  });
}

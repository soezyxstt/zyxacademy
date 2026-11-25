export type OpsAiSkillCategory = "admin" | "authoring" | "recovery";

export interface OpsAiSkillMeta {
  id: string;
  label: string;
  shortDescription: string;
  category: OpsAiSkillCategory;
  suggestedRoutes: string[];
  recommendedMode: "ask" | "edit";
}

export const MAX_ACTIVE_OPS_SKILLS = 3;

export const OPS_AI_SKILL_CATALOG: readonly OpsAiSkillMeta[] = [
  {
    id: "zyx-admin-operations",
    label: "Admin Operations",
    shortDescription: "Koordinasi tugas admin, cek izin aktif, dan arahkan workflow operasional.",
    category: "admin",
    suggestedRoutes: ["/admin", "/admin/ops", "/admin/users", "/admin/tokens", "/admin/groups", "/admin/schedules"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-forms-mcp",
    label: "Form Studio",
    shortDescription: "Buat, ubah, uji validasi, dan kelola formulir serta tautan pendek.",
    category: "admin",
    suggestedRoutes: ["/admin/forms"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-blog-mcp",
    label: "Blog Publishing",
    shortDescription: "Buat, sunting, cek thumbnail, dan terbitkan artikel blog publik.",
    category: "admin",
    suggestedRoutes: ["/admin/blog"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-media-mcp",
    label: "Media Library",
    shortDescription: "Cari aset media, unggah berkas kecil, dan ambil URL penyajian.",
    category: "admin",
    suggestedRoutes: ["/admin/blog", "/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-operation-recovery",
    label: "Operation Recovery",
    shortDescription: "Pulihkan operasi tertunda, token plan kedaluwarsa, atau konflik revisi.",
    category: "recovery",
    suggestedRoutes: ["/admin/ops", "/admin/ops/tutor-activity"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-authoring-pipeline",
    label: "Authoring Pipeline",
    shortDescription: "Orkestrasi penuh Source Pack ke Idea Bundle V3 lalu Product Bundle V4/V5.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-source-pack-mcp",
    label: "Source Pack",
    shortDescription: "Susun Source Pack lossless dari dokumen akademik sebelum validasi.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-idea-bundle-mcp",
    label: "Idea Bundle V3",
    shortDescription: "Susun Idea Bundle V3 atomic dengan provenance dan learningSections.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-product-bundle-mcp",
    label: "Product Bundle V4/V5",
    shortDescription: "Susun Artikel, Diktat, flashcard V4, atau Pembahasan soal V5.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-question-authoring-mcp",
    label: "Question Authoring",
    shortDescription: "Buat atau revisi soal original terhubung ke Idea published.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "reference-question-ingest",
    label: "Reference Question Ingest",
    shortDescription: "Impor soal historis verbatim dari PDF soal dan pembahasan.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
  {
    id: "zyx-content-revisions",
    label: "Content Revisions",
    shortDescription: "Patch revisi Idea V3 dan Product V3/V4/V5 beserta riwayat restore.",
    category: "authoring",
    suggestedRoutes: ["/admin/courses"],
    recommendedMode: "edit",
  },
] as const;

export const OPS_AI_SKILL_IDS = new Set<string>(OPS_AI_SKILL_CATALOG.map((skill) => skill.id));

export function normalizeActiveSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!OPS_AI_SKILL_IDS.has(trimmed)) continue;
    if (!unique.includes(trimmed)) unique.push(trimmed);
    if (unique.length >= MAX_ACTIVE_OPS_SKILLS) break;
  }
  return unique;
}

export function getOpsAiSkillMeta(id: string): OpsAiSkillMeta | undefined {
  return OPS_AI_SKILL_CATALOG.find((skill) => skill.id === id);
}

export function getRecommendedSkillIds(pathname: string): string[] {
  const path = pathname.toLowerCase();
  if (path.startsWith("/admin/forms")) return ["zyx-forms-mcp", "zyx-admin-operations"];
  if (path.startsWith("/admin/blog")) return ["zyx-blog-mcp", "zyx-media-mcp"];
  if (path.startsWith("/admin/ops")) return ["zyx-admin-operations", "zyx-operation-recovery"];
  if (/^\/admin\/courses\/[^/]+\/quizzes/.test(path)) {
    return ["zyx-question-authoring-mcp", "reference-question-ingest"];
  }
  if (/^\/admin\/courses\/[^/]+\/materials/.test(path)) {
    return ["zyx-product-bundle-mcp", "zyx-content-revisions"];
  }
  if (path.startsWith("/admin/courses")) {
    return ["zyx-authoring-pipeline", "zyx-product-bundle-mcp"];
  }
  return ["zyx-admin-operations"];
}

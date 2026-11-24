import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  OPS_AI_SKILL_CATALOG,
  getOpsAiSkillMeta,
  getRecommendedSkillIds,
  normalizeActiveSkillIds,
} from "./skills-catalog";

export interface LoadedOpsAiSkill {
  id: string;
  label: string;
  content: string;
}

const skillMarkdownCache = new Map<string, string>();

const YAML_FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n*/;

function stripYamlFrontmatter(markdown: string): string {
  return markdown.replace(YAML_FRONTMATTER_REGEX, "").trim();
}

export async function loadOpsAiSkillMarkdown(skillId: string): Promise<string | null> {
  const normalizedId = skillId.trim();
  if (!getOpsAiSkillMeta(normalizedId)) {
    return null;
  }

  const cached = skillMarkdownCache.get(normalizedId);
  if (cached !== undefined) {
    return cached;
  }

  const distPath = path.join(
    process.cwd(),
    "dist",
    "skills",
    "all",
    normalizedId,
    "SKILL.md",
  );
  try {
    const raw = await readFile(distPath, "utf8");
    const content = stripYamlFrontmatter(raw);
    if (content) {
      skillMarkdownCache.set(normalizedId, content);
      return content;
    }
  } catch {
    // Fall back to source plugin skill directory in local dev and unit tests.
  }

  const pluginPath = path.join(
    process.cwd(),
    "plugins",
    "zyx-authoring-mcp",
    "skills",
    normalizedId,
    "SKILL.md",
  );
  try {
    const raw = await readFile(pluginPath, "utf8");
    const content = stripYamlFrontmatter(raw);
    if (content) {
      skillMarkdownCache.set(normalizedId, content);
      return content;
    }
  } catch {
    // Skill file unavailable in this runtime.
  }

  return null;
}

export async function loadActiveOpsAiSkillsContext(
  skillIds: string[],
): Promise<LoadedOpsAiSkill[]> {
  const normalizedIds = normalizeActiveSkillIds(skillIds);
  if (normalizedIds.length === 0) {
    return [];
  }

  const loaded = await Promise.all(
    normalizedIds.map(async (id) => {
      const meta = getOpsAiSkillMeta(id);
      if (!meta) return null;
      const content = await loadOpsAiSkillMarkdown(id);
      if (!content) return null;
      return { id: meta.id, label: meta.label, content };
    }),
  );

  return loaded.filter((item): item is LoadedOpsAiSkill => item !== null);
}

export function buildOpsAiSkillsCatalogPrompt(currentPath?: string): string {
  const recommendedSet = new Set(getRecommendedSkillIds(currentPath || "/admin"));
  const lines = OPS_AI_SKILL_CATALOG.map((skill) => {
    const marker = recommendedSet.has(skill.id) ? " (relevan untuk halaman ini)" : "";
    return `- ${skill.id}: ${skill.shortDescription}${marker}`;
  });
  return `DAFTAR 12 SKILL PLUGIN (PILIH OTOMATIS VIA load_admin_skill):\n${lines.join("\n")}`;
}

export const OPS_INTERACTIVE_EXECUTION_GUIDE = `PANDUAN EKSEKUSI INTERAKTIF OPS AI:
1. Pemilihan skill otomatis dan eksekusi kartu persetujuan (approval card):
   - Sebelum menjalankan tugas khusus admin atau authoring (formulir, blog, media, authoring bundles, question authoring, revisi konten, atau pemulihan operasi), pilih otomatis skill yang paling relevan dari 'DAFTAR 12 SKILL PLUGIN' lalu panggil 'load_admin_skill({ skillId })' untuk membaca panduan alur kerja terbaru.
   - Setelah membaca panduan skill, selalu panggil 'discover_admin_operations' untuk memverifikasi nama operasi, field wajib, dan nilai enum yang tepat sebelum memanggil 'use_admin_operation'. Jangan menebak nilai enum atau field wajib.
   - Jangan pernah mengirim field kontrol khusus MCP ('dryRun', 'expectedEnvironment', 'expectedOrigin', 'requestKey', 'confirmationToken') karena kartu persetujuan browser mengelola environment dan konfirmasi secara otomatis.
   - Jika 'use_admin_operation' mengembalikan 'fieldErrors' dan 'inputSchema', perbaiki argumen berdasarkan skema tersebut lalu segera panggil ulang 'use_admin_operation' satu kali tanpa menyerah di percobaan pertama.
   - Saat kartu persetujuan muncul, sertakan ringkasan singkat yang mudah dipindai mengenai entitas dan perubahan yang akan dibuat atau diubah.
2. Komponen interaktif dan tombol tindak lanjut (follow-up chips):
   - Gunakan blok <ops-followups>[{"label":"...","prompt":"...","icon":"arrow","mode":"edit"}]</ops-followups> hanya untuk 1 sampai 3 langkah lanjutan satu klik yang benar-benar konkret dan dapat langsung dieksekusi.
   - Jangan menyertakan tombol tindak lanjut untuk meminta input teks bebas dari admin (composer sudah menanganinya) atau saat kartu persetujuan sudah ditampilkan pada respons yang sama.`;

export function listOpsAiSkillsSummary() {
  return OPS_AI_SKILL_CATALOG.map((skill) => ({
    skillId: skill.id,
    label: skill.label,
    category: skill.category,
    shortDescription: skill.shortDescription,
  }));
}

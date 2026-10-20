import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const skillResourceSchema = z.object({
  uri: z.string().startsWith("skill://zyx-authoring/"),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
});
export const skillEntrySchema = z.object({
  uri: z.string(),
  frontmatter: z.object({ name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().min(1) }).catchall(z.json()),
  resources: z.array(skillResourceSchema).min(1).max(100),
});
export const skillManifestSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({ repository: z.string(), commit: z.string().regex(/^[a-f0-9]{40}$/), environment: z.enum(["staging", "production"]) }),
  catalogs: z.object({ all: z.array(skillEntrySchema).min(1), chatgpt: z.array(skillEntrySchema).min(1).max(5) }),
});
export type SkillEntry = z.infer<typeof skillEntrySchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillCatalogProfile = "chatgpt" | "all";

export function skillDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function safeSkillPath(root: string, path: string): string {
  if (!path || path !== path.normalize("NFC") || /[\\%?#:\x00-\x1f]/.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))) {
    throw new Error("Unsafe skill path");
  }
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Unsafe skill path");
  return target;
}

export function skillUri(path: string): string {
  safeSkillPath(".", path);
  return `skill://zyx-authoring/${path}`;
}

export function validateSkillEntry(entry: SkillEntry): void {
  skillEntrySchema.parse(entry);
  const prefix = entry.uri.slice(0, -"SKILL.md".length);
  if (!entry.uri.endsWith(`/${entry.frontmatter.name}/SKILL.md`)) throw new Error("Skill name does not match directory");
  const paths = new Set<string>();
  let total = 0;
  for (const resource of entry.resources) {
    if (!resource.uri.startsWith(prefix)) throw new Error("Resource outside skill");
    const path = resource.uri.slice("skill://zyx-authoring/".length);
    safeSkillPath(".", path);
    if (paths.has(path.toLowerCase())) throw new Error("Duplicate skill path");
    paths.add(path.toLowerCase());
    if (resource.size > (resource.uri === entry.uri ? 256 * 1024 : 1024 * 1024)) throw new Error("Skill file exceeds import limit");
    total += resource.size;
  }
  if (!entry.resources.some((resource) => resource.uri === entry.uri)) throw new Error("Missing SKILL.md resource");
  if (total > 5 * 1024 * 1024) throw new Error("Skill exceeds import limit");
}

export function loadSkillCatalog(root: string, profile: SkillCatalogProfile) {
  if (lstatSync(root).isSymbolicLink()) throw new Error("Symlink skill root");
  const manifest = skillManifestSchema.parse(JSON.parse(readFileSync(safeSkillPath(root, "manifest.json"), "utf8")));
  const entries = manifest.catalogs[profile];
  const resources = new Map<string, { uri: string; mimeType: string; text?: string; blob?: string }>();
  const names = new Set<string>();
  for (const entry of entries) {
    validateSkillEntry(entry);
    if (names.has(entry.frontmatter.name)) throw new Error("Duplicate skill name");
    names.add(entry.frontmatter.name);
    for (const resource of entry.resources) {
      const path = resource.uri.slice("skill://zyx-authoring/".length);
      const target = safeSkillPath(root, path);
      let current = resolve(root);
      for (const part of path.split("/")) {
        current = resolve(current, part);
        if (lstatSync(current).isSymbolicLink()) throw new Error("Symlink skill resource");
      }
      if (realpathSync(target) !== target) throw new Error("Redirected skill resource");
      const bytes = readFileSync(target);
      if (bytes.length !== resource.size || skillDigest(bytes) !== resource.digest) throw new Error("Skill resource integrity mismatch");
      try {
        resources.set(resource.uri, { uri: resource.uri, mimeType: "text/plain", text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) });
      } catch {
        resources.set(resource.uri, { uri: resource.uri, mimeType: "application/octet-stream", blob: bytes.toString("base64") });
      }
    }
  }
  return { manifest, entries, resources };
}

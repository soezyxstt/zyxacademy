import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { zipSync } from "fflate";
import lock from "../authoring-skills.lock.json";
import { loadSkillCatalog, safeSkillPath, skillDigest, skillUri, validateSkillEntry, type SkillEntry, type SkillManifest } from "../lib/authoring/skill-catalog";

export function parseSkillFrontmatter(bytes: Uint8Array): SkillEntry["frontmatter"] {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error("Missing YAML frontmatter");
  const parsed = Bun.YAML.parse(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid YAML frontmatter");
  // JSON is the wire representation; reject YAML values that cannot be represented faithfully.
  const json = JSON.parse(JSON.stringify(parsed));
  if (!json.name || !json.description) throw new Error("Missing skill name or description");
  return json;
}

function filesUnder(root: string, path = ""): string[] {
  if (lstatSync(root).isSymbolicLink()) throw new Error("Symlink source root");
  return readdirSync(path ? safeSkillPath(root, path) : root).sort().flatMap((name) => {
    const rel = path ? `${path}/${name}` : name;
    const target = safeSkillPath(root, rel);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error("Symlink source file");
    if (stat.isDirectory()) return filesUnder(root, rel);
    if (!stat.isFile()) throw new Error("Unsupported source file");
    return [rel];
  });
}

export function buildSkillArtifact(source: string, output: string, provenance: SkillManifest["source"]): SkillManifest {
  const sourceRoot = resolve(source, "skills");
  const outputRelative = relative(sourceRoot, resolve(output));
  if (!isAbsolute(outputRelative) && outputRelative !== ".." && !outputRelative.startsWith(`..${sep}`)) throw new Error("Output must be outside skills source");
  // Never overwrite an artifact: a deployment reads one immutable build snapshot.
  mkdirSync(output, { recursive: false });
  const all: SkillEntry[] = [];
  const compactFiles: Record<string, Uint8Array> = {};
  const names = readdirSync(sourceRoot).sort();
  const release = JSON.parse(readFileSync(resolve(source, "release.json"), "utf8"));
  if (JSON.stringify([...release.skills].sort()) !== JSON.stringify(names)) throw new Error("Release skill inventory mismatch");
  for (const name of names) {
    const root = safeSkillPath(sourceRoot, name);
    const paths = filesUnder(root);
    const bytes = readFileSync(safeSkillPath(root, "SKILL.md"));
    const frontmatter = parseSkillFrontmatter(bytes);
    if (frontmatter.name !== name) throw new Error("Skill directory and name differ");
    const connection = bytes.toString("utf8");
    const endpoint = provenance.environment === "production" ? "https://www.zyxacademy.com/api/mcp/authoring" : "https://staging.zyxacademy.com/api/mcp/authoring";
    if (!connection.includes(`endpoint \`${endpoint}\``)) throw new Error("Skill environment mismatch");
    const resources = paths.map((path) => {
      const content = readFileSync(safeSkillPath(root, path));
      const target = `all/${name}/${path}`;
      mkdirSync(resolve(safeSkillPath(output, target), ".."), { recursive: true });
      writeFileSync(safeSkillPath(output, target), content);
      compactFiles[`references/${name}/${path}`] = content;
      return { uri: skillUri(target), digest: skillDigest(content), size: content.length };
    });
    const entry = { uri: skillUri(`all/${name}/SKILL.md`), frontmatter, resources };
    validateSkillEntry(entry);
    all.push(entry);
  }
  const description = "Author Zyx source packs, Idea Bundles, learning Product Bundles, original question banks, and historical reference questions. Run or resume the full authoring pipeline.";
  const router = `---\nname: zyx-authoring\ndescription: ${description}\n---\n\n# Zyx authoring\n\nUse only the ${provenance.environment} MCP connection. Read the matching workflow file before reading source documents, drafting, or mutating data. Follow its environment identity, skill ID, bootstrap, capabilities, and publication gates exactly. Call workflow.get_playbook before each stage and when resuming. Never use this router name as a bootstrap skill ID.\n\nFor a full pipeline or resume, read references/zyx-authoring-pipeline/SKILL.md first. For a single stage, read the matching workflow below. Relative links between workflow directories remain valid.\n\n${all.map((entry) => `- [${entry.frontmatter.name}](references/${entry.frontmatter.name}/SKILL.md): ${entry.frontmatter.description}`).join("\n")}\n`;
  compactFiles["SKILL.md"] = Buffer.from(router);
  const resources = Object.entries(compactFiles).sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => {
    const target = `chatgpt/zyx-authoring/${path}`;
    mkdirSync(resolve(safeSkillPath(output, target), ".."), { recursive: true });
    writeFileSync(safeSkillPath(output, target), bytes);
    return { uri: skillUri(target), digest: skillDigest(bytes), size: bytes.length };
  });
  const compact = { uri: skillUri("chatgpt/zyx-authoring/SKILL.md"), frontmatter: parseSkillFrontmatter(Buffer.from(router)), resources };
  validateSkillEntry(compact);
  const archive = zipSync(Object.fromEntries(Object.entries(compactFiles).map(([path, bytes]) => [`zyx-authoring/${path}`, bytes])), { level: 6, mtime: new Date(1980, 0, 1) });
  if (archive.length > 8 * 1024 * 1024) throw new Error("Scan archive exceeds 8 MiB");
  writeFileSync(resolve(output, "chatgpt-skills.zip"), archive);
  const manifest: SkillManifest = { schemaVersion: 1, source: provenance, catalogs: { all, chatgpt: [compact] } };
  writeFileSync(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  loadSkillCatalog(output, "all");
  loadSkillCatalog(output, "chatgpt");
  return manifest;
}

function git(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Skills git command failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { environment: { type: "string" }, source: { type: "string" }, output: { type: "string", default: "dist/skills" } }, strict: true });
  const environment = values.environment ?? process.env.ZYX_MCP_ENVIRONMENT ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : process.env.VERCEL_GIT_COMMIT_REF === "staging" ? "staging" : process.env.VERCEL_ENV === "production" ? "production" : "staging");
  if (environment !== "staging" && environment !== "production") throw new Error("Unknown skills environment");
  const commit = lock[environment];
  const source = resolve(values.source ?? `artifacts/skills-source-${environment}-${commit}`);
  if (!values.source) {
    mkdirSync(source, { recursive: true });
    git(["init"], source);
    git(["fetch", "--depth=1", lock.repository, commit], source);
    git(["checkout", "--detach", "FETCH_HEAD"], source);
  }
  if (git(["rev-parse", "HEAD"], source) !== commit || git(["status", "--porcelain", "--untracked-files=all"], source)) throw new Error("Skills source must be clean at locked commit");
  const output = resolve(values.output!);
  const parent = resolve(output, "..");
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(resolve(parent, ".skills-build-"));
  const staged = resolve(temporary, "skills");
  const manifest = buildSkillArtifact(source, staged, { repository: lock.repository, commit, environment });
  const previous = resolve(temporary, "previous");
  if (existsSync(output)) {
    const old = loadSkillCatalog(output, "all").manifest;
    loadSkillCatalog(output, "chatgpt");
    const owned = new Set(["manifest.json", "chatgpt-skills.zip", ...Object.values(old.catalogs).flatMap((entries) => entries.flatMap((entry) => entry.resources.map((r) => r.uri.slice("skill://zyx-authoring/".length))))]);
    if (filesUnder(output).some((path) => !owned.has(path))) throw new Error("Refusing to replace unmanaged skills output");
    renameSync(output, previous);
  }
  try { renameSync(staged, output); }
  catch (error) { if (existsSync(previous)) renameSync(previous, output); throw error; }
  // Only the verified generated tree inside this build's temporary directory is removed.
  rmSync(temporary, { recursive: true });
  console.log(JSON.stringify({ source: manifest.source, skills: manifest.catalogs.all.length, importedSkills: manifest.catalogs.chatgpt.length }));
}

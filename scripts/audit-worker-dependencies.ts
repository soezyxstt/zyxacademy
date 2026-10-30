import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

/**
 * Static analysis for the deployed Deno background worker dependency graph.
 *
 * It starts from `workers/deno-background/main.ts`, walks every transitive
 * internal dependency, and fails when the deployed graph imports packages that
 * are not safe for the Deno worker runtime.
 *
 * Deployment trigger decisions live in `.github/workflows/deploy.yml`. Callers
 * can use `--dependency-output=<file>` to consume the computed dependency graph
 * or `--impact-output=<file>` to consume the full set of files that affect worker
 * execution, V4 verification fingerprints, or deployment configuration.
 */

const ROOT_DIR = process.cwd();
const ENTRY_FILE = path.join(ROOT_DIR, "workers", "deno-background", "main.ts");

const FORBIDDEN_PATTERNS = [
  { pattern: /^next(\/.*)?$/, label: "Next.js (next/*)" },
  { pattern: /^@t3-oss\/env-nextjs$/, label: "@t3-oss/env-nextjs" },
  { pattern: /^react(-dom)?(\/.*)?$/, label: "React (react/react-dom)" },
  { pattern: /^puppeteer(-core)?$/, label: "Puppeteer" },
  { pattern: /^@sentry\/nextjs$/, label: "@sentry/nextjs" },
  { pattern: /^sharp$/, label: "Sharp (native image processor)" },
];

const CONFIG_FILES = [
  "deno.json",
  "deno.lock",
  "package.json",
  "bun.lock",
  "next.config.ts",
  "scripts/audit-worker-dependencies.ts",
  ".github/workflows/deploy.yml",
  ".github/scripts/test_deploy_env_filter.py",
  ".github/scripts/test_deno_deploy_triggers.py",
];

const args = process.argv.slice(2);
const listDependencies = args.includes("--list");
const listImpact = args.includes("--list-impact");
const outputArg = args.find((arg) => arg.startsWith("--dependency-output="));
const dependencyOutput = outputArg?.slice("--dependency-output=".length);
const impactArg = args.find((arg) => arg.startsWith("--impact-output="));
const impactOutput = impactArg?.slice("--impact-output=".length);

const visited = new Set<string>();

function resolveImportPath(importSpecifier: string, fromFile: string): string | null {
  let targetPath = "";

  if (importSpecifier.startsWith("@/")) {
    targetPath = path.join(ROOT_DIR, importSpecifier.slice(2));
  } else if (importSpecifier.startsWith("./") || importSpecifier.startsWith("../")) {
    targetPath = path.resolve(path.dirname(fromFile), importSpecifier);
  } else {
    return null;
  }

  const candidates = [
    targetPath,
    `${targetPath}.ts`,
    `${targetPath}.tsx`,
    `${targetPath}.js`,
    `${targetPath}.mjs`,
    path.join(targetPath, "index.ts"),
    path.join(targetPath, "index.tsx"),
    path.join(targetPath, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const imports: string[] = [];

  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

interface Violation {
  file: string;
  imported: string;
  label: string;
  chain: string[];
}

const violations: Violation[] = [];

function traverse(filePath: string, callStack: string[] = []) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
  const imports = extractImports(filePath);

  for (const imp of imports) {
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(imp)) {
        violations.push({
          file: relativePath,
          imported: imp,
          label: forbidden.label,
          chain: [...callStack, relativePath],
        });
      }
    }

    const resolved = resolveImportPath(imp, filePath);
    if (resolved && !resolved.includes("node_modules")) {
      traverse(resolved, [...callStack, relativePath]);
    }
  }
}

function getProductV4RuntimeFiles(): string[] {
  const bindingPath = path.join(ROOT_DIR, "lib", "compute", "product-v4-runtime-binding.ts");
  if (!fs.existsSync(bindingPath)) return [];
  const content = fs.readFileSync(bindingPath, "utf-8");
  const match = /export const PRODUCT_V4_RUNTIME_FILES = \[(.*?)\] as const;/s.exec(content);
  if (!match) return [];
  const files: string[] = [];
  const regex = /["']([^"']+)["']/g;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = regex.exec(match[1])) !== null) {
    files.push(fileMatch[1]);
  }
  return files;
}

function getPlaybookFiles(): string[] {
  const dir = path.join(ROOT_DIR, "lib", "authoring", "playbooks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `lib/authoring/playbooks/${f}`);
}

function getWorkerDirFiles(): string[] {
  const dir = path.join(ROOT_DIR, "workers", "deno-background");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => `workers/deno-background/${f}`);
}

function getWorkerImpactFiles(traversedDependencies: string[]): string[] {
  const impact = new Set<string>([
    ...traversedDependencies,
    ...getProductV4RuntimeFiles(),
    ...getPlaybookFiles(),
    ...getWorkerDirFiles(),
    ...CONFIG_FILES,
  ]);
  return [...impact].sort();
}

console.log("Starting static dependency audit for workers/deno-background/main.ts...");
traverse(ENTRY_FILE);

const dependencies = [...visited]
  .map((filePath) => path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"))
  .sort();

console.log(`Audited ${dependencies.length} internal files in worker dependency graph.`);

if (dependencyOutput) {
  const outputPath = path.resolve(ROOT_DIR, dependencyOutput);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${dependencies.join("\n")}\n`, "utf-8");
}

if (impactOutput) {
  const impactFiles = getWorkerImpactFiles(dependencies);
  const outputPath = path.resolve(ROOT_DIR, impactOutput);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${impactFiles.join("\n")}\n`, "utf-8");
  console.log(`Wrote ${impactFiles.length} files to worker impact list.`);
}

if (listDependencies) {
  console.log("\nWorker dependency graph:");
  for (const dependency of dependencies) {
    console.log(dependency);
  }
}

if (listImpact) {
  const impactFiles = getWorkerImpactFiles(dependencies);
  console.log("\nWorker deployment impact list:");
  for (const file of impactFiles) {
    console.log(file);
  }
}

if (violations.length > 0) {
  console.error("\n[AUDIT FAILED] Forbidden dependencies detected in worker graph:");
  for (const violation of violations) {
    console.error(`  - In ${violation.file}: imports "${violation.imported}" (${violation.label})`);
    console.error(`    Trace: ${violation.chain.join(" -> ")}`);
  }
  process.exit(1);
}

console.log("\n[AUDIT PASSED] Zero forbidden dependencies detected in worker graph.");
console.log("All modules are framework-neutral and compatible with Deno execution.");

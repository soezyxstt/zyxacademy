import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

/**
 * Static analysis for the Deno background worker dependency graph.
 *
 * It verifies two things:
 * 1. `jobs/compute.ts` and all transitive internal dependencies stay Deno-safe.
 * 2. When `--check-deploy-paths` is passed, every internal dependency is covered
 *    by the marked deploy path list in `.github/workflows/deploy.yml`.
 *
 * The second check prevents a new shared dependency from being added without
 * also updating the GitHub Actions path filter that decides whether Deno must
 * be redeployed.
 */

const ROOT_DIR = process.cwd();
const ENTRY_FILE = path.join(ROOT_DIR, "jobs", "compute.ts");
const DEPLOY_WORKFLOW_FILE = path.join(ROOT_DIR, ".github", "workflows", "deploy.yml");
const DEPLOY_PATHS_BEGIN = "# BEGIN DENO_DEPLOY_PATHS";
const DEPLOY_PATHS_END = "# END DENO_DEPLOY_PATHS";

const FORBIDDEN_PATTERNS = [
  { pattern: /^next(\/.*)?$/, label: "Next.js (next/*)" },
  { pattern: /^@t3-oss\/env-nextjs$/, label: "@t3-oss/env-nextjs" },
  { pattern: /^react(-dom)?(\/.*)?$/, label: "React (react/react-dom)" },
  { pattern: /^puppeteer(-core)?$/, label: "Puppeteer" },
  { pattern: /^@sentry\/nextjs$/, label: "@sentry/nextjs" },
  { pattern: /^sharp$/, label: "Sharp (native image processor)" },
];

const REQUIRED_DEPLOY_PATHS = [
  "workers/deno-background/**",
  "deno.json",
  "deno.lock",
  ".github/workflows/deploy.yml",
];

const args = process.argv.slice(2);
const checkDeployPaths = args.includes("--check-deploy-paths");
const listDependencies = args.includes("--list");
const outputArg = args.find((arg) => arg.startsWith("--dependency-output="));
const dependencyOutput = outputArg?.slice("--dependency-output=".length);

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

function extractDeployPathPatterns(): string[] {
  const workflow = fs.readFileSync(DEPLOY_WORKFLOW_FILE, "utf-8");
  const lines = workflow.split(/\r?\n/);
  const beginIndex = lines.findIndex((line) => line.trim() === DEPLOY_PATHS_BEGIN);
  const endIndex = lines.findIndex((line, index) => index > beginIndex && line.trim() === DEPLOY_PATHS_END);

  if (beginIndex < 0 || endIndex < 0) {
    throw new Error(
      `Could not find ${DEPLOY_PATHS_BEGIN} / ${DEPLOY_PATHS_END} markers in .github/workflows/deploy.yml`,
    );
  }

  const patterns: string[] = [];
  for (const line of lines.slice(beginIndex + 1, endIndex)) {
    const match = line.match(/^\s*-\s+['"]([^'"]+)['"]\s*$/);
    if (match) patterns.push(match[1]);
  }

  if (patterns.length === 0) {
    throw new Error("Marked Deno deploy path list is empty.");
  }

  return patterns;
}

function matchesDeployPattern(filePath: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3).replace(/\/$/, "");
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  return filePath === pattern;
}

function validateDeployPathCoverage(dependencies: string[]): string[] {
  const patterns = extractDeployPathPatterns();
  const missingRequiredPatterns = REQUIRED_DEPLOY_PATHS.filter((required) => !patterns.includes(required));

  if (missingRequiredPatterns.length > 0) {
    console.error("\n[DEPLOY PATH AUDIT FAILED] Required Deno deploy paths are missing:");
    for (const required of missingRequiredPatterns) {
      console.error(`  - ${required}`);
    }
    return missingRequiredPatterns.map((pattern) => `[required pattern] ${pattern}`);
  }

  const uncovered = dependencies.filter(
    (dependency) => !patterns.some((pattern) => matchesDeployPattern(dependency, pattern)),
  );

  if (uncovered.length > 0) {
    console.error("\n[DEPLOY PATH AUDIT FAILED] Worker dependencies not covered by push.paths:");
    for (const dependency of uncovered) {
      console.error(`  - ${dependency}`);
    }
  } else {
    console.log("\n[DEPLOY PATH AUDIT PASSED] Every worker dependency is covered by the Deno deploy path filter.");
  }

  return uncovered;
}

console.log("Starting static dependency audit for jobs/compute.ts...");
traverse(ENTRY_FILE);

const dependencies = [...visited]
  .map((filePath) => path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"))
  .sort();

console.log(`Audited ${dependencies.length} internal files in worker dependency graph.`);

if (dependencyOutput) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT_DIR, dependencyOutput)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT_DIR, dependencyOutput), `${dependencies.join("\n")}\n`, "utf-8");
}

if (listDependencies) {
  console.log("\nWorker dependency graph:");
  for (const dependency of dependencies) {
    console.log(dependency);
  }
}

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error("\n[AUDIT FAILED] Forbidden dependencies detected in worker graph:");
  for (const violation of violations) {
    console.error(`  - In ${violation.file}: imports "${violation.imported}" (${violation.label})`);
    console.error(`    Trace: ${violation.chain.join(" -> ")}`);
  }
} else {
  console.log("\n[AUDIT PASSED] Zero forbidden dependencies detected in worker graph.");
  console.log("All modules are framework-neutral and compatible with Deno execution.");
}

if (checkDeployPaths) {
  try {
    if (validateDeployPathCoverage(dependencies).length > 0) failed = true;
  } catch (error) {
    failed = true;
    console.error(`\n[DEPLOY PATH AUDIT FAILED] ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failed ? 1 : 0);

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
 * Deployment trigger decisions live in `.github/workflows/deploy.yml`. This
 * script intentionally does not mirror or validate GitHub Actions `paths`
 * entries; callers can use `--dependency-output=<file>` to consume the computed
 * graph directly instead of maintaining a second hand-written dependency list.
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

const args = process.argv.slice(2);
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

if (listDependencies) {
  console.log("\nWorker dependency graph:");
  for (const dependency of dependencies) {
    console.log(dependency);
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

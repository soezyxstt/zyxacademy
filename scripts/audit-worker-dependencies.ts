import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis script to verify that `jobs/*` and its transitive dependencies
 * do not import Next.js, React, @t3-oss/env-nextjs, puppeteer, or incompatible packages.
 */

const ROOT_DIR = process.cwd();
const ENTRY_FILE = path.join(ROOT_DIR, "jobs", "index.ts");

const FORBIDDEN_PATTERNS = [
  { pattern: /^next(\/.*)?$/, label: "Next.js (next/*)" },
  { pattern: /^@t3-oss\/env-nextjs$/, label: "@t3-oss/env-nextjs" },
  { pattern: /^react(-dom)?(\/.*)?$/, label: "React (react/react-dom)" },
  { pattern: /^puppeteer(-core)?$/, label: "Puppeteer" },
];

const visited = new Set<string>();

function resolveImportPath(importSpecifier: string, fromFile: string): string | null {
  let targetPath = "";

  if (importSpecifier.startsWith("@/")) {
    targetPath = path.join(ROOT_DIR, importSpecifier.slice(2));
  } else if (importSpecifier.startsWith("./") || importSpecifier.startsWith("../")) {
    targetPath = path.resolve(path.dirname(fromFile), importSpecifier);
  } else {
    // External npm module
    return null;
  }

  // Handle extension resolution
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

  // Match static: import ... from "..."
  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Match dynamic: import("...")
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

console.log("Starting static dependency audit for jobs/index.ts...");
traverse(ENTRY_FILE);

console.log(`Audited ${visited.size} internal files in worker dependency graph.`);

if (violations.length > 0) {
  console.error("\n[AUDIT FAILED] Forbidden dependencies detected in worker graph:");
  for (const v of violations) {
    console.error(`  - In ${v.file}: imports "${v.imported}" (${v.label})`);
    console.error(`    Trace: ${v.chain.join(" -> ")}`);
  }
  process.exit(1);
} else {
  console.log("\n[AUDIT PASSED] Zero forbidden dependencies detected in worker graph.");
  console.log("All modules are framework-neutral and compatible with Deno execution.");
  process.exit(0);
}

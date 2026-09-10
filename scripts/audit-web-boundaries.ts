import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static analysis script to verify that `app/**` and its transitive dependencies
 * do not import native heavy compute modules: sharp, pdf-parse, puppeteer,
 * compute background jobs, or internal compute modules.
 *
 * `@/lib/thumbnail` is intentionally web-safe: it only dispatches an Inngest
 * event. The renderer itself lives under `@/lib/compute/pdf-thumbnail`.
 */

const ROOT_DIR = process.cwd();
const APP_DIR = path.join(ROOT_DIR, "app");

const FORBIDDEN_PATTERNS = [
  { pattern: /^sharp$/, label: "Sharp native image processing (sharp)" },
  { pattern: /^pdf-parse$/, label: "pdf-parse native parser (pdf-parse)" },
  { pattern: /^puppeteer(-core)?$/, label: "Puppeteer (puppeteer)" },
  { pattern: /^@\/jobs\/compute(\/.*)?$/, label: "Compute Jobs (@/jobs/compute)" },
  { pattern: /^@\/lib\/compute\/pdf-thumbnail(\/.*)?$/, label: "Heavy PDF Thumbnail Generator (@/lib/compute/pdf-thumbnail)" },
];

const EXCLUDED_FILES = [
  "lib/zyra/images/sanitizer.ts",
];

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
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const imports: string[] = [];
  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(content)) !== null) imports.push(match[1]);
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) imports.push(match[1]);
  return imports;
}

export interface WebBoundaryViolation {
  file: string;
  imported: string;
  label: string;
  chain: string[];
}

export function findAppFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") results.push(...findAppFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function auditWebBoundaries(): WebBoundaryViolation[] {
  visited.clear();
  const violations: WebBoundaryViolation[] = [];
  const appFiles = findAppFiles(APP_DIR);

  function traverse(filePath: string, callStack: string[] = []) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
    const imports = extractImports(filePath);

    for (const imp of imports) {
      for (const forbidden of FORBIDDEN_PATTERNS) {
        if (forbidden.pattern.test(imp)) {
          if (EXCLUDED_FILES.includes(relativePath)) continue;
          violations.push({ file: relativePath, imported: imp, label: forbidden.label, chain: [...callStack, relativePath] });
        }
      }
      const resolved = resolveImportPath(imp, filePath);
      if (resolved && !resolved.includes("node_modules")) traverse(resolved, [...callStack, relativePath]);
    }
  }

  for (const entryFile of appFiles) traverse(entryFile);
  return violations;
}

if (import.meta.main || process.argv[1]?.endsWith("audit-web-boundaries.ts")) {
  console.log("Starting static dependency audit for web tier boundaries (app/**)...");
  const violations = auditWebBoundaries();
  console.log(`Audited ${visited.size} internal files in web tier graph.`);

  if (violations.length > 0) {
    console.error("\n[AUDIT FAILED] Forbidden heavy compute dependencies detected in web tier:");
    for (const v of violations) {
      console.error(`  - In ${v.file}: imports "${v.imported}" (${v.label})`);
      console.error(`    Trace: ${v.chain.join(" -> ")}`);
    }
    process.exit(1);
  }

  console.log("\n[AUDIT PASSED] Zero forbidden compute dependencies detected in web tier.");
  console.log("All routes in app/** strictly adhere to the Vercel web tier boundaries.");
  process.exit(0);
}

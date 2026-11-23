import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static boundary audit script for mobile/desktop UI separation.
 *
 * Scans `features/<feature>/ui/{mobile,desktop}/**` and reports violations if:
 * 1. `features/<feature>/ui/mobile/**` imports from `features/<other>/ui/desktop/**` (or vice versa).
 * 2. `features/<feature>/ui/mobile/**` imports desktop-only table or sidebar primitives.
 * 3. `features/<feature>/ui/{desktop,mobile}/**` imports `@/db` directly.
 */

export type UiSeparationSurface = "mobile" | "desktop";

export type UiSeparationRuleId =
  | "cross-surface-import"
  | "mobile-desktop-primitive"
  | "ui-direct-db-import";

export interface UiSeparationViolation {
  file: string;
  line: number;
  imported: string;
  rule: UiSeparationRuleId;
  message: string;
}

export interface UiSeparationAuditResult {
  auditedFiles: number;
  violations: UiSeparationViolation[];
}

export const DESKTOP_ONLY_PRIMITIVES = [
  "components/admin/table",
  "components/ui/table",
  "components/sidebar-shell",
  "components/navigation/desktop-sidebar-shell",
  "components/student-sidebar",
  "components/admin-sidebar",
  "components/tutor/tutor-sidebar",
] as const;

const SOURCE_FILE_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MODULE_EXT_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DESKTOP_UI_PATH_REGEX = /^features\/[^/]+\/ui\/desktop(?:\/|$)/;
const MOBILE_UI_PATH_REGEX = /^features\/[^/]+\/ui\/mobile(?:\/|$)/;
const DB_PATH_REGEX = /^db(?:\/|$)/;

interface ExtractedImport {
  specifier: string;
  line: number;
}

/**
 * Strip single-line and multi-line comments while preserving newline positions
 * so reported line numbers remain exact.
 */
function stripCommentsPreservingLines(source: string): string {
  let result = "";
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (inSingleQuote) {
      result += ch;
      if (ch === "\\" && i + 1 < source.length) {
        result += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingleQuote = false;
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      result += ch;
      if (ch === "\\" && i + 1 < source.length) {
        result += next;
        i += 2;
        continue;
      }
      if (ch === '"') inDoubleQuote = false;
      i += 1;
      continue;
    }

    if (inTemplate) {
      result += ch;
      if (ch === "\\" && i + 1 < source.length) {
        result += next;
        i += 2;
        continue;
      }
      if (ch === "`") inTemplate = false;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          i += 2;
          break;
        }
        if (source[i] === "\n") {
          result += "\n";
        }
        i += 1;
      }
      continue;
    }

    if (ch === "'") inSingleQuote = true;
    else if (ch === '"') inDoubleQuote = true;
    else if (ch === "`") inTemplate = true;

    result += ch;
    i += 1;
  }

  return result;
}

function getLineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

export function extractImportsWithLines(content: string): ExtractedImport[] {
  const sanitized = stripCommentsPreservingLines(content);
  const results: ExtractedImport[] = [];

  const patterns = [
    /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sanitized)) !== null) {
      const specifier = match[1];
      const specifierOffset = match.index + match[0].indexOf(specifier);
      results.push({
        specifier,
        line: getLineNumberAt(sanitized, specifierOffset),
      });
    }
  }

  results.sort((a, b) => a.line - b.line);
  return results;
}

function normalizeSpecifierToRepoPath(
  specifier: string,
  fromFile: string,
  rootDir: string,
): string | null {
  let rawPath: string;
  if (specifier.startsWith("@/")) {
    rawPath = specifier.slice(2);
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = path.resolve(path.dirname(fromFile), specifier);
    rawPath = path.relative(rootDir, resolved);
  } else {
    return null;
  }

  return rawPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(MODULE_EXT_REGEX, "")
    .replace(/\/index$/, "");
}

function matchesDesktopOnlyPrimitive(normalizedPath: string): string | null {
  for (const primitive of DESKTOP_ONLY_PRIMITIVES) {
    if (normalizedPath === primitive || normalizedPath.startsWith(`${primitive}/`)) {
      return `@/${primitive}`;
    }
  }
  return null;
}

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        files.push(...walkSourceFiles(fullPath));
      }
    } else if (SOURCE_FILE_REGEX.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function getSurfaceTargetFiles(rootDir: string): Array<{ filePath: string; surface: UiSeparationSurface }> {
  const featuresDir = path.join(rootDir, "features");
  if (!fs.existsSync(featuresDir)) return [];

  const targets: Array<{ filePath: string; surface: UiSeparationSurface }> = [];
  const featureEntries = fs.readdirSync(featuresDir, { withFileTypes: true });

  for (const featureEntry of featureEntries) {
    if (!featureEntry.isDirectory()) continue;

    for (const surface of ["mobile", "desktop"] as const) {
      const surfaceDir = path.join(featuresDir, featureEntry.name, "ui", surface);
      if (!fs.existsSync(surfaceDir)) continue;

      for (const filePath of walkSourceFiles(surfaceDir)) {
        targets.push({ filePath, surface });
      }
    }
  }

  return targets;
}

export function auditUiSeparation(rootDir: string = process.cwd()): UiSeparationAuditResult {
  const targets = getSurfaceTargetFiles(rootDir);
  const violations: UiSeparationViolation[] = [];

  for (const { filePath, surface } of targets) {
    const relativeFile = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");
    const imports = extractImportsWithLines(content);

    for (const { specifier, line } of imports) {
      const normalized = normalizeSpecifierToRepoPath(specifier, filePath, rootDir);
      if (!normalized) continue;

      if (surface === "mobile" && DESKTOP_UI_PATH_REGEX.test(normalized)) {
        violations.push({
          file: relativeFile,
          line,
          imported: specifier,
          rule: "cross-surface-import",
          message:
            "Mobile UI must not import from desktop UI. Move shared UI to features/*/ui/shared/ or shared logic to model/ or data/.",
        });
      }

      if (surface === "desktop" && MOBILE_UI_PATH_REGEX.test(normalized)) {
        violations.push({
          file: relativeFile,
          line,
          imported: specifier,
          rule: "cross-surface-import",
          message:
            "Desktop UI must not import from mobile UI. Move shared UI to features/*/ui/shared/ or shared logic to model/ or data/.",
        });
      }

      if (surface === "mobile") {
        const matchedPrimitive = matchesDesktopOnlyPrimitive(normalized);
        if (matchedPrimitive) {
          violations.push({
            file: relativeFile,
            line,
            imported: specifier,
            rule: "mobile-desktop-primitive",
            message: `Mobile UI must not import desktop-only primitive (${matchedPrimitive}).`,
          });
        }
      }

      if (DB_PATH_REGEX.test(normalized)) {
        violations.push({
          file: relativeFile,
          line,
          imported: specifier,
          rule: "ui-direct-db-import",
          message:
            "UI files under features/*/ui/{desktop,mobile} must not import @/db directly. Move data access and types to features/*/data/ or features/*/model/.",
        });
      }
    }
  }

  return {
    auditedFiles: targets.length,
    violations,
  };
}

export function formatUiSeparationViolations(violations: UiSeparationViolation[]): string {
  return violations
    .map((v) => `  - ${v.file}:${v.line}: [${v.rule}] imports "${v.imported}". ${v.message}`)
    .join("\n");
}

if (import.meta.main || process.argv[1]?.endsWith("audit-ui-separation.ts")) {
  console.log("Starting static boundary audit for UI separation (features/*/ui/{mobile,desktop}/**)...");
  const result = auditUiSeparation(process.cwd());
  console.log(`Audited ${result.auditedFiles} UI separation files.`);

  if (result.violations.length > 0) {
    console.error("\n[AUDIT FAILED] UI separation boundary violations detected:");
    console.error(formatUiSeparationViolations(result.violations));
    process.exit(1);
  }

  console.log("\n[AUDIT PASSED] Zero UI separation boundary violations detected.");
  process.exit(0);
}

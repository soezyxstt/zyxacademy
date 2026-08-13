import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import {
 parseCliArgs,
 writeArtifact,
} from "@/lib/staging/migration-ledger";

export type RoleLiteralCategory = "access-role" | "schema-legacy" | "chat-speaker" | "fixture" | "identifier" | "copy" | "unclassified";

export type RoleLiteralOccurrence = {
 file: string;
 line: number;
 column: number;
 literal: "teacher" | "student";
 category: RoleLiteralCategory;
 text: string;
};

const ROOTS = ["app", "components", "db", "lib", "scripts", "tests", "docs"];
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "artifacts", "drizzle"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".mdx", ".json"]);
const LITERAL_PATTERN = /(["'`])(teacher|student)\1/g;

function looksLikeAccessRole(line: string): boolean {
 return /(session\.user|user\.role|role\s*(===|!==|==|!=)|additionalFields|legacy.?role|mapLegacyRole|hasPeran|hasAnyPeran)/i.test(line);
}

function looksLikeChatSpeaker(file: string, line: string): boolean {
 return /(tutor.?chat|conversation|speaker|message|chat.?message|ConversationMemory|ConversationTurn)/i.test(`${file} ${line}`)
  || /role\s*:\s*["'`]student["'`]/i.test(line) && /(history|messages|turns|chat)/i.test(line);
}

function looksLikeFixture(file: string, line: string): boolean {
 return /(^|[\\/])(tests?|fixtures?|seed[^\\/]*)[\\/]|(^|[\\/])scripts[\\/]seed/i.test(file)
  || /(fixture|seed|mock|test.?user|demo.?student)/i.test(line);
}

function looksLikeSchemaLegacy(file: string, line: string): boolean {
 return /(^|[\\/])db[\\/]schema\.ts$/i.test(file) && /(role|student|teacher)/i.test(line);
}

function looksLikeIdentifier(line: string): boolean {
 return /(student|teacher)[_-][a-z0-9]|[A-Z_]*(STUDENT|TEACHER)[A-Z_]*|email|user.?id|course.?id|template.?id/i.test(line);
}

function looksLikeCopy(file: string, line: string): boolean {
 return /\.(tsx?|jsx?|mdx?|md|json)$/i.test(file) && (/</.test(line) || /[.!? ]/.test(line));
}

export function classifyRoleLiteral(file: string, line: string): RoleLiteralCategory {
 if (looksLikeSchemaLegacy(file, line)) return "schema-legacy";
 if (looksLikeChatSpeaker(file, line)) return "chat-speaker";
 if (looksLikeAccessRole(line)) return "access-role";
 if (looksLikeFixture(file, line)) return "fixture";
 if (looksLikeIdentifier(line)) return "identifier";
 if (looksLikeCopy(file, line)) return "copy";
 return "unclassified";
}

async function collectFiles(directory: string): Promise<string[]> {
 const entries = await readdir(directory, { withFileTypes: true });
 const files: string[] = [];
 for (const entry of entries) {
  if (entry.isDirectory()) {
   if (IGNORED_DIRECTORIES.has(entry.name)) continue;
   files.push(...await collectFiles(resolve(directory, entry.name)));
   continue;
  }
  if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(resolve(directory, entry.name));
 }
 return files;
}

async function main(): Promise<void> {
 const args = parseCliArgs();
 const runId = typeof args["run-id"] === "string" ? args["run-id"] : undefined;
 const root = process.cwd();
 const occurrences: RoleLiteralOccurrence[] = [];
 for (const sourceRoot of ROOTS) {
  const directory = resolve(root, sourceRoot);
  for (const file of await collectFiles(directory)) {
   const relativeFile = relative(root, file).replaceAll("\\", "/");
   const content = await readFile(file, "utf8");
   const lines = content.split(/\r?\n/);
   lines.forEach((line, index) => {
    for (const match of line.matchAll(LITERAL_PATTERN)) {
     const literal = match[2] as "teacher" | "student";
     occurrences.push({
      file: relativeFile,
      line: index + 1,
      column: (match.index ?? 0) + 1,
      literal,
      category: classifyRoleLiteral(relativeFile, line),
      text: line.trim().slice(0, 200),
     });
    }
   });
  }
 }

 occurrences.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column);
 const counts = Object.fromEntries(
  ["access-role", "schema-legacy", "chat-speaker", "fixture", "identifier", "copy", "unclassified"].map((category) => [
   category,
   occurrences.filter((occurrence) => occurrence.category === category).length,
  ]),
 );
 const report = {
  status: occurrences.some((occurrence) => occurrence.category === "unclassified") ? "blocked" : "passed",
  rulesVersion: "peran-role-literals-v1",
  counts,
  occurrences,
 };
 if (runId) await writeArtifact(runId, "role-literals.json", report);
 else await writeArtifact("role-literal-inventory", "role-literals.json", report);
 console.log(JSON.stringify({
  status: report.status,
  total: occurrences.length,
  counts,
  artifact: runId ? `artifacts/staging-overhaul/${runId}/role-literals.json` : "artifacts/staging-overhaul/role-literal-inventory/role-literals.json",
 }));
 if (report.status !== "passed") process.exitCode = 1;
}

void main();

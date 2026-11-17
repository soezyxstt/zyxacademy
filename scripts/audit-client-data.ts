import ts from "typescript";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const roots = ["app", "components", "hooks", "lib", "jobs", "workers", "db"];
const cwd = process.cwd();
const files: string[] = [];
function walk(dir: string) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".d.ts")) files.push(path);
  }
}
roots.forEach((root) => walk(resolve(cwd, root)));
const fileSet = new Set(files);
function localImport(from: string, specifier: string) {
  const base = specifier.startsWith("@/") ? resolve(cwd, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find((path) => fileSet.has(path)) ?? null;
}
const modules = files.map((path) => {
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const directives = ast.statements.filter(ts.isExpressionStatement).map((statement) => ts.isStringLiteral(statement.expression) ? statement.expression.text : "");
  const imports = ast.statements.filter(ts.isImportDeclaration).filter((statement) => !statement.importClause?.isTypeOnly)
    .map((statement) => ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "");
  const calls: { name: string; line: number; target?: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (["fetch", "requestJson", "requestVoid", "useQuery", "useInfiniteQuery", "useMutation", "queryOptions", "mutationOptions", "EventSource", "WebSocket", "XMLHttpRequest"].includes(name)) {
        const arg = node.arguments?.[0];
        calls.push({ name, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          ...(arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg)) ? { target: arg.getText(ast) } : {}) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { path, client: directives.includes("use client"), action: directives.includes("use server"), imports, calls, lines: source.split("\n").length, source };
});
const byPath = new Map(modules.map((sourceModule) => [sourceModule.path, sourceModule]));
const reachable = new Set<string>();
function mark(path: string) {
  if (reachable.has(path)) return;
  const sourceModule = byPath.get(path);
  if (!sourceModule || sourceModule.action) return;
  reachable.add(path);
  for (const specifier of sourceModule.imports) { const next = localImport(path, specifier); if (next) mark(next); }
}
modules.filter((sourceModule) => sourceModule.client).forEach((sourceModule) => mark(sourceModule.path));
const entries = modules.filter((sourceModule) => sourceModule.calls.length || sourceModule.action).map((sourceModule) => {
  const path = relative(cwd, sourceModule.path).replaceAll("\\", "/");
  const browser = reachable.has(sourceModule.path);
  const names = sourceModule.calls.map((call) => call.name);
  const transport = names.some((name) => ["WebSocket", "EventSource", "XMLHttpRequest"].includes(name)) || /getReader\(|text\/event-stream/.test(sourceModule.source);
  const query = names.some((name) => ["useQuery", "useInfiniteQuery", "useMutation", "queryOptions", "mutationOptions", "requestJson", "requestVoid"].includes(name));
  return { path, lines: sourceModule.lines, clientDirective: sourceModule.client, browserReachable: browser,
    classification: sourceModule.action ? "server-action" : !browser ? "server-or-worker" : transport ? "specialized-transport" : query || path.startsWith("lib/query/") ? "query-layer" : "manual-browser-fetch",
    calls: sourceModule.calls, serverActionImports: sourceModule.imports.filter((specifier) => { const next = localImport(sourceModule.path, specifier); return next ? byPath.get(next)?.action : false; }) };
});
const report = {
  schemaVersion: 1,
  note: "Static source inventory, not runtime tracing. Import reachability is conservative; dynamic imports, re-exports and indirect transports require manual review. Server actions retain their server boundary.",
  totals: { sourceModules: modules.length, explicitClientModules: modules.filter((sourceModule) => sourceModule.client).length,
    browserReachableModules: reachable.size, apiRoutes: modules.filter((sourceModule) => /[\/]app[\/]api[\/].*[\/]route\.ts$/.test(sourceModule.path)).length,
    byClassification: Object.fromEntries([...new Set(entries.map((entry) => entry.classification))].sort().map((name) => [name, entries.filter((entry) => entry.classification === name).length])) },
  entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
};
const output = process.argv[2];
if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(output ? { output, totals: report.totals } : report, null, 2));

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const baseNamespaces = ["core", "common", "auth", "student", "studentCourse", "learning", "zyra", "admin", "adminAcademic", "adminOps", "adminEval", "adminForms", "adminMedia", "tutor", "studentExtras", "consent", "notifications", "search", "publicForms", "marketing"];
const locales = ["id", "en"];

const discoveredNamespaces = new Set(baseNamespaces);
for (const locale of locales) {
  try {
    for (const filename of await readdir(resolve(process.cwd(), "messages", locale))) {
      if (filename.endsWith(".json")) discoveredNamespaces.add(filename.slice(0, -5));
    }
  } catch {
    // Missing locale directories are reported below as missing catalogs.
  }
}
const namespaces = [...discoveredNamespaces].sort();

function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const variants = new Map<string, unknown>();
    for (const item of value) {
      const shaped = shape(item);
      variants.set(JSON.stringify(shaped), shaped);
    }
    return [...variants.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => item);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, shape(child)]));
  }
  return typeof value;
}

const errors: string[] = [];
const messages = new Map<string, Record<string, unknown>>();
for (const namespace of namespaces) {
  const catalogs = new Map<string, unknown>();
  for (const locale of locales) {
    const path = resolve(process.cwd(), "messages", locale, `${namespace}.json`);
    try {
      const content = JSON.parse(await readFile(path, "utf8"));
      if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("catalog root must be an object");
      catalogs.set(locale, content);
      messages.set(`${locale}:${namespace}`, content);
    } catch (error) {
      errors.push(`${locale}/${namespace}.json: ${(error as Error).message}`);
    }
  }
  if (catalogs.has("id") && catalogs.has("en") && JSON.stringify(shape(catalogs.get("id"))) !== JSON.stringify(shape(catalogs.get("en")))) {
    errors.push(`${namespace}: id/en message key structures differ`);
  }
}

function unwrap(node: ts.Expression): ts.Expression {
  let expression = node;
  while (ts.isAwaitExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function stringArgument(call: ts.CallExpression, index: number): string | null {
  const argument = call.arguments[index];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function isTranslatorFactory(call: ts.CallExpression): boolean {
  const expression = call.expression;
  return ts.isIdentifier(expression) && (expression.text === "useTranslations" || expression.text === "getTranslations");
}

function getParallelTranslatorNamespaces(initializer: ts.Expression): Map<number, string> {
  const result = new Map<number, string>();
  const expression = unwrap(initializer);
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)
    || expression.expression.name.text !== "all" || !ts.isIdentifier(expression.expression.expression)
    || expression.expression.expression.text !== "Promise") return result;
  const array = expression.arguments[0];
  if (!array || !ts.isArrayLiteralExpression(array)) return result;
  array.elements.forEach((element, index) => {
    const value = unwrap(element as ts.Expression);
    if (ts.isCallExpression(value) && isTranslatorFactory(value)) {
      const namespace = stringArgument(value, 0);
      if (namespace) result.set(index, namespace);
    }
  });
  return result;
}

function lookupMessage(namespace: string, key: string, locale: string, allowStructured = false): boolean {
  let value: unknown = messages.get(`${locale}:${namespace.split(".")[0]}`);
  for (const part of [...namespace.split(".").slice(1), ...key.split(".")]) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(part) || Number(part) >= value.length) return false;
      value = value[Number(part)];
    } else {
      if (!value || typeof value !== "object" || !(part in value)) return false;
      value = (value as Record<string, unknown>)[part];
    }
  }
  return allowStructured ? value !== undefined : typeof value === "string";
}

const sourceFiles = ["app", "components", "lib"];
async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

let checkedCalls = 0;
for (const root of sourceFiles) {
  for (const path of await collectTypeScriptFiles(resolve(process.cwd(), root))) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const translators = new Map<string, string>();
    const clientHookNames = new Set<string>();
    const calls: Array<{ call: ts.CallExpression; namespace: string; allowStructured: boolean }> = [];

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
        || statement.moduleSpecifier.text !== "@/lib/i18n/client" || !statement.importClause?.namedBindings
        || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
      for (const specifier of statement.importClause.namedBindings.elements) {
        if (specifier.propertyName?.text === "useTranslations" || specifier.name.text === "useTranslations"
          || specifier.propertyName?.text === "useAppLocale" || specifier.name.text === "useAppLocale") {
          clientHookNames.add(specifier.name.text);
        }
      }
    }

    const hasUseClientDirective = source.statements.some((statement) =>
      ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client"
    );

    function bind(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = unwrap(node.initializer);
        if (ts.isIdentifier(node.name) && ts.isCallExpression(initializer) && isTranslatorFactory(initializer)) {
          const namespace = stringArgument(initializer, 0);
          if (namespace) translators.set(node.name.text, namespace);
        } else if (ts.isArrayBindingPattern(node.name)) {
          const parallel = getParallelTranslatorNamespaces(node.initializer);
          node.name.elements.forEach((binding, index) => {
            if (ts.isBindingElement(binding) && ts.isIdentifier(binding.name) && parallel.has(index)) {
              translators.set(binding.name.text, parallel.get(index)!);
            }
          });
        }
      }
      ts.forEachChild(node, bind);
    }
    bind(source);

    function collect(node: ts.Node) {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        let current: ts.Node | undefined = node.parent;
        let insideRouteTitleHelper = false;
        while (current) {
          if (ts.isFunctionDeclaration(current) && current.name?.text === "getRouteTitle") {
            insideRouteTitleHelper = true;
            break;
          }
          current = current.parent;
        }
        let variable: string | null = null;
        let allowStructured = false;
        if (ts.isIdentifier(node.expression)) variable = node.expression.text;
        else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
          variable = node.expression.expression.text;
          allowStructured = node.expression.name.text === "raw";
        }
        const namespace = variable ? translators.get(variable) : undefined;
        const key = stringArgument(node, 0);
        if (namespace && key && !(path.endsWith("/components/mobile-navbar.tsx") && insideRouteTitleHelper)) {
          calls.push({ call: node, namespace, allowStructured });
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && clientHookNames.has(node.expression.text) && !hasUseClientDirective) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        errors.push(`${path.replace(`${process.cwd()}/`, "")}:${line}: client i18n hook ${node.expression.text} requires a \"use client\" directive`);
      }
      ts.forEachChild(node, collect);
    }
    collect(source);

    for (const { call, namespace, allowStructured } of calls) {
      const key = stringArgument(call, 0)!;
      checkedCalls += 1;
      for (const locale of locales) {
        if (!lookupMessage(namespace, key, locale, allowStructured)) {
          const line = source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1;
          errors.push(`${path.replace(`${process.cwd()}/`, "")}:${line}: ${locale} missing ${namespace}.${key}`);
        }
      }
    }
  }
}

if (errors.length) {
  const grouped = new Map<string, string[]>();
  for (const error of errors) {
    const namespace = error.match(/missing ([\w-]+)\./)?.[1]
      ?? error.match(/^([\w-]+): id\/en/)?.[1]
      ?? error.match(/(?:id|en)\/([\w-]+)\.json/)?.[1]
      ?? "other";
    const group = grouped.get(namespace) ?? [];
    group.push(error);
    grouped.set(namespace, group);
  }
  console.error(`Found ${errors.length} i18n issues across ${grouped.size} groups:`);
  for (const [namespace, group] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    console.error(`\n[${namespace}] ${group.length} issue(s)`);
    for (const error of group.slice(0, 8)) console.error(`  ${error}`);
    if (group.length > 8) console.error(`  …and ${group.length - 8} more in this group`);
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${namespaces.length} bilingual message namespaces and ${checkedCalls} static translation calls.`);
}

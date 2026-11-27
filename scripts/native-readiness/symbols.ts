#!/usr/bin/env bun
/** Source candidates for human review, never proof of native parity. */
import ts from 'typescript'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'

const exported = (node: ts.Node) => !!ts.getModifiers(node as ts.HasModifiers)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
const defaulted = (node: ts.Node) => !!ts.getModifiers(node as ts.HasModifiers)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)
const isFunction = (node: ts.Node): node is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)

export function inspectModule(path: string, source: string) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const candidates: any[] = []
  const exports: any[] = []
  const unresolved: any[] = []
  const imports: any[] = []
  const position = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file))
  const line = (node: ts.Node) => position(node).line + 1
  const text = (node: ts.Node) => node.getText(file)
  const marker = (kind: string, node: ts.Node, detail: string) => unresolved.push({ kind, line: line(node), detail })
  const seen = new Set<ts.Node>()

  // Stop at nested functions so a parent's evidence does not come from its child.
  function renderEvidence(node: ts.Node): string[] {
    const found = new Set<string>()
    function visit(child: ts.Node) {
      if (child !== node && isFunction(child) && !(ts.isClassDeclaration(node) && ts.isMethodDeclaration(child))) return
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found.add('jsx')
      if (ts.isCallExpression(child) && /^(React\.)?createElement$/.test(text(child.expression))) found.add('createElement')
      ts.forEachChild(child, visit)
    }
    visit(node)
    return [...found].sort()
  }
  function add(name: string, node: ts.Node, kind: string, evidence: string[], extra: object = {}) {
    const column = position(node).character + 1
    candidates.push({ id: `${path}#${name}@${line(node)}:${column}`, name, line: line(node), column, kind, evidence, status: 'unverified', ...extra })
    seen.add(node)
  }
  function inspectFunction(node: ts.Node, name: string, kind: string) {
    const evidence = renderEvidence(node)
    if (evidence.length || /^[A-Z]/.test(name) || name === 'default') {
      add(name, node, kind, evidence)
      if (!evidence.length) marker('component_shape_unconfirmed', node, name)
    }
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      if (clause && !clause.isTypeOnly) {
        const specifier = node.moduleSpecifier.text
        if (clause.name) imports.push({ local: clause.name.text, imported: 'default', specifier, line: line(node) })
        const bindings = clause.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) imports.push({ local: bindings.name.text, imported: '*', specifier, line: line(node) })
        if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) if (!item.isTypeOnly) imports.push({ local: item.name.text, imported: item.propertyName?.text ?? item.name.text, specifier, line: line(node) })
      }
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const specifier = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null
      if (!node.exportClause) {
        exports.push({ name: '*', local: null, specifier, line: line(node), kind: 'star' })
        marker('star_export_requires_resolution', node, specifier ?? '')
      } else if (ts.isNamespaceExport(node.exportClause)) {
        exports.push({ name: node.exportClause.name.text, local: '*', specifier, line: line(node), kind: 'namespace' })
        marker('namespace_export_requires_resolution', node, text(node.exportClause))
      } else {
        for (const item of node.exportClause.elements) if (!item.isTypeOnly) {
          exports.push({ name: item.name.text, local: item.propertyName?.text ?? item.name.text, specifier, line: line(item), kind: specifier ? 'reexport' : 'alias' })
          marker(specifier ? 'reexport_requires_resolution' : 'export_alias_requires_resolution', item, specifier ? `${specifier}:${item.propertyName?.text ?? item.name.text}` : `${item.name.text} -> ${item.propertyName?.text ?? item.name.text}`)
        }
      }
    }
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text ?? (defaulted(node) ? 'default' : '<anonymous>')
      inspectFunction(node, name, 'function')
      if (exported(node)) exports.push({ name: defaulted(node) ? 'default' : name, local: name, specifier: null, line: line(node), kind: 'declaration' })
    }
    if (ts.isClassDeclaration(node)) {
      const name = node.name?.text ?? (defaulted(node) ? 'default' : '<anonymous>')
      const evidence = renderEvidence(node)
      if (evidence.length || /^[A-Z]/.test(name) || name === 'default') {
        add(name, node, 'class', evidence)
        if (!evidence.length) marker('component_shape_unconfirmed', node, name)
      }
      if (exported(node)) exports.push({ name: defaulted(node) ? 'default' : name, local: name, specifier: null, line: line(node), kind: 'declaration' })
    }
    if (ts.isVariableDeclaration(node) && !ts.isIdentifier(node.name)) marker('destructured_binding_requires_review', node, text(node.name))
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text
      const init = node.initializer
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        inspectFunction(init, name, 'function_variable')
        seen.add(init)
      } else if (init && ts.isIdentifier(init) && /^[A-Z]/.test(name)) {
        add(name, node, 'alias', [], { target: init.text })
        marker('alias_requires_resolution', node, `${name} -> ${init.text}`)
      } else if (init && ts.isCallExpression(init) && /^[A-Z]/.test(name)) {
        add(name, node, 'wrapper', renderEvidence(init), { expression: text(init.expression), arguments: init.arguments.map(text) })
        marker('wrapper_requires_resolution', node, name)
      } else if (init && /^[A-Z]/.test(name)) {
        marker('component_shape_unconfirmed', node, name)
      }
      const statement = node.parent.parent
      if (ts.isVariableStatement(statement) && exported(statement)) exports.push({ name, local: name, specifier: null, line: line(node), kind: 'declaration' })
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      exports.push({ name: 'default', local: ts.isIdentifier(node.expression) ? node.expression.text : null, specifier: null, line: line(node), kind: 'assignment' })
      if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) {
        inspectFunction(node.expression, 'default', 'default_function')
        seen.add(node.expression)
      } else if (ts.isCallExpression(node.expression)) {
        add('default', node, 'wrapper', renderEvidence(node.expression), { expression: text(node.expression.expression), arguments: node.expression.arguments.map(text) })
        marker('wrapper_requires_resolution', node, 'default')
      } else marker('default_export_requires_resolution', node, text(node.expression))
    }
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) &&
        !ts.isJsxElement(node.parent) && !ts.isJsxFragment(node.parent)) {
      let ancestor: ts.Node | undefined = node.parent
      while (ancestor && !isFunction(ancestor) && !ts.isClassDeclaration(ancestor)) ancestor = ancestor.parent
      if (!ancestor) marker('jsx_outside_function', node, text(node).slice(0, 120))
    }
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !seen.has(node)) {
      const evidence = renderEvidence(node)
      if (evidence.length) marker('anonymous_render_function', node, text(node).slice(0, 120))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const diagnostic of file.parseDiagnostics) {
    const pos = diagnostic.start ?? 0
    unresolved.push({ kind: 'parse_error', line: file.getLineAndCharacterOfPosition(pos).line + 1, detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') })
  }
  if (!candidates.length) unresolved.push({ kind: 'no_component_candidates', line: 1, detail: 'Review utility, reexport, or missed component.' })
  return { path, scope_role: path.startsWith('app/') && path.endsWith('/page.tsx') ? 'page' : 'ui_module', sha256: createHash('sha256').update(source).digest('hex'), status: 'unverified', candidates, exports, imports, unresolved }
}

function main(args: string[]) {
  let root = process.cwd()
  let all = false
  const files: string[] = []
  while (args.length) {
    const arg = args.shift()
    if (arg === '--root' && args.length) root = resolve(args.shift()!)
    else if (arg === '--file' && args.length) files.push(args.shift()!)
    else if (arg === '--all') all = true
    else throw new Error(`Invalid argument: ${arg}. Use --all or repeat --file PATH, optionally --root PATH.`)
  }
  if (all === !!files.length) throw new Error('Choose exactly one of --all or --file.')
  if (all) {
    const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'app', 'components', 'features'], { cwd: root, encoding: 'utf8' })
    files.push(...tracked.split('\0').filter(p => p.endsWith('.tsx') && !p.split('/').includes('visual-fixtures')))
  }
  const paths = [...new Set(files.map(path => {
    const absolute = resolve(root, path)
    const rel = relative(root, absolute)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Path outside root: ${path}`)
    if (!rel.endsWith('.tsx')) throw new Error(`Expected TSX file: ${path}`)
    return rel.split(sep).join('/')
  }))].sort()
  const modules = paths.map(path => inspectModule(path, readFileSync(resolve(root, path), 'utf8')))
  process.stdout.write(JSON.stringify({ schema_version: 1, scope: all ? 'app_components_features_tsx_excluding_visual_fixtures' : 'explicit_files', status: 'unverified', limitations: ['Syntactic candidates only, not a complete component list, runtime graph, or parity evidence.', 'Aliases, exports, wrappers, render callbacks, accessible variants and modules without candidates require manual review.'], modules }, null, 2) + '\n')
}

if (import.meta.main) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}

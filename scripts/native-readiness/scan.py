#!/usr/bin/env python3
"""Bounded, lexical inventory of candidate page dependencies. See README.md."""
import argparse
import hashlib
import json
import re
from pathlib import Path

EXTENSIONS = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.json')
IMPORT = re.compile(r'''^[ \t]*(import|export)\s+(?!type\b)([^;]*?)\s+from\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']''', re.M)
DYNAMIC = re.compile(r'''\bimport\s*\(\s*([^)]*)\)''')
API = re.compile(r'''["'`](/api/[^"'`\s]*)["'`]''')
FETCH = re.compile(r'''\bfetch\s*\(\s*([^,\n)]+)''')
METHOD = re.compile(r'''\bmethod\s*:\s*["'](GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)["']''', re.I)
ACTION = re.compile(r'''\bexport\s+(?:async\s+)?function\s+(\w+)''')
VERB = re.compile(r'''\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b''')
CALL = re.compile(r'''\b([A-Za-z_$][\w$]*)\s*\(''')
DIRECTIVE = re.compile(r'''^\s*["']use (server|client)["']\s*;''')


def line(src, pos):
    return src.count('\n', 0, pos) + 1


def web_path(file):
    parts = file.parts[1:-1]
    # Preserve parallel and intercepting segments, whose runtime URL needs review.
    return '/' + '/'.join(p for p in parts if not (p.startswith('(') and p.endswith(')')))


def resolve(root, current, spec):
    if spec.startswith('@/'):
        base = root / spec[2:]
    elif spec.startswith('.'):
        base = current.parent / spec
    else:
        return None, 'external_package'
    for candidate in [base, *(Path(str(base) + ext) for ext in EXTENSIONS), *(base / ('index' + ext) for ext in EXTENSIONS)]:
        if candidate.is_file():
            try:
                return candidate.resolve().relative_to(root), None
            except ValueError:
                return None, 'outside_root'
    return None, 'missing_local_module'


def read(root, path, cache):
    if path not in cache:
        cache[path] = (root / path).read_text(encoding='utf-8')
    return cache[path]


def route_regex(route):
    bits = []
    for p in route.strip('/').split('/'):
        if p.startswith('[[...') and p.endswith(']]'):
            bits.append(r'(?:/.*)?')
        elif p.startswith('[...') and p.endswith(']'):
            bits.append(r'/.+')
        elif p.startswith('[') and p.endswith(']'):
            bits.append(r'/[^/]+')
        else:
            bits.append('/' + re.escape(p))
    return '^' + ''.join(bits) + '/?$'


def scan(root, pages, max_depth):
    root = root.resolve()
    cache = {}
    handlers = []
    for file in sorted((root / 'app').rglob('route.*')):
        rel = file.relative_to(root)
        if file.suffix not in EXTENSIONS:
            continue
        source = read(root, rel, cache)
        handlers.append({'path': str(rel), 'route': web_path(rel), 'methods': sorted(set(VERB.findall(source)))})
    results = []
    for page in sorted(pages):
        page = Path(page)
        if not (root / page).is_file():
            raise ValueError(f'Page does not exist: {page}')
        roots = [page]
        for directory in [page.parent, *page.parent.parents]:
            if not directory.parts or directory.parts[0] != 'app':
                break
            for extension in ('.tsx', '.ts', '.jsx', '.js'):
                layout = directory / ('layout' + extension)
                if (root / layout).is_file():
                    roots.append(layout)
        queue = [(p, 0) for p in roots]
        seen, modules, imports, references, unresolved = set(), [], [], [], []
        while queue:
            path, depth = queue.pop(0)
            if path in seen:
                continue
            seen.add(path)
            source = read(root, path, cache)
            directive = DIRECTIVE.match(source)
            modules.append({'path': str(path), 'depth': depth, 'directive': directive.group(1) if directive else None,
                            'sha256': hashlib.sha256(source.encode()).hexdigest()})
            for match in IMPORT.finditer(source):
                spec = match.group(3) or match.group(4)
                target, reason = resolve(root, root / path, spec)
                item = {'source': str(path), 'line': line(source, match.start()), 'specifier': spec,
                        'target': str(target) if target else None, 'kind': 'static_import_or_reexport'}
                if reason:
                    if reason != 'external_package':
                        unresolved.append({**item, 'reason': reason})
                    continue
                imports.append(item)
                target_source = read(root, target, cache)
                target_directive = DIRECTIVE.match(target_source)
                if target_directive and target_directive.group(1) == 'server':
                    names = set(ACTION.findall(target_source))
                    binding = match.group(2) or ''
                    for name in sorted(names):
                        if re.search(r'\b' + re.escape(name) + r'\b', binding):
                            references.append({'kind': 'server_action_import', 'source': str(path), 'line': item['line'],
                                               'target': str(target), 'symbol': name, 'evidence': 'explicit_import', 'status': 'unverified'})
                if depth < max_depth:
                    queue.append((target, depth + 1))
                else:
                    unresolved.append({**item, 'reason': 'depth_limit'})
            for match in DYNAMIC.finditer(source):
                expression = match.group(1).strip()
                literal = re.fullmatch(r'''["']([^"']+)["']''', expression)
                target, reason = resolve(root, root / path, literal.group(1)) if literal else (None, 'dynamic_expression')
                item = {'source': str(path), 'line': line(source, match.start()), 'expression': expression,
                        'target': str(target) if target else None, 'kind': 'dynamic_import'}
                if target:
                    imports.append(item)
                    if depth < max_depth:
                        queue.append((target, depth + 1))
                    else:
                        unresolved.append({**item, 'reason': 'depth_limit'})
                elif reason != 'external_package':
                    unresolved.append({**item, 'reason': reason})
            for match in API.finditer(source):
                url = match.group(1)
                normalized = re.sub(r'\$\{[^}]*\}', '__dynamic__', url.split('?')[0])
                candidates = [h for h in handlers if re.match(route_regex(h['route']), normalized)]
                references.append({'kind': 'api_url_literal', 'source': str(path), 'line': line(source, match.start()),
                                   'expression': url, 'candidate_handlers': candidates, 'method': None,
                                   'evidence': 'explicit_literal_route_match_inferred', 'status': 'unverified'})
                if not candidates or '${' in url:
                    unresolved.append({'kind': 'api_url', 'source': str(path), 'line': line(source, match.start()),
                                       'expression': url, 'reason': 'dynamic_url' if '${' in url else 'no_matching_handler'})
            for match in FETCH.finditer(source):
                expression = match.group(1).strip()
                # A literal method nearby is a hint only; nested expressions require manual review.
                nearby = source[match.end():match.end() + 300].split(');', 1)[0]
                method = METHOD.search(nearby)
                references.append({'kind': 'fetch_call', 'source': str(path), 'line': line(source, match.start()),
                                   'expression': expression, 'method_hint': method.group(1).upper() if method else None,
                                   'evidence': 'lexical_call', 'status': 'unverified'})
                if not re.match(r'''["'`]/api/''', expression):
                    unresolved.append({'kind': 'fetch_call', 'source': str(path), 'line': line(source, match.start()),
                                       'expression': expression, 'reason': 'non_literal_or_non_api_fetch'})
            if not directive or directive.group(1) != 'client':
                for match in re.finditer(r'\bdb\s*\.\s*(select|query|execute|insert|update|delete)\b', source):
                    references.append({'kind': 'server_data_access_candidate', 'source': str(path),
                                       'line': line(source, match.start()), 'expression': match.group(0),
                                       'evidence': 'lexical_db_reference', 'status': 'unverified'})
                # Imported function calls are candidates, not evidence of a database operation.
                for match in IMPORT.finditer(source):
                    binding, spec = match.group(2) or '', match.group(3)
                    if not spec or not (spec.startswith('@/') or spec.startswith('.')):
                        continue
                    for symbol in re.findall(r'\b[A-Za-z_$][\w$]*\b', binding):
                        if symbol in ('as', 'type', 'from') or symbol[0].isupper():
                            continue
                        for call in re.finditer(r'\b' + re.escape(symbol) + r'\s*\(', source[match.end():]):
                            references.append({'kind': 'server_call_candidate', 'source': str(path),
                                               'line': line(source, match.end() + call.start()), 'symbol': symbol,
                                               'specifier': spec, 'evidence': 'lexical_call', 'status': 'unverified'})
            for match in re.finditer(r'''["']use server["']\s*;''', source):
                if match.start() > 0 and source[:match.start()].strip():
                    references.append({'kind': 'inline_server_action_candidate', 'source': str(path),
                                       'line': line(source, match.start()), 'evidence': 'directive', 'status': 'unverified'})
        results.append({'page': str(page), 'route': web_path(page), 'status': 'unverified', 'entrypoints': [str(p) for p in roots],
                        'modules': modules, 'imports': imports, 'references': references, 'unresolved': unresolved})
    return {'schema_version': 1, 'scope': {'max_import_depth': max_depth, 'fixture_routes_excluded': True},
            'limitations': ['Lexical source inventory, not a parser, call graph, execution trace, authorization or parity proof.',
                            'Imports imply possible reachability only. Runtime conditions, aliases, re-exports, wrappers, dynamic values and generated routes require review.',
                            'Server-call and data-access entries are candidates, not deduplicated product operations.',
                            'Handler methods and method hints may be incomplete. Layouts are included; middleware, templates, error and loading files are not traversed automatically.'],
            'pages': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all', action='store_true', help='Scan every page except visual fixtures')
    group.add_argument('--page', action='append', help='Page path relative to root; repeatable')
    parser.add_argument('--max-depth', type=int, default=2)
    args = parser.parse_args()
    if args.max_depth < 0:
        parser.error('--max-depth must be nonnegative')
    pages = [p.relative_to(args.root) for p in sorted((args.root / 'app').rglob('page.tsx'))
             if 'visual-fixtures' not in p.parts] if args.all else args.page
    print(json.dumps(scan(args.root, pages, args.max_depth), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

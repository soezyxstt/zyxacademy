"""Dependency-aware CI planning. Standard library only; no package installation.

Compare the union of base/head graphs, so removed imports and renamed files still
invalidate their former consumers. Unknown history selects all work, never none.
Literal imports and repository file references are deliberately over-approximated;
explicit runtime directories cover file-system discovery and nonliteral imports.
"""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CODE = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cts', '.cjs'}
SCOPES = ('web', 'worker', 'v4', 'authoring', 'schedule', 'plugin', 'typecheck', 'test_typecheck', 'structured_typecheck', 'i18n', 'ci')
LOCKS = {'package.json', 'bun.lock', 'package-lock.json', '.npmrc'}
SCHEDULE_TESTS = {
    'tests/contracts/tutorial-week-policy.test.ts',
    'tests/contracts/group-name-policy.test.ts',
    'tests/contracts/schedule-calendar-regressions.test.ts',
    'tests/contracts/tutor-schedule-read-model.test.ts',
    'tests/contracts/tutor-schedule-actions.test.ts',
    'tests/integration/tutorial-booking-lifecycle.ts',
}
AUTHORING_TESTS = {
    'tests/contracts/authoring-skills.test.ts',
    'tests/contracts/authoring-mcp.test.ts',
    'tests/contracts/authoring-mcp-playbook.test.ts',
    'tests/contracts/question-authoring.test.ts',
}
# Imports, exports, require(), and file-reading contracts all contain literals.
# Only existing repository paths are followed. Comments may add work, not hide it.
IMPORT = re.compile(r'''\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\b(?:import|require)\s*\(\s*["']([^"']+)["']''')
LITERAL = re.compile(r'''["'`]([^"'`\n]+)["'`]''')


def git(*args, root=ROOT):
    return subprocess.check_output(['git', *args], cwd=root)


class Snapshot:
    def __init__(self, revision=None, root=ROOT):
        self.root, self.revision = Path(root), revision
        self._text, self._edges = {}, {}
        if revision:
            data = git('ls-tree', '-r', '-z', '--name-only', revision, root=self.root)
        else:
            data = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', root=self.root)
        self.files = set(data.decode().split('\0')) - {''}
        if not revision:
            self.files = {f for f in self.files if (self.root / f).is_file()}

    def read(self, path):
        if path in self._text:
            return self._text[path]
        if path not in self.files:
            return ''
        if self.revision:
            text = git('show', f'{self.revision}:{path}', root=self.root).decode(errors='replace')
        else:
            text = (self.root / path).read_text(errors='replace')
        self._text[path] = text
        return text

    def resolve(self, specifier, source):
        if specifier.startswith('@/'):
            target = specifier[2:]
        elif specifier.startswith('.'):
            target = os.path.normpath(str(PurePosixPath(source).parent / specifier)).replace('\\', '/')
        elif specifier.split('/')[0] in {'app', 'lib', 'db', 'components', 'scripts', 'tests', 'messages', 'public', 'workers', 'prompts'}:
            target = specifier
        else:
            return None
        candidates = [target] + [target + s for s in ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.json')]
        candidates += [target + '/index' + s for s in ('.ts', '.tsx', '.js')]
        # TS permits JavaScript extension specifiers resolved to TypeScript sources.
        if target.endswith('.js'):
            candidates += [target[:-3] + '.ts', target[:-3] + '.tsx']
        return next((p for p in candidates if p in self.files), None)

    def edges(self, source):
        if source in self._edges:
            return self._edges[source]
        if source.startswith('public/') or PurePosixPath(source).suffix not in CODE:
            return frozenset()
        text = self.read(source)
        references = [next(value for value in match if value) for match in IMPORT.findall(text)]
        edges = frozenset(resolved for literal in references
                          if (resolved := self.resolve(literal, source)))
        self._edges[source] = edges
        return edges

    def closure(self, roots):
        seen, leaves, pending = set(), set(), list(roots)
        while pending:
            source = pending.pop()
            if source in seen:
                continue
            seen.add(source)
            pending.extend(self.edges(source) - seen)
            # Source-inspection contracts read bytes, not the referenced file's
            # imports. Keep those references as leaves to avoid unrelated suites.
            if source.startswith('tests/'):
                leaves.update(resolved for literal in LITERAL.findall(self.read(source))
                            if (resolved := self.resolve(literal, source)) and resolved not in self.edges(source))
        return seen | leaves

    def under(self, *prefixes):
        return {f for f in self.files if f.startswith(prefixes)}

    def runtime(self):
        text = self.read('lib/compute/product-v4-runtime-binding.ts')
        match = re.search(r'export const PRODUCT_V4_RUNTIME_FILES = \[(.*?)\] as const;', text, re.S)
        if not match:
            raise ValueError('V4 runtime manifest is missing or unreadable')
        return set(LITERAL.findall(match[1]))


def scope_paths(snapshot):
    runtime = snapshot.runtime()
    worker = snapshot.closure({'workers/deno-background/main.ts', 'workers/neon-background/main.ts'})
    worker |= snapshot.under('workers/deno-background/', 'workers/neon-background/', 'jobs/', 'scripts/neon/')
    worker |= {'deno.json', 'deno.lock', 'scripts/audit-worker-dependencies.ts',
               '.github/scripts/prepare_worker_runtime.py', '.github/scripts/cloud_run_runtime.py'} | LOCKS
    # Keep lib/ conservative: server actions may discover modules dynamically.
    # Other workers are excluded unless explicitly fingerprinted or imported.
    web = snapshot.under('app/', 'components/', 'lib/', 'hooks/', 'i18n/', 'messages/', 'public/', 'styles/', 'types/', 'docs/')
    web |= snapshot.closure(web | {'scripts/build-authoring-skills.ts', 'scripts/authoring/prepare-web-verification.ts'})
    web |= runtime | snapshot.under('lib/authoring/playbooks/')
    web |= {f for f in snapshot.files if '/' not in f and PurePosixPath(f).suffix in CODE}
    web |= LOCKS | {'tsconfig.json', 'authoring-skills.lock.json', 'vercel.json', 'Dockerfile.cloud-run', 'Dockerfile.cloud-run.dockerignore', 'AGENTS.md'}
    web |= snapshot.under('.github/scripts/') & {f for f in snapshot.files if 'cloud_run' in f or 'cloud-run' in f}
    authoring_roots = snapshot.under('lib/authoring/', 'app/api/mcp/authoring/') | AUTHORING_TESTS | {'scripts/build-authoring-skills.ts'}
    schedule_roots = snapshot.under('lib/schedule/', 'components/schedule/',
        'app/(admin)/admin/(academic)/schedules/', 'app/(student)/dashboard/groups/',
        'app/(student)/dashboard/schedule/', 'app/(tutor)/tutor/schedule/') | SCHEDULE_TESTS
    schedule_roots |= {'components/admin/academic-schedules-dashboard.tsx', 'components/dashboard/student-group-rename-panel.tsx', 'components/tutor/tutor-schedule-view.tsx', 'lib/groups/group-name-policy.ts'}
    return {
        'web': web,
        'worker': worker,
        # Fingerprint/playbook bytes are deployment inputs, not worker imports.
        'v4': runtime | snapshot.under('lib/authoring/playbooks/') | LOCKS,
        'authoring': snapshot.closure(authoring_roots) | LOCKS | {'authoring-skills.lock.json'},
        'schedule': snapshot.closure(schedule_roots) | LOCKS | snapshot.under('drizzle/', 'drizzle-postgres/'),
    }


def plan(changed, head, base=None, force=False):
    changed = set(changed)
    maps = [scope_paths(head)]
    if base:
        try:
            maps.append(scope_paths(base))
        except ValueError:
            # Older history may predate the V4 manifest. Revalidate all surfaces.
            force = True
    reasons = {key: sorted(changed & set.union(*(m[key] for m in maps))) for key in maps[0]}
    result = {key: bool(reasons.get(key)) for key in SCOPES}
    for path in changed:
        if path.startswith(('app/', 'components/', 'lib/', 'hooks/', 'i18n/', 'messages/', 'public/', 'styles/', 'types/', 'docs/')):
            result['web'] = True
        if path.startswith(('workers/deno-background/', 'workers/neon-background/', 'jobs/', 'scripts/neon/')):
            result['worker'] = True
        if path == 'tsconfig.structured-articles.json':
            result['structured_typecheck'] = True
        if path.startswith('lib/authoring/'):
            result['authoring'] = True
        if path.startswith(('lib/schedule/', 'components/schedule/')):
            result['schedule'] = True
        if path.startswith(('scripts/ci/', '.github/actions/', '.github/scripts/', '.github/workflows/')):
            result['ci'] = True
        if path.startswith('plugins/zyx-authoring-mcp/'):
            result['plugin'] = True
        if path.startswith(('messages/', 'i18n/', 'lib/i18n/')) or path == 'scripts/check-i18n-catalogs.ts':
            result['i18n'] = True
        suffix = PurePosixPath(path).suffix
        if (suffix in CODE and not path.startswith(('tests/', 'scripts/', 'workers/', 'plugins/', 'android/'))) or path in LOCKS | {'tsconfig.json', 'next.config.ts'}:
            result['typecheck'] = True
        if path.startswith('tests/') and suffix in CODE or path == 'tsconfig.test.json':
            result['test_typecheck'] = True
    # Changing a reusable workflow explicitly revalidates its own surface.
    workflows = {'deploy-web.yml': 'web', 'deploy.yml': 'worker', 'deploy-neon-worker.yml': 'worker', 'authoring-skills.yml': 'authoring',
                 'schedule-regressions.yml': 'schedule', 'sync-plugin.yml': 'plugin'}
    for file, scope in workflows.items():
        if '.github/workflows/' + file in changed:
            result[scope] = True
    broad = bool(changed & {'scripts/test-contracts.ts', 'tests/helpers/postgres-preload.ts', 'tests/helpers/server-only-preload.ts'}) or force or bool(changed & LOCKS) or any(p.startswith(('scripts/ci/', '.github/actions/')) for p in changed) or '.github/workflows/ci.yml' in changed
    if broad:
        result.update(dict.fromkeys(SCOPES, True))
    selected = []
    v4_tests = {'tests/contracts/product-v4-runtime-binding.test.ts', 'tests/contracts/product-v4-verification.test.ts'}
    # Select all Bun tests whose literal dependency closure is affected. Removed
    # files are considered through the base closure; only surviving tests run.
    for test in sorted(head.under('tests/')):
        if not re.search(r'\.test\.[cm]?[jt]sx?$', test) or test in SCHEDULE_TESTS | AUTHORING_TESTS:
            continue
        if '@playwright/test' in head.read(test):
            continue
        dependencies = head.closure({test}) | (base.closure({test}) if base else set())
        if broad or changed & dependencies or (result['v4'] and test in v4_tests):
            selected.append(test)
    structured_inputs = set()
    for snapshot in (head, base):
        if snapshot and 'tsconfig.structured-articles.json' in snapshot.files:
            config = json.loads(snapshot.read('tsconfig.structured-articles.json'))
            structured_inputs |= snapshot.closure(config['include'])
    result['structured_typecheck'] |= broad or bool(changed & structured_inputs) or 'tsconfig.json' in changed
    result['tests'] = selected
    result['worker_projects'] = []
    for config in sorted(f for f in head.files if re.fullmatch(r'workers/[^/]+/tsconfig.json', f)):
        directory = config.rsplit('/', 1)[0] + '/'
        dependencies = head.closure(head.under(directory))
        if base:
            dependencies |= base.closure(base.under(directory))
        if broad or changed & (dependencies | {'tsconfig.json'}):
            result['worker_projects'].append(config)
    result['python_worker'] = broad or any(p.startswith('workers/python-runtime/') for p in changed)
    # Re-run the test compiler when application edits affect test dependencies too.
    result['test_typecheck'] |= bool(selected) or result['schedule'] or result['authoring']
    compiler_tests = set(selected) | {p for p in changed & head.files if p.startswith('tests/') and PurePosixPath(p).suffix in CODE}
    if result['schedule']:
        compiler_tests |= SCHEDULE_TESTS
    if result['authoring']:
        compiler_tests |= AUTHORING_TESTS
    if broad or 'tsconfig.test.json' in changed:
        compiler_tests = {p for p in head.under('tests/') if PurePosixPath(p).suffix in CODE}
    result['compiler_tests'] = sorted(compiler_tests & head.files)
    result['lint_all'] = broad or 'eslint.config.mjs' in changed
    result['lint_files'] = sorted(p for p in changed & head.files if PurePosixPath(p).suffix in CODE
                                  and not p.startswith(('tests/', 'workers/', 'plugins/', 'android/')))
    result['reasons'] = reasons
    result['changed'] = sorted(changed)
    result['fallback'] = force
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=os.environ.get('CI_BASE_SHA', ''))
    parser.add_argument('--head', default=os.environ.get('CI_HEAD_SHA', 'HEAD'))
    parser.add_argument('--output', default='artifacts/ci/plan.json')
    args = parser.parse_args()
    head = Snapshot()
    base, force = None, False
    try:
        if not args.base or set(args.base) == {'0'}:
            raise ValueError('No usable base commit')
        try:
            git('cat-file', '-e', args.base + '^{commit}')
        except subprocess.CalledProcessError:
            # A multi-commit push can exceed checkout's shallow history. Fetch
            # only the exact base object, rather than the repository's history.
            if not re.fullmatch(r'[0-9a-fA-F]{40,64}', args.base):
                raise ValueError('Invalid base SHA')
            git('fetch', '--no-tags', '--depth=1', 'origin', args.base)
        base = Snapshot(args.base)
        changed = git('diff', '--name-only', '--no-renames', '-z', args.base, args.head).decode().split('\0')
    except (ValueError, subprocess.CalledProcessError):
        changed, force = sorted(head.files), True
    result = plan(set(changed) - {''}, head, base, force)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            for key in SCOPES:
                stream.write(f'{key}={str(result[key]).lower()}\n')
            stream.write(f'quality={str(result["typecheck"] or result["test_typecheck"] or result["structured_typecheck"] or result["i18n"] or bool(result["tests"]) or result["lint_all"] or bool(result["lint_files"]) or bool(result["worker_projects"]) or result["python_worker"]).lower()}\n')
    print(json.dumps({key: result[key] for key in SCOPES} | {'selected_tests': len(result['tests']), 'fallback': result['fallback']}))


if __name__ == '__main__':
    main()

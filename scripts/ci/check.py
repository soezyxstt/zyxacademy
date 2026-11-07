"""Run the plan's local checks with literal argv, never interpolated shell code."""
import json
from pathlib import Path
import subprocess
import sys

plan = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/ci/plan.json').read_text())


def run(*args):
    print('+', ' '.join(args), flush=True)
    subprocess.run(args, check=True)


if plan['lint_all']:
    run('bun', 'run', 'lint', '--cache', '--cache-strategy', 'content', '--cache-location', '.cache/eslint/')
elif plan['lint_files']:
    run('bun', 'run', 'lint', '--no-warn-ignored', '--cache', '--cache-strategy', 'content', '--cache-location', '.cache/eslint/', '--', *plan['lint_files'])
if plan['typecheck'] or plan['test_typecheck'] or plan['structured_typecheck']:
    run('bun', 'run', 'typegen')
if plan['typecheck']:
    run('bun', 'run', 'typecheck')
if plan['test_typecheck']:
    # Typecheck the affected tests and their full import closure. Do not load
    # unrelated Playwright specs and fixtures for an ordinary frontend edit.
    config = Path('.cache/typecheck/tests-selected.json')
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(json.dumps({
        'extends': '../../tsconfig.test.json',
        'include': [str(Path(p).resolve()) for p in plan['compiler_tests']] + [
            str(Path('next-env.d.ts').resolve())],
    }, indent=2) + '\n')
    run('node', '--max-old-space-size=4096', 'node_modules/typescript/bin/tsc',
        '--noEmit', '-p', str(config), '--tsBuildInfoFile', '.cache/typecheck/tests-selected.tsbuildinfo')
if plan['structured_typecheck']:
    run('bun', 'run', 'typecheck:structured-articles')
if plan['i18n']:
    run('bun', 'run', 'i18n:check')
for test in plan['tests']:
    # Each file gets its own process: Bun mock.module must not leak to another suite.
    if test.startswith('tests/contracts/'):
        run('bun', 'scripts/test-contracts.ts', test)
    else:
        run('bun', 'test', test)

for config in plan['worker_projects']:
    name = Path(config).parent.name
    run('node', '--max-old-space-size=4096', 'node_modules/typescript/bin/tsc',
        '-p', config, '--noEmit', '--incremental', '--tsBuildInfoFile', f'.cache/typecheck/worker-{name}.tsbuildinfo')
    for test in sorted(Path(config).parent.rglob('*.test.ts')):
        run('bun', 'test', str(test))
if plan['python_worker']:
    for source in sorted(Path('workers/python-runtime').glob('*.mjs')):
        run('node', '--check', str(source))

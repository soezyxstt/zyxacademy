"""Run the plan's local checks with literal argv, never interpolated shell code."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys

plan = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/ci/plan.json').read_text())


def run(*args):
    print('+', ' '.join(args), flush=True)
    subprocess.run(args, check=True)


def run_parallel(commands, max_workers=4):
    if not commands:
        return
    if len(commands) == 1:
        run(*commands[0])
        return
    with ThreadPoolExecutor(max_workers=min(max_workers, len(commands))) as pool:
        futures = [pool.submit(run, *cmd) for cmd in commands]
        for future in futures:
            future.result()


static_commands = []
if plan['lint_all']:
    static_commands.append(('bun', 'run', 'lint', '--cache', '--cache-strategy', 'content', '--cache-location', '.cache/eslint/'))
elif plan['lint_files']:
    static_commands.append(('bun', 'run', 'lint', '--no-warn-ignored', '--cache', '--cache-strategy', 'content', '--cache-location', '.cache/eslint/', '--', *plan['lint_files']))

if plan['typecheck'] or plan['test_typecheck'] or (plan['structured_typecheck'] and not plan['typecheck']):
    run('bun', 'run', 'typegen')
if plan['typecheck']:
    static_commands.append(('bun', 'run', 'typecheck'))
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
    static_commands.append(('node', '--max-old-space-size=4096', 'node_modules/typescript/bin/tsc',
                            '--noEmit', '-p', str(config), '--tsBuildInfoFile', '.cache/typecheck/tests-selected.tsbuildinfo'))
if plan['structured_typecheck'] and not plan['typecheck']:
    static_commands.append(('bun', 'run', 'typecheck:structured-articles'))
if plan['i18n']:
    static_commands.append(('bun', 'run', 'i18n:check'))

for config in plan['worker_projects']:
    name = Path(config).parent.name
    static_commands.append(('node', '--max-old-space-size=4096', 'node_modules/typescript/bin/tsc',
                            '-p', config, '--noEmit', '--incremental', '--tsBuildInfoFile', f'.cache/typecheck/worker-{name}.tsbuildinfo'))

if plan['python_worker']:
    for source in sorted(Path('workers/python-runtime').glob('*.mjs')):
        static_commands.append(('node', '--check', str(source)))

run_parallel(static_commands, max_workers=3)

contract_tests = [test for test in plan['tests'] if test.startswith('tests/contracts/')]
other_tests = [test for test in plan['tests'] if not test.startswith('tests/contracts/')]
for config in plan['worker_projects']:
    other_tests.extend(str(test) for test in sorted(Path(config).parent.rglob('*.test.ts')))

if contract_tests:
    # Each file still gets its own isolated subprocess inside test-contracts.ts.
    run('bun', 'scripts/test-contracts.ts', *contract_tests)

if other_tests:
    run_parallel([('bun', 'test', test) for test in other_tests], max_workers=4)

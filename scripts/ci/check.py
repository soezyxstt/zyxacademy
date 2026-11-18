"""Run the plan's local checks with literal argv, never interpolated shell code."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('plan', nargs='?', default='artifacts/ci/plan.json')
parser.add_argument('--mode', choices=('all', 'static', 'tests'), default='all')
parser.add_argument('--shard', type=int, default=0)
parser.add_argument('--shards', type=int, default=1)
args = parser.parse_args()

if args.shards < 1 or not (0 <= args.shard < args.shards):
    raise SystemExit(f'Invalid shard {args.shard} for {args.shards} shards')

plan = json.loads(Path(args.plan).read_text())


def run(*cmd):
    print('+', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


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


def test_weight(path):
    file = Path(path)
    if not file.is_file():
        return 0
    weight = file.stat().st_size
    text = file.read_text(errors='replace')
    if 'generate_series' in text:
        weight += 250_000
    if any(token in text or token in path for token in ('chromium', 'puppeteer', 'playwright', 'coding-python-runtime')):
        weight += 200_000
    if 'sharp' in text:
        weight += 120_000
    if any(token in text for token in ('PGlite', 'helpers/postgres', 'createPostgresTestDb')):
        weight += 80_000
    return weight


def select_shard(items, shard, shards, loads):
    weighted = sorted(((test_weight(item), item) for item in items), key=lambda pair: (-pair[0], pair[1]))
    if shards == 1:
        return [item for _, item in weighted]
    buckets = [[] for _ in range(shards)]
    for weight, item in weighted:
        target = min(range(shards), key=lambda idx: (loads[idx], idx))
        loads[target] += weight
        buckets[target].append(item)
    return buckets[shard]


if args.mode in ('all', 'static'):
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

    run_parallel(static_commands, max_workers=4)

if args.mode in ('all', 'tests'):
    loads = [0] * args.shards
    contract_tests = select_shard(
        [test for test in plan['tests'] if test.startswith('tests/contracts/')],
        args.shard,
        args.shards,
        loads,
    )
    raw_other_tests = [test for test in plan['tests'] if not test.startswith('tests/contracts/')]
    for config in plan['worker_projects']:
        raw_other_tests.extend(str(test) for test in sorted(Path(config).parent.rglob('*.test.ts')))
    other_tests = select_shard(raw_other_tests, args.shard, args.shards, loads)

    if contract_tests:
        # Each file still gets its own isolated subprocess inside test-contracts.ts.
        run('bun', 'scripts/test-contracts.ts', *contract_tests)

    if other_tests:
        run_parallel([('bun', 'test', test) for test in other_tests], max_workers=5)

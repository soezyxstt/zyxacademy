"""Verify selection and argv handling without running package managers or compilers."""
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CheckCommandsTest(unittest.TestCase):
    def run_plan(self, extra_args=(), files=None, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            logger = '#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ["ARGV_LOG"],"a") as f: f.write(json.dumps(sys.argv)+"\\n")\n'
            for command in ['bun', 'node']:
                file = bin_dir / command
                file.write_text(logger)
                file.chmod(0o755)
            for rel_path, content in (files or {}).items():
                target = root / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            plan = dict.fromkeys(['lint_all', 'typecheck', 'test_typecheck', 'structured_typecheck', 'i18n', 'python_worker'], False)
            plan.update({key: [] for key in ['lint_files', 'tests', 'compiler_tests', 'worker_projects']})
            plan.update(overrides)
            (root / 'plan.json').write_text(json.dumps(plan))
            env = {**os.environ, 'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'], 'ARGV_LOG': str(root / 'argv.jsonl')}
            result = subprocess.run(['python3', str(ROOT / 'scripts/ci/check.py'), 'plan.json', *extra_args], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            lines = (root / 'argv.jsonl').read_text().splitlines() if (root / 'argv.jsonl').exists() else []
            config = root / '.cache/typecheck/tests-selected.json'
            return [json.loads(line)[1:] for line in lines], json.loads(config.read_text()) if config.exists() else None

    def test_empty_plan_runs_nothing(self):
        self.assertEqual(self.run_plan()[0], [])

    def test_changed_file_is_literal_argument(self):
        name = 'components/a b;$(touch injected).tsx'
        commands, _ = self.run_plan(lint_files=[name])
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0][-2:], ['--', name])

    def test_typegen_precedes_both_compiler_checks(self):
        commands, config = self.run_plan(typecheck=True, test_typecheck=True, compiler_tests=['tests/a.test.ts'])
        self.assertEqual(commands[0], ['run', 'typegen'])
        self.assertCountEqual(
            [commands[1][0], commands[2][0]],
            ['run', '--max-old-space-size=4096'],
        )
        self.assertIn(['run', 'typecheck'], commands[1:])
        selected_cmd = next(cmd for cmd in commands[1:] if 'tests-selected.json' in ' '.join(cmd))
        self.assertIn('tests-selected.json', selected_cmd[-3])
        self.assertTrue(config['include'][0].endswith('/tests/a.test.ts'))
        self.assertEqual(config['extends'], '../../tsconfig.test.json')

    def test_structured_config_runs_typegen_then_its_compiler_only(self):
        commands, _ = self.run_plan(structured_typecheck=True)
        self.assertEqual(commands, [['run', 'typegen'], ['run', 'typecheck:structured-articles']])

    def test_structured_typecheck_skipped_when_full_typecheck_runs(self):
        commands, _ = self.run_plan(typecheck=True, structured_typecheck=True)
        self.assertEqual(commands, [['run', 'typegen'], ['run', 'typecheck']])

    def test_contracts_batch_into_one_runner_invocation(self):
        commands, _ = self.run_plan(tests=['tests/contracts/a.test.ts', 'tests/contracts/db.test.ts'])
        self.assertEqual(commands, [['scripts/test-contracts.ts', 'tests/contracts/a.test.ts', 'tests/contracts/db.test.ts']])

    def test_bun_test_files_run_in_separate_processes(self):
        commands, _ = self.run_plan(tests=['tests/a.test.ts', 'tests/b.test.ts'])
        self.assertCountEqual(commands, [['test', 'tests/a.test.ts'], ['test', 'tests/b.test.ts']])

    def test_static_mode_skips_tests_and_tests_mode_skips_static(self):
        static_cmds, _ = self.run_plan(('--mode', 'static'), lint_all=True, tests=['tests/a.test.ts'])
        self.assertEqual(static_cmds, [['run', 'lint', '--cache', '--cache-strategy', 'content', '--cache-location', '.cache/eslint/']])
        test_cmds, _ = self.run_plan(('--mode', 'tests', '--shard', '0', '--shards', '1'), lint_all=True, typecheck=True, tests=['tests/a.test.ts'])
        self.assertEqual(test_cmds, [['test', 'tests/a.test.ts']])

    def test_shards_partition_all_tests_and_put_heaviest_first(self):
        files = {
            'tests/contracts/light.test.ts': 'export const a = 1;\n',
            'tests/contracts/heavy-pg.test.ts': 'import { createPostgresTestDb } from "@/tests/helpers/postgres";\n',
            'tests/contracts/heavy-browser.test.ts': 'import { chromium } from "playwright";\n',
            'tests/unit/small.test.ts': 'export const b = 1;\n',
            'tests/discussions/heavy-series.test.cjs': 'generate_series(1, 10000)\n',
        }
        all_tests = list(files)
        seen = []
        for shard in range(2):
            cmds, _ = self.run_plan(
                ('--mode', 'tests', '--shard', str(shard), '--shards', '2'),
                files=files,
                tests=all_tests,
            )
            for cmd in cmds:
                if cmd[0] == 'scripts/test-contracts.ts':
                    seen.extend(cmd[1:])
                elif cmd[0] == 'test':
                    seen.append(cmd[1])
        self.assertCountEqual(seen, all_tests)
        # Single-shard order puts heavy contract tests before light ones.
        single, _ = self.run_plan(('--mode', 'tests'), files=files, tests=all_tests)
        contracts_order = next(cmd[1:] for cmd in single if cmd[0] == 'scripts/test-contracts.ts')
        self.assertEqual(contracts_order[-1], 'tests/contracts/light.test.ts')


class GateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import textwrap
        text = (ROOT / '.github/workflows/ci.yml').read_text().split('  gate:\n', 1)[1]
        cls.script = textwrap.dedent(text.split("python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0])

    def gate(self, results, outputs=None, event='pull_request'):
        jobs = {key: {'result': value} for key, value in results.items()}
        jobs.setdefault('impact', {'result': 'success'})['outputs'] = outputs or {}
        return subprocess.run(['python3', '-c', self.script], env={**os.environ, 'RESULTS': json.dumps(jobs), 'EVENT_NAME': event}, capture_output=True, text=True).returncode

    def test_unselected_jobs_may_skip(self):
        self.assertEqual(self.gate({'static': 'skipped', 'tests': 'skipped'}), 0)

    def test_selected_job_cannot_skip(self):
        self.assertNotEqual(self.gate({'static': 'skipped', 'tests': 'success'}, {'static': 'true', 'has_tests': 'true'}), 0)
        self.assertNotEqual(self.gate({'static': 'success', 'tests': 'skipped'}, {'static': 'true', 'has_tests': 'true'}), 0)

    def test_selected_success_passes(self):
        self.assertEqual(self.gate({'static': 'success', 'tests': 'success'}, {'static': 'true', 'has_tests': 'true'}), 0)

    def test_planner_failure_blocks(self):
        self.assertNotEqual(self.gate({'impact': 'failure'}), 0)

    def test_cancelled_check_blocks(self):
        self.assertNotEqual(self.gate({'static': 'cancelled'}), 0)
        self.assertNotEqual(self.gate({'tests': 'cancelled'}), 0)

    def test_selected_pr_worker_cannot_skip(self):
        self.assertNotEqual(self.gate({'worker-check': 'skipped'}, {'worker': 'true'}), 0)

    def test_push_worker_is_checked_by_deployment(self):
        self.assertEqual(self.gate({'worker-check': 'skipped'}, {'worker': 'true'}, 'push'), 0)



class DeploymentGateTest(unittest.TestCase):
    def expression(self, job):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        block = text.split(f'  {job}:\n', 1)[1]
        return re.search(r'^    if: (.+)$', block, re.MULTILINE).group(1)

    def allowed(self, job, gate='success', impact='success', event='push', cancelled=False, worker_result='success', web_hold='', branch='main', **outputs):
        expression = self.expression(job)
        # An explicit status function prevents implicit success() from suppressing
        # releases when an optional ancestor was skipped. Keep the gate authoritative.
        self.assertIn('!cancelled()', expression)
        expression = expression.removeprefix('${{').removesuffix('}}').strip()
        values = {'needs.gate.result': gate, 'needs.impact.result': impact, 'needs.deploy-worker.result': worker_result,
                  'github.event_name': event, 'github.ref': 'refs/heads/' + branch, 'vars.HOLD_WEB_DEPLOYMENT': web_hold, **{f'needs.impact.outputs.{k}': v for k, v in outputs.items()}}
        expression = re.sub(r'(?:needs|github|vars)\.[a-zA-Z0-9_.-]+', lambda m: repr(values.get(m.group(), '')), expression)
        expression = expression.replace('!cancelled()', repr(not cancelled)).replace('&&', 'and').replace('||', 'or')
        return eval(expression, {'__builtins__': {}})

    def test_optional_skips_do_not_suppress_selected_releases_after_successful_gate(self):
        # Optional job results have already been accepted by the gate, and must
        # not become an implicit second release gate.
        self.assertTrue(self.allowed('deploy-web', web='true'))
        self.assertTrue(self.allowed('deploy-worker', worker='true'))
        self.assertTrue(self.allowed('deploy-worker', worker='false', v4='true'))

    def test_failed_skipped_or_cancelled_gate_never_releases(self):
        for job in ['deploy-web', 'deploy-worker']:
            for result in ['failure', 'skipped', 'cancelled', '']:
                with self.subTest(job=job, gate=result):
                    self.assertFalse(self.allowed(job, gate=result, web='true', worker='true'))
            self.assertFalse(self.allowed(job, impact='failure', web='true', worker='true'))
            self.assertFalse(self.allowed(job, cancelled=True, web='true', worker='true'))

    def test_prs_and_unselected_surfaces_never_release(self):
        self.assertFalse(self.allowed('deploy-web', event='pull_request', web='true'))
        self.assertFalse(self.allowed('deploy-worker', event='pull_request', worker='true'))
        self.assertFalse(self.allowed('deploy-web', web='false'))
        self.assertFalse(self.allowed('deploy-worker', worker='false', v4='false'))

    def test_web_waits_for_successful_or_unselected_worker_release(self):
        for result in ('success', 'skipped'):
            with self.subTest(worker_result=result):
                self.assertTrue(self.allowed('deploy-web', worker_result=result, web='true'))
        for result in ('failure', 'cancelled', 'queued', 'in_progress', ''):
            with self.subTest(worker_result=result):
                self.assertFalse(self.allowed('deploy-web', worker_result=result, web='true'))

    def test_worker_only_recovery_holds_every_web_entry_point(self):
        self.assertFalse(self.allowed('deploy-web', web_hold='true', web='true'))
        self.assertTrue(self.allowed('deploy-worker', web_hold='true', worker='true'))
        text = (ROOT / '.github/workflows/deploy-web.yml').read_text()
        self.assertIn("if: github.ref == 'refs/heads/main' && vars.HOLD_WEB_DEPLOYMENT != 'true'", text)

    def test_staging_web_never_deploys_from_a_push(self):
        self.assertFalse(self.allowed('deploy-web', branch='staging', web='true'))
        text = (ROOT / '.github/workflows/deploy-web.yml').read_text()
        staging = text.split('  staging:\n', 1)[1]
        condition = re.search(r'^    if: (.+)$', staging, re.MULTILINE).group(1)
        for event in ('push', 'workflow_dispatch', 'pull_request'):
            for branch in ('main', 'staging', 'feature/example'):
                expression = condition.replace('github.event_name', repr(event)).replace('github.ref', repr('refs/heads/' + branch))
                self.assertEqual(eval(expression.replace('&&', 'and'), {'__builtins__': {}}),
                                 event == 'workflow_dispatch' and branch == 'staging')
        self.assertIn('environment: staging', staging)
        self.assertIn('VERCEL_PROJECT_ID: prj_9wDdc36VFIH5wJT45jEXIHGst2pb', staging)
        self.assertIn('vercel deploy --target=staging --yes --archive=tgz', staging)
        self.assertNotIn('--prod', staging)
        self.assertNotIn('google-github-actions', text)
        self.assertNotIn('gcloud', text)

if __name__ == '__main__':
    unittest.main()

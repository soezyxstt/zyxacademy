"""Verify selection and argv handling without running package managers or compilers."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CheckCommandsTest(unittest.TestCase):
    def run_plan(self, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            logger = '#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ["ARGV_LOG"],"a") as f: f.write(json.dumps(sys.argv)+"\\n")\n'
            for command in ['bun', 'node']:
                file = bin_dir / command
                file.write_text(logger)
                file.chmod(0o755)
            plan = dict.fromkeys(['lint_all', 'typecheck', 'test_typecheck', 'i18n', 'python_worker'], False)
            plan.update({key: [] for key in ['lint_files', 'tests', 'compiler_tests', 'worker_projects']})
            plan.update(overrides)
            (root / 'plan.json').write_text(json.dumps(plan))
            env = {**os.environ, 'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'], 'ARGV_LOG': str(root / 'argv.jsonl')}
            result = subprocess.run(['python3', str(ROOT / 'scripts/ci/check.py'), 'plan.json'], cwd=root, env=env, capture_output=True, text=True)
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
        self.assertEqual(commands[1], ['run', 'typecheck'])
        self.assertIn('tests-selected.json', commands[2][-3])
        self.assertTrue(config['include'][0].endswith('/tests/a.test.ts'))
        self.assertEqual(config['extends'], '../../tsconfig.test.json')

    def test_bun_test_files_run_in_separate_processes(self):
        commands, _ = self.run_plan(tests=['tests/a.test.ts', 'tests/b.test.ts'])
        self.assertEqual(commands, [['test', 'tests/a.test.ts'], ['test', 'tests/b.test.ts']])

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
        self.assertEqual(self.gate({'quality': 'skipped'}), 0)

    def test_selected_job_cannot_skip(self):
        self.assertNotEqual(self.gate({'quality': 'skipped'}, {'quality': 'true'}), 0)

    def test_selected_success_passes(self):
        self.assertEqual(self.gate({'quality': 'success'}, {'quality': 'true'}), 0)

    def test_planner_failure_blocks(self):
        self.assertNotEqual(self.gate({'impact': 'failure'}), 0)

    def test_cancelled_check_blocks(self):
        self.assertNotEqual(self.gate({'quality': 'cancelled'}), 0)

    def test_selected_pr_worker_cannot_skip(self):
        self.assertNotEqual(self.gate({'worker-check': 'skipped'}, {'worker': 'true'}), 0)

    def test_push_worker_is_checked_by_deployment(self):
        self.assertEqual(self.gate({'worker-check': 'skipped'}, {'worker': 'true'}, 'push'), 0)


if __name__ == '__main__':
    unittest.main()

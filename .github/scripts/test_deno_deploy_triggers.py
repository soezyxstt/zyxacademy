"""Check planner coverage against the independent worker audit's impact list."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_ci_scope import ci

ROOT = Path(__file__).resolve().parents[2]


class DenoDeployTriggersTest(unittest.TestCase):
    def test_all_audited_worker_and_fingerprint_inputs_are_planned(self):
        with tempfile.TemporaryDirectory() as directory:
            impact = Path(directory) / 'impact.txt'
            result = subprocess.run(['node', '--experimental-strip-types', 'scripts/audit-worker-dependencies.ts',
                                     f'--impact-output={impact}'], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            paths = ci.scope_paths(ci.Snapshot())
            covered = paths['worker'] | paths['v4'] | {'.github/workflows/deploy.yml'}
            # These Python tests run in the planner job; changing them alone
            # must not require deploying the worker.
            covered |= {'.github/scripts/test_deno_deploy_triggers.py', '.github/scripts/test_deploy_env_filter.py'}
            self.assertEqual(sorted(set(impact.read_text().splitlines()) - covered), [])

    def test_reusable_deploy_has_no_independent_automatic_trigger(self):
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn('  workflow_call:', text)
        self.assertNotIn('  push:', text)
        self.assertNotIn('  pull_request:', text)


if __name__ == '__main__':
    unittest.main()

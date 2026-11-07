"""Check planner coverage against the independent worker audit's impact list."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_ci_scope import ci

ROOT = Path(__file__).resolve().parents[2]


class DenoDeployTriggersTest(unittest.TestCase):
    def test_diktat_asset_smoke_uses_local_postgres_placeholder(self):
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        step = text.split("- name: Verify Diktat Runtime Assets", 1)[1].split("- name:", 1)[0]
        self.assertIn("DATABASE_URL: postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder", step)
        preparation = text.split("- name: Prepare V4 build identity for Deno", 1)[1].split("- name:", 1)[0]
        self.assertIn("ZYX_POSTGRES_BUILD_PLACEHOLDER: '1'", preparation)

    def test_only_release_branches_can_mutate_worker_and_staging_guard_runs_first(self):
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn("&& (github.ref_name == 'main' || github.ref_name == 'staging')", text)
        self.assertLess(text.index("name: Validate staging Neon target before Deno mutation"),
                        text.index("name: Provision Deno Deploy App"))
        self.assertLess(text.index("name: Validate production Neon target before Deno mutation"),
                        text.index("name: Provision Deno Deploy App"))
        production = text.split("- name: Validate production Neon target before Deno mutation", 1)[1].split("- name:", 1)[0]
        for key in ("DATABASE_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "NEON_STORAGE_BUCKET"):
            self.assertIn(key + ":", production)

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

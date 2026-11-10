"""Check Neon release guards and independent background-worker planner coverage."""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from test_ci_scope import ci

ROOT = Path(__file__).resolve().parents[2]


class BackgroundDeployTriggersTest(unittest.TestCase):
    def test_archive_build_uses_placeholder_and_prepares_matching_verification_identity(self):
        text = (ROOT / '.github/workflows/deploy-neon-worker.yml').read_text()
        preparation = text.split("- name: Build bounded worker archive", 1)[1].split("- name:", 1)[0]
        self.assertIn("ZYX_POSTGRES_BUILD_PLACEHOLDER: '1'", preparation)
        self.assertLess(preparation.index("prepare-web-verification.ts"), preparation.index("build-worker.mjs"))
        self.assertNotIn("toJSON(secrets)", preparation)

    def test_automatic_calls_are_release_scoped_and_manual_dispatch_is_explicit(self):
        text = (ROOT / '.github/workflows/deploy-neon-worker.yml').read_text()
        condition = re.search(r'^    if: (.+)$', text, re.MULTILINE).group(1)

        def allowed(event, branch, environment):
            values = {'github.event_name': event, 'github.ref_name': branch, 'inputs.environment': environment}
            expression = re.sub(r'(?:github|inputs)\.[\w.]+', lambda match: repr(values[match.group()]), condition)
            return eval(expression.replace('&&', 'and').replace('||', 'or'), {'__builtins__': {}})

        for branch in ('main', 'staging', 'agent/worker-repair'):
            for environment in ('production', 'staging'):
                with self.subTest(branch=branch, environment=environment):
                    self.assertEqual(allowed('push', branch, environment),
                                     (branch, environment) in (('main', 'production'), ('staging', 'staging')))
                    self.assertTrue(allowed('workflow_dispatch', branch, environment))
        inputs = text.split('  workflow_call:', 1)[1].split('permissions:', 1)[0]
        self.assertIn('environment:', inputs)
        self.assertIn('required: true', inputs)
        self.assertIn('options: [production, staging]', inputs)

    def test_target_validation_and_preflight_precede_inngest_cutover(self):
        text = (ROOT / '.github/workflows/deploy-neon-worker.yml').read_text()
        prepare = text.index('prepare_worker_runtime.py artifacts/neon-worker/.env.runtime.json')
        deploy = text.index('node scripts/neon/deploy-worker.mjs')
        preflight = text.index('smoke-worker.ts "$COMPUTE_ENVIRONMENT" --preflight')
        sync = text.index('sync-worker.mjs "$COMPUTE_ENVIRONMENT"')
        self.assertLess(prepare, deploy)
        self.assertLess(deploy, preflight)
        self.assertLess(preflight, sync)
        self.assertIn('environment: ${{ inputs.environment }}', text)
        self.assertIn('deploy-neon-${{ inputs.environment }}', text)
        self.assertNotIn('Provision Deno Deploy App', text)

    def test_all_audited_worker_and_fingerprint_inputs_are_planned(self):
        with tempfile.TemporaryDirectory() as directory:
            impact = Path(directory) / 'impact.txt'
            result = subprocess.run(['node', '--experimental-strip-types', 'scripts/audit-worker-dependencies.ts',
                                     f'--impact-output={impact}'], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            paths = ci.scope_paths(ci.Snapshot())
            covered = paths['worker'] | paths['v4'] | {'.github/workflows/deploy.yml', '.github/workflows/deploy-neon-worker.yml'}
            # These Python tests run in the planner job; changing them alone
            # must not require deploying the worker.
            covered |= {'.github/scripts/test_deno_deploy_triggers.py', '.github/scripts/test_deploy_env_filter.py'}
            self.assertEqual(sorted(set(impact.read_text().splitlines()) - covered), [])

    def test_reusable_deploy_has_no_independent_automatic_trigger(self):
        for file in ('deploy.yml', 'deploy-neon-worker.yml'):
            text = (ROOT / '.github/workflows' / file).read_text()
            with self.subTest(file=file):
                self.assertIn('  workflow_call:', text)
                self.assertNotIn('  push:', text)
                self.assertNotIn('  pull_request:', text)


if __name__ == '__main__':
    unittest.main()

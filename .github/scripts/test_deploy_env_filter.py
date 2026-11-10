"""Exercise Neon deployment isolation with synthetic runtime settings."""
from pathlib import Path, PurePosixPath
import re
import unittest

from prepare_worker_runtime import CI_KEYS, TARGETS, prepare_worker_runtime
from test_prepare_worker_runtime import fixture


WORKFLOWS = Path(__file__).resolve().parents[1] / "workflows"


def job(workflow, name):
    match = re.search(rf"^  {re.escape(name)}:\n(.*?)(?=^  [\w-]+:\n|\Z)", workflow, re.MULTILINE | re.DOTALL)
    if not match:
        raise AssertionError("Missing workflow job: " + name)
    return match.group(1)


class DeployEnvFilterTest(unittest.TestCase):
    def test_both_explicit_targets_keep_their_own_database_storage_and_inngest(self):
        for environment, target in TARGETS.items():
            with self.subTest(environment=environment):
                result = prepare_worker_runtime(environment, fixture(environment), {})
                self.assertIn(target["host"], result["DATABASE_URL"])
                self.assertEqual(result["NEON_STORAGE_BUCKET"], target["bucket"])
                self.assertIn(target["branch"], result["AWS_ENDPOINT_URL_S3"])
                self.assertEqual(result["INNGEST_ENV"], target["inngest"])
                self.assertEqual(result["NEXT_PUBLIC_APP_URL"], target["origin"])
        with self.assertRaisesRegex(ValueError, "WORKER_ENVIRONMENT_REQUIRED"):
            prepare_worker_runtime(None, fixture("production"), {})

    def test_preserves_padded_secrets_embedded_equals_and_multiline_credentials(self):
        values = {
            "BETTER_AUTH_SECRET": "ZHVtbXktdmFsdWU=",
            "R2_SECRET_ACCESS_KEY": "YQ==",
            "GOOGLE_REFRESH_TOKEN": "=value==",
            "CF_AI_GATEWAY_URL": "https://example.invalid/?a=b=c",
            "GA_PRIVATE_KEY": 'line one,="value"\nline two\\literal',
        }
        result = prepare_worker_runtime("production", fixture("production") | values, {})
        for key, value in values.items():
            with self.subTest(key=key):
                self.assertEqual(result[key], value)

    def test_allowlist_omits_ci_credentials_unknown_keys_and_empty_optional_values(self):
        source = fixture("production") | {key: "synthetic-ci-token" for key in CI_KEYS}
        source.update(UNKNOWN_SECRET="unrecognized", GOOGLE_REFRESH_TOKEN="", FEATURE_REFLECTION_EMAIL="0")
        result = prepare_worker_runtime("production", source, {"FEATURE_DIKTAT_AI": "0"})
        self.assertFalse(result.keys() & CI_KEYS)
        self.assertNotIn("UNKNOWN_SECRET", result)
        self.assertNotIn("GOOGLE_REFRESH_TOKEN", result)
        self.assertEqual(result["FEATURE_REFLECTION_EMAIL"], "0")
        self.assertEqual(result["FEATURE_DIKTAT_AI"], "0")
        with self.assertRaises(ValueError):
            prepare_worker_runtime("production", {}, {})

    def test_wrapper_keeps_manual_diagnostics_out_of_both_deployment_targets(self):
        workflow = (WORKFLOWS / "deploy.yml").read_text()
        for environment in TARGETS:
            block = job(workflow, "deploy-neon-" + environment)
            with self.subTest(environment=environment):
                self.assertIn("uses: ./.github/workflows/deploy-neon-worker.yml", block)
                self.assertIn("environment: " + environment, block)
                self.assertIn("github.event_name != 'pull_request'", block)
                for flag in ("runtime_diagnostics", "browser_diagnostics", "restore_turso_worker"):
                    self.assertIn("!inputs." + flag, block)
        for name in ("runtime-diagnostics", "browser-diagnostics"):
            block = job(workflow, name)
            self.assertNotIn("scripts/neon/deploy-worker.mjs", block)
            self.assertNotIn("scripts/neon/sync-worker.mjs", block)

    def test_reusable_workflow_passes_the_selected_environment_before_cutover(self):
        workflow = (WORKFLOWS / "deploy-neon-worker.yml").read_text()
        self.assertIn("environment: ${{ inputs.environment }}", job(workflow, "deploy"))
        self.assertIn("GITHUB_ENVIRONMENT_NAME: ${{ inputs.environment }}", workflow)
        self.assertIn("GITHUB_RUNTIME_SECRETS: ${{ toJSON(secrets) }}", workflow)
        self.assertIn("GITHUB_RUNTIME_VARS: ${{ toJSON(vars) }}", workflow)
        self.assertIn("prepare_worker_runtime.py artifacts/neon-worker/.env.runtime.json", workflow)
        self.assertLess(workflow.index('smoke-worker.ts "$COMPUTE_ENVIRONMENT" --preflight'),
                        workflow.index('sync-worker.mjs "$COMPUTE_ENVIRONMENT"'))
        self.assertNotIn("deno run", workflow)

    def test_uploaded_artifacts_are_an_explicit_safe_report_allowlist(self):
        workflow = (WORKFLOWS / "deploy-neon-worker.yml").read_text()
        match = re.search(r"^          path: \|\n((?:            .+\n)+)", workflow, re.MULTILINE)
        self.assertIsNotNone(match)
        allowed = {"inventory.json", "before.json", "after.json", "sync.json", "http-smoke.json", "inngest-smoke.json", "business-smoke.json"}
        paths = [PurePosixPath(line.strip()) for line in match.group(1).splitlines()]
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=str(path)):
                self.assertIn(str(path.parent), ("artifacts/neon-worker", "artifacts/neon-worker/production"))
                self.assertIn(path.name, allowed)
                self.assertNotIn("*", str(path))
                self.assertNotIn(".env", str(path))


if __name__ == "__main__":
    unittest.main()

"""Verify production/staging isolation using synthetic credentials only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from prepare_worker_runtime import CI_KEYS, TARGETS, prepare_worker_runtime


def fixture(environment):
    target = TARGETS[environment]
    return {
        "DATABASE_URL": f"postgresql://synthetic:synthetic@{target['host']}/neondb?sslmode=verify-full",
        "STORAGE_PROVIDER_MODE": "neon", "AWS_REGION": "ap-southeast-1",
        "NEON_STORAGE_BUCKET": target["bucket"],
        "AWS_ENDPOINT_URL_S3": f"https://{target['branch']}.storage.c-3.ap-southeast-1.aws.neon.tech",
        "AWS_ACCESS_KEY_ID": "synthetic-access", "AWS_SECRET_ACCESS_KEY": "synthetic-storage-secret",
        "BETTER_AUTH_SECRET": "synthetic-auth-secret", "GOOGLE_CLIENT_ID": "synthetic-google-id",
        "GOOGLE_CLIENT_SECRET": "synthetic-google-secret", "RESEND_API_KEY": "synthetic-resend",
        "GEMINI_API_KEY": "synthetic-gemini", "INNGEST_EVENT_KEY": "synthetic-event",
        "INNGEST_SIGNING_KEY": "synthetic-signing", "INNGEST_ENV": target["inngest"],
        "COMPUTE_SERVICE_SECRET": "synthetic-compute", "DIKTAT_RENDERER_SECRET": "synthetic-renderer",
        "DIKTAT_RENDERER_URL": target["renderer"], "CF_ACCOUNT_ID": "synthetic-account",
        "CF_API_TOKEN": "synthetic-browser-token", "NEXT_PUBLIC_APP_URL": target["origin"],
    }


class WorkerRuntimeTest(unittest.TestCase):
    def test_background_vector_writer_does_not_change_web_settings(self):
        source = fixture("production") | {"VECTORIZE_SHARED_SECRET": "existing-web-key",
            "BACKGROUND_VECTORIZE_SHARED_SECRET": "synthetic-background-key"}
        result = prepare_worker_runtime("production", source,
            {"BACKGROUND_VECTORIZE_WORKER_URL": "https://zyx-vector-api-background.16922204.workers.dev"})
        self.assertEqual(result["VECTORIZE_SHARED_SECRET"], "synthetic-background-key")
        self.assertEqual(source["VECTORIZE_SHARED_SECRET"], "existing-web-key")
        self.assertNotIn("BACKGROUND_VECTORIZE_SHARED_SECRET", result)

    def test_background_vector_writer_requires_exact_production_pair(self):
        for environment, url, key in [
            ("staging", "https://zyx-vector-api-background.16922204.workers.dev", "synthetic"),
            ("production", "https://other.workers.dev", "synthetic"),
            ("production", "https://zyx-vector-api-background.16922204.workers.dev", ""),
            ("production", "", "synthetic"),
        ]:
            with self.subTest(environment=environment, url=url), self.assertRaisesRegex(ValueError, "WORKER_VECTOR_WRITER_TARGET_MISMATCH"):
                prepare_worker_runtime(environment, fixture(environment) | {"BACKGROUND_VECTORIZE_SHARED_SECRET": key},
                    {"BACKGROUND_VECTORIZE_WORKER_URL": url})

    def test_explicit_environment_is_required(self):
        for name in (None, "", "Production", "preview", "development"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "WORKER_ENVIRONMENT_REQUIRED"):
                prepare_worker_runtime(name, fixture("production"), {})

    def test_exact_targets_and_all_flag_values_are_preserved(self):
        for environment in TARGETS:
            with self.subTest(environment=environment):
                source = fixture(environment)
                source.update(FEATURE_REFLECTION_EMAIL="0", FEATURE_EXISTING_OTHER="1", GA_PRIVATE_KEY='line one\nline two,="literal"')
                result = prepare_worker_runtime(environment, source, {"FEATURE_DIKTAT_AI": "0"})
                for name in ("GA_PRIVATE_KEY", "AWS_SECRET_ACCESS_KEY", "INNGEST_SIGNING_KEY", "FEATURE_REFLECTION_EMAIL", "FEATURE_EXISTING_OTHER"):
                    self.assertEqual(result[name], source[name])
                self.assertEqual(result["FEATURE_DIKTAT_AI"], "0")
                self.assertEqual(result["ZYX_ENVIRONMENT"], environment)
                self.assertEqual(result["ZYX_MCP_ENVIRONMENT"], environment)
                self.assertEqual(result["BETTER_AUTH_URL"], TARGETS[environment]["origin"])
                self.assertEqual(result["AUTHORING_VERIFICATION_BROWSER_PROVIDER"], "cloudflare")
                self.assertIn(TARGETS[environment]["branch"], result["COMPUTE_SERVICE_URL"])

    def test_ci_credentials_and_unknown_values_are_never_copied(self):
        source = fixture("production") | {key: "synthetic-ci-credential" for key in CI_KEYS}
        result = prepare_worker_runtime("production", source | {"UNRECOGNIZED_SECRET": "hidden"}, {})
        self.assertFalse(result.keys() & CI_KEYS)
        self.assertNotIn("UNRECOGNIZED_SECRET", result)

    def test_missing_environment_label_uses_the_explicit_target(self):
        for environment in ("production", "staging"):
            source = fixture(environment)
            del source["INNGEST_ENV"]
            result = prepare_worker_runtime(environment, source, {})
            self.assertEqual(result["INNGEST_ENV"], TARGETS[environment]["inngest"])

    def test_cross_environment_targets_fail_closed(self):
        for environment, other in (("production", "staging"), ("staging", "production")):
            for key in ("DATABASE_URL", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "INNGEST_ENV", "DIKTAT_RENDERER_URL", "NEXT_PUBLIC_APP_URL"):
                with self.subTest(environment=environment, key=key), self.assertRaises(ValueError):
                    prepare_worker_runtime(environment, fixture(environment) | {key: fixture(other)[key]}, {})

    def test_production_database_validation_matches_verified_tls_contract(self):
        source = fixture("production")
        invalid = [source["DATABASE_URL"].replace("verify-full", "require"),
                   source["DATABASE_URL"] + "&sslmode=disable", source["DATABASE_URL"] + "&host=other.neon.tech",
                   source["DATABASE_URL"].replace("/neondb?", "/other?"),
                   source["DATABASE_URL"].replace("postgresql:", "postgres:"), "[SENSITIVE]"]
        for url in invalid:
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "WORKER_DATABASE_TARGET_MISMATCH"):
                prepare_worker_runtime("production", source | {"DATABASE_URL": url}, {})

    def test_required_credentials_and_storage_identity_are_checked(self):
        for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "BETTER_AUTH_SECRET", "INNGEST_SIGNING_KEY", "DIKTAT_RENDERER_SECRET"):
            for value in ("", "[SENSITIVE]"):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    prepare_worker_runtime("production", fixture("production") | {key: value}, {})
        for changes in ({"AWS_REGION": "auto"}, {"STORAGE_PROVIDER_MODE": "r2"},
                        {"AWS_ENDPOINT_URL_S3": fixture("production")["AWS_ENDPOINT_URL_S3"] + "?other=1"},
                        {"ZYX_ENVIRONMENT": "staging"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                prepare_worker_runtime("production", fixture("production") | changes, {})

    def test_database_conflict_and_legacy_runtime_aliases(self):
        source = fixture("production")
        with self.assertRaisesRegex(ValueError, "WORKER_DATABASE_CREDENTIALS_CONFLICT"):
            prepare_worker_runtime("production", source, {"DATABASE_URL": source["DATABASE_URL"] + "&application_name=other"})
        result = prepare_worker_runtime("production", source | {"VECTORIZE_WORKER_SECRET": "legacy-vector-secret"}, {})
        self.assertEqual(result["VECTORIZE_SHARED_SECRET"], "legacy-vector-secret")

    def test_cli_writes_private_envelope_without_printing_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.runtime.json"
            env = os.environ | {"GITHUB_ENVIRONMENT_NAME": "production", "GITHUB_RUNTIME_SECRETS": json.dumps(fixture("production")),
                                "GITHUB_RUNTIME_VARS": "{}", "GITHUB_SHA": "a" * 40}
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("prepare_worker_runtime.py")), str(path)], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            saved = json.loads(path.read_text())
            self.assertEqual(saved["sourceRevision"], "a" * 40)
            self.assertEqual(saved["environment"]["NEON_STORAGE_BUCKET"], "zyx-production")
            self.assertNotIn("synthetic-storage-secret", result.stdout + result.stderr)
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()

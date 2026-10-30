"""Check runtime sync with synthetic credentials, including multiline values."""
import unittest
from cloud_run_runtime import prepare_runtime


ORIGIN = "https://staging.zyxacademy.com"
DATABASE = "libsql://zyx-staging-soezyxstt.aws-ap-south-1.turso.io"


class RuntimeSettingsTest(unittest.TestCase):
    def setUp(self):
        self.service = {"spec": {"template": {"spec": {"containers": [{"env": []}]}}}}
        self.secrets = {key: "dummy-value" for key in ("TURSO_AUTH_TOKEN", "BETTER_AUTH_SECRET",
                        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "GEMINI_API_KEY", "INNGEST_EVENT_KEY")}
        self.secrets["TURSO_CONNECTION_URL"] = DATABASE

    def test_only_runtime_settings_are_copied_and_values_are_lossless(self):
        multiline = 'line one,="value"\nline two\\literal'
        self.secrets.update(GA_PRIVATE_KEY=multiline, GCP_SERVICE_ACCOUNT_KEY="ci-key",
                            PYTHON_RUNTIME_TOKEN_SECRET="runtime-key",
                            DENO_DEPLOY_TOKEN="deno-token", GITHUB_TOKEN="github-token",
                            SKIP_ENV_VALIDATION="1", ALLOW_STAGING_MUTATION="1", UNKNOWN_SECRET="unknown")
        plain, refs = prepare_runtime(self.service, self.secrets, {}, ORIGIN)
        self.assertEqual(plain["GA_PRIVATE_KEY"], multiline)
        self.assertEqual(plain["PYTHON_RUNTIME_TOKEN_SECRET"], "runtime-key")
        for key in ("GCP_SERVICE_ACCOUNT_KEY", "DENO_DEPLOY_TOKEN", "GITHUB_TOKEN", "SKIP_ENV_VALIDATION", "ALLOW_STAGING_MUTATION", "UNKNOWN_SECRET"):
            self.assertNotIn(key, plain)
        self.assertEqual(refs, [])

    def test_existing_unmanaged_values_references_and_flag_states_are_preserved(self):
        self.service["spec"]["template"]["spec"]["containers"][0]["env"] = [
            {"name": "CUSTOM_SETTING", "value": "keep"},
            {"name": "LIVE_HMAC_SECRET", "valueFrom": {"secretKeyRef": {"name": "live-secret", "key": "2"}}},
            {"name": "FEATURE_PKA", "value": "0"},
            {"name": "SKIP_ENV_VALIDATION", "value": "1"},
        ]
        plain, refs = prepare_runtime(self.service, self.secrets, {}, ORIGIN)
        self.assertEqual(plain["CUSTOM_SETTING"], "keep")
        self.assertEqual(plain["FEATURE_PKA"], "0")
        self.assertIn("LIVE_HMAC_SECRET=live-secret:2", refs)
        self.assertNotIn("SKIP_ENV_VALIDATION", plain)
        self.assertNotIn("LIVE_HMAC_SECRET", plain)

    def test_missing_auth_secret_blocks_incomplete_runtime(self):
        self.secrets.pop("BETTER_AUTH_SECRET")
        with self.assertRaisesRegex(ValueError, "BETTER_AUTH_SECRET"):
            prepare_runtime(self.service, self.secrets, {}, ORIGIN)

    def test_wrong_database_and_production_origin_are_rejected(self):
        for key, value in (("TURSO_CONNECTION_URL", "file:dev.db"), ("TURSO_CONNECTION_URL", "libsql://production.example")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                prepare_runtime(self.service, {**self.secrets, key: value}, {}, ORIGIN)
        with self.assertRaises(ValueError):
            prepare_runtime(self.service, self.secrets, {}, "https://www.zyxacademy.com")

    def test_configured_vars_and_legacy_storage_aliases_are_supported(self):
        plain, _ = prepare_runtime(self.service, {**self.secrets, "CF_R2_BUCKET": "zyx-staging"},
                                   {"FEATURE_PKA": "0"}, ORIGIN)
        self.assertEqual(plain["R2_BUCKET"], "zyx-staging")
        self.assertEqual(plain["FEATURE_PKA"], "0")


if __name__ == "__main__":
    unittest.main()

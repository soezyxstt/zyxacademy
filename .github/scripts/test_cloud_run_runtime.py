"""Check runtime sync with synthetic credentials, including multiline values."""
import unittest
from cloud_run_runtime import prepare_runtime


ORIGIN = "https://staging.zyxacademy.com"
HOST = "ep-staging.example.neon.tech"
DATABASE = "postgresql://user:dummy@" + HOST + "/neondb?sslmode=verify-full"
ENDPOINT = "https://br-staging.storage.c-3.ap-southeast-1.aws.neon.tech"
VARIABLES = {"NEON_EXPECTED_HOST": HOST, "STORAGE_PROVIDER_MODE": "neon",
             "NEON_EXPECTED_STORAGE_ENDPOINT": ENDPOINT, "NEON_EXPECTED_STORAGE_BUCKET": "staging-bucket"}


class RuntimeSettingsTest(unittest.TestCase):
    def setUp(self):
        self.service = {"spec": {"template": {"spec": {"containers": [{"env": []}]}}}}
        self.secrets = {key: "dummy-value" for key in ("TURSO_AUTH_TOKEN", "BETTER_AUTH_SECRET",
                        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "GEMINI_API_KEY", "INNGEST_EVENT_KEY")}
        self.secrets.update(DATABASE_URL=DATABASE, NEON_STORAGE_BUCKET="staging-bucket",
                            AWS_ENDPOINT_URL_S3=ENDPOINT, AWS_REGION="ap-southeast-1",
                            AWS_ACCESS_KEY_ID="dummy-key", AWS_SECRET_ACCESS_KEY="dummy-secret")

    def test_only_runtime_settings_are_copied_and_values_are_lossless(self):
        multiline = 'line one,="value"\nline two\\literal'
        self.secrets.update(GA_PRIVATE_KEY=multiline, GCP_SERVICE_ACCOUNT_KEY="ci-key",
                            PYTHON_RUNTIME_TOKEN_SECRET="runtime-key",
                            DENO_DEPLOY_TOKEN="deno-token", GITHUB_TOKEN="github-token",
                            SKIP_ENV_VALIDATION="1", ALLOW_STAGING_MUTATION="1", UNKNOWN_SECRET="unknown")
        plain, refs = prepare_runtime(self.service, self.secrets, VARIABLES, ORIGIN)
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
        plain, refs = prepare_runtime(self.service, self.secrets, VARIABLES, ORIGIN)
        self.assertEqual(plain["CUSTOM_SETTING"], "keep")
        self.assertEqual(plain["FEATURE_PKA"], "0")
        self.assertIn("LIVE_HMAC_SECRET=live-secret:2", refs)
        self.assertNotIn("SKIP_ENV_VALIDATION", plain)
        self.assertNotIn("LIVE_HMAC_SECRET", plain)

    def test_existing_required_storage_secret_reference_is_preserved(self):
        del self.secrets["AWS_SECRET_ACCESS_KEY"]
        self.service["spec"]["template"]["spec"]["containers"][0]["env"] = [
            {"name": "AWS_SECRET_ACCESS_KEY", "valueFrom": {"secretKeyRef": {"name": "storage-secret", "key": "3"}}},
        ]
        plain, refs = prepare_runtime(self.service, self.secrets, VARIABLES, ORIGIN)
        self.assertNotIn("AWS_SECRET_ACCESS_KEY", plain)
        self.assertIn("AWS_SECRET_ACCESS_KEY=storage-secret:3", refs)

    def test_missing_auth_secret_blocks_incomplete_runtime(self):
        self.secrets.pop("BETTER_AUTH_SECRET")
        with self.assertRaisesRegex(ValueError, "BETTER_AUTH_SECRET"):
            prepare_runtime(self.service, self.secrets, VARIABLES, ORIGIN)

    def test_wrong_database_and_production_origin_are_rejected(self):
        for key, value in (("DATABASE_URL", "file:dev.db"), ("DATABASE_URL", "postgresql://user:pass@production.neon.tech/neondb")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                prepare_runtime(self.service, {**self.secrets, key: value}, VARIABLES, ORIGIN)
        with self.assertRaises(ValueError):
            prepare_runtime(self.service, self.secrets, VARIABLES, "https://www.zyxacademy.com")

    def test_neon_and_optional_runtime_values_are_copied(self):
        keys = ("INNGEST_ENV", "CF_BROWSER_API_TOKEN", "AUTHORING_VERIFICATION_ACCESS_URL")
        self.secrets.update({key: "dummy-" + key for key in keys})
        plain, _ = prepare_runtime(self.service, self.secrets, VARIABLES, ORIGIN)
        for key in (*keys, "DATABASE_URL", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3",
                    "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            self.assertEqual(plain[key], self.secrets[key])
        self.assertEqual(plain["STORAGE_PROVIDER_MODE"], "neon")

    def test_missing_target_or_neon_storage_settings_fail_closed(self):
        for variables in ({}, {**VARIABLES, "NEON_EXPECTED_HOST": "ep-other.example.neon.tech"},
                          {**VARIABLES, "STORAGE_PROVIDER_MODE": "r2"}):
            with self.subTest(variables=variables), self.assertRaises(ValueError):
                prepare_runtime(self.service, self.secrets, variables, ORIGIN)
        for key in ("NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                prepare_runtime(self.service, {k: v for k, v in self.secrets.items() if k != key}, VARIABLES, ORIGIN)

    def test_configured_vars_and_legacy_storage_aliases_are_supported(self):
        plain, _ = prepare_runtime(self.service, {**self.secrets, "CF_R2_BUCKET": "zyx-staging"},
                                   {**VARIABLES, "FEATURE_PKA": "0"}, ORIGIN)
        self.assertEqual(plain["R2_BUCKET"], "zyx-staging")
        self.assertEqual(plain["FEATURE_PKA"], "0")

    def test_wrong_storage_target_and_missing_guard_are_rejected(self):
        for key, value in (("NEON_STORAGE_BUCKET", "production"),
                           ("AWS_ENDPOINT_URL_S3", ENDPOINT.replace("br-staging", "br-other")),
                           ("AWS_REGION", "us-east-1")):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "storage target"):
                prepare_runtime(self.service, {**self.secrets, key: value}, VARIABLES, ORIGIN)
        for key in ("NEON_EXPECTED_STORAGE_ENDPOINT", "NEON_EXPECTED_STORAGE_BUCKET"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                prepare_runtime(self.service, self.secrets, {k: v for k, v in VARIABLES.items() if k != key}, ORIGIN)

    def test_connection_parameter_overrides_and_unverified_tls_are_rejected(self):
        for suffix in ("&host=other.neon.tech", "&port=5433", "&database=other", "&sslmode=disable"):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                prepare_runtime(self.service, {**self.secrets, "DATABASE_URL": DATABASE + suffix}, VARIABLES, ORIGIN)
        with self.assertRaises(ValueError):
            prepare_runtime(self.service, {**self.secrets, "DATABASE_URL": DATABASE.replace("verify-full", "require")}, VARIABLES, ORIGIN)

    def test_web_and_worker_cannot_select_different_database_credentials(self):
        with self.assertRaisesRegex(ValueError, "conflicts"):
            prepare_runtime(self.service, self.secrets, {**VARIABLES, "DATABASE_URL": DATABASE + "&application_name=other"}, ORIGIN)
        with self.assertRaises(ValueError):
            prepare_runtime(self.service, {k: v for k, v in self.secrets.items() if k != "DATABASE_URL"},
                            {**VARIABLES, "DATABASE_URL": DATABASE}, ORIGIN)


if __name__ == "__main__":
    unittest.main()

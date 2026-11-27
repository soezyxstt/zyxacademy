"""Check staging isolation and secret filtering without calling Vercel."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

from sync_vercel_staging import ENVIRONMENT, EXPO_LINKS_FINGERPRINTS, PROJECT, TEAM, staging_env
from test_prepare_worker_runtime import fixture


class VercelStagingTest(unittest.TestCase):
    def test_api_failures_and_wrong_project_block_release_without_logging_values(self):
        source = fixture("staging")
        env = {"VERCEL_PROJECT_ID": PROJECT, "VERCEL_ORG_ID": TEAM,
               "GITHUB_RUNTIME_SECRETS": json.dumps(source), "GITHUB_RUNTIME_VARS": "{}",
               "VERCEL_TOKEN": "synthetic-ci-token"}
        for project, response, succeeds in [
            (PROJECT, {"created": [{}] * len(staging_env(source, {})), "failed": []}, True),
            (PROJECT, {"created": [], "failed": []}, False),
            (PROJECT, {"created": [], "failed": [{"error": "synthetic-private"}]}, False),
            ("prj_production", {}, False),
        ]:
            with self.subTest(project=project, succeeds=succeeds), patch.dict(os.environ, env | {"VERCEL_PROJECT_ID": project}, clear=True):
                output = io.StringIO()
                with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(response).encode())) as send, contextlib.redirect_stdout(output):
                    if succeeds:
                        runpy.run_path(str(Path(__file__).with_name("sync_vercel_staging.py")), run_name="__main__")
                    else:
                        with self.assertRaises(SystemExit):
                            runpy.run_path(str(Path(__file__).with_name("sync_vercel_staging.py")), run_name="__main__")
                self.assertEqual(send.call_count, int(project == PROJECT))
                for value in ("synthetic-ci-token", "synthetic-private", source["DATABASE_URL"]):
                    self.assertNotIn(value, output.getvalue())

    def test_runtime_targets_and_public_build_values_are_preserved(self):
        source = fixture("staging") | {"VERCEL_TOKEN": "synthetic-ci", "NEON_API_KEY": "synthetic-ci",
            "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "synthetic-public", "FEATURE_PKA": "0"}
        result = {item["key"]: item for item in staging_env(source, {})}
        self.assertEqual(result["ZYX_ENVIRONMENT"]["value"], "staging")
        self.assertEqual(result["FEATURE_PKA"]["value"], "0")
        self.assertEqual(result["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]["type"], "encrypted")
        self.assertEqual(result["DATABASE_URL"]["type"], "sensitive")
        self.assertTrue(all(item["customEnvironmentIds"] == [ENVIRONMENT] for item in result.values()))
        self.assertTrue(all("target" not in item for item in result.values()))
        self.assertFalse(result.keys() & {"VERCEL_TOKEN", "NEON_API_KEY", "NODE_ENV", "SKIP_ENV_VALIDATION"})

    def test_android_app_links_fingerprints_are_synchronized(self):
        fingerprint = ":".join(["AB"] * 32)
        source = fixture("staging") | {"ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS": fingerprint}
        result = {item["key"]: item for item in staging_env(source, {})}
        self.assertEqual(result["ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS"]["value"], fingerprint)
        self.assertNotIn("ANDROID_APP_LINKS_SHA256_FINGERPRINTS", result)
        self.assertNotIn(EXPO_LINKS_FINGERPRINTS, result)
        result = {item["key"]: item for item in staging_env(source, {EXPO_LINKS_FINGERPRINTS: fingerprint})}
        self.assertEqual(result[EXPO_LINKS_FINGERPRINTS]["value"], fingerprint)
        self.assertEqual(result[EXPO_LINKS_FINGERPRINTS]["customEnvironmentIds"], [ENVIRONMENT])

    def test_production_configuration_is_rejected(self):
        with self.assertRaises(ValueError):
            staging_env(fixture("production"), {})
        for key in ("DATABASE_URL", "NEON_STORAGE_BUCKET", "INNGEST_ENV", "DIKTAT_RENDERER_URL"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                staging_env(fixture("staging") | {key: fixture("production")[key]}, {})

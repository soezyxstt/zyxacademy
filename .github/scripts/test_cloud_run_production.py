import os
from pathlib import Path
import subprocess
import sys
import unittest


class ProductionRuntimeTest(unittest.TestCase):
    def test_preparation_reports_setting_codes_without_values(self):
        scripts = Path(__file__).resolve().parent
        env = {**os.environ, "CLOUD_RUN_ENVIRONMENT": "production",
               "GITHUB_REPOSITORY": "soezyxstt/zyxacademy", "GITHUB_REF": "refs/heads/main",
               "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_RUNTIME_VARS": "{}"}
        for source, expected in [("{}", "WORKER_DATABASE_TARGET_MISMATCH"),
                                 ('{"NEXT_PUBLIC_APP_URL":"https://private-value.invalid"}', "WORKER_APP_ORIGIN_MISMATCH")]:
            code = """
import json, os, sys
from prepare_cloud_run_production import settings
try:
    settings(json.loads(os.environ["GITHUB_RUNTIME_SECRETS"]), {})
except ValueError as error:
    sys.exit(str(error))
"""
            result = subprocess.run([sys.executable, "-c", code], cwd=scripts,
                                    env={**env, "GITHUB_RUNTIME_SECRETS": source}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stderr.strip(), expected)
            self.assertNotIn("private-value", result.stdout + result.stderr)

    def test_inventory_accepts_ready_serving_revision_without_candidate_metadata(self):
        code = """
import json
from unittest.mock import patch
from prepare_cloud_run_production import current_runtime, RUNTIME_ACCOUNT, SERVICE, SECRET_PREFIX

revision = SERVICE + "-00012-abc"
service = {"status": {"traffic": [{"revisionName": revision, "percent": 100}]}}
spec = {"metadata": {"name": revision, "labels": {"serving.knative.dev/service": SERVICE}},
        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
        "spec": {"serviceAccountName": RUNTIME_ACCOUNT, "containers": [{"env": [
            {"name": "PYTHON_RUNTIME_TOKEN_SECRET", "valueFrom": {"secretKeyRef": {
                "name": SECRET_PREFIX + "python-runtime-token-secret", "key": "5"}}},
        ]}]}}
with patch("prepare_cloud_run_production.describe_service", return_value=service), patch(
    "prepare_cloud_run_production.run", return_value=json.dumps(spec)
):
    actual, entries, refs = current_runtime()
    assert actual == revision
    assert refs["PYTHON_RUNTIME_TOKEN_SECRET"]["key"] == "5"
    assert refs.keys() == entries.keys()
"""
        scripts = Path(__file__).resolve().parent
        result = subprocess.run([sys.executable, "-c", code], cwd=scripts,
                                env={**os.environ, "CLOUD_RUN_ENVIRONMENT": "production"}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_runtime_keeps_web_retrieval_and_rejects_cross_environment(self):
        code = '''
from prepare_cloud_run_production import settings
from deploy_cloud_run_staging import public_config, validate_template, SECRET_PREFIX, RUNTIME_ACCOUNT, REQUIRED_SECRET_KEYS
from test_prepare_worker_runtime import fixture
source = fixture("production") | {"TURSO_AUTH_TOKEN": "legacy-secret", "TURSO_CONNECTION_URL": "libsql://legacy.invalid", "UPLOADTHING_TOKEN": "synthetic-upload", "VECTORIZE_WORKER_URL": "https://web.invalid", "VECTORIZE_SHARED_SECRET": "web-key",
    "BACKGROUND_VECTORIZE_SHARED_SECRET": "worker-key", "FEATURE_EXISTING": "0"}
values, public = settings(source, {"BACKGROUND_VECTORIZE_WORKER_URL": "https://zyx-vector-api-background.16922204.workers.dev"})
assert values["QUEUE_PROVIDER"] == "cloud-tasks"
assert values["VECTORIZE_WORKER_URL"] == "https://web.invalid"
assert values["VECTORIZE_SHARED_SECRET"] == "web-key"
assert values["FEATURE_EXISTING"] == "0"
assert "DATABASE_URL" not in public
assert "TURSO_AUTH_TOKEN" not in values and "TURSO_CONNECTION_URL" not in values
assert values["UPLOADTHING_TOKEN"] == "synthetic-upload"
assert public["NEXT_PUBLIC_APP_URL"] == "https://www.zyxacademy.com"
assert SECRET_PREFIX == "zyx-production-web-"
from deploy_cloud_run_staging import verify_database
from unittest.mock import patch
with patch("deploy_cloud_run_staging.read_secret", return_value=source["DATABASE_URL"]), patch("deploy_cloud_run_staging.command", return_value='{"state":"pending"}'):
    try: verify_database({"DATABASE_URL": {}})
    except ValueError: pass
    else: raise AssertionError("pending production schema accepted")
for unsafe in [fixture("staging"), source | {"NEXT_PUBLIC_APP_URL": "https://evil.invalid"}]:
    try: settings(unsafe, {})
    except ValueError: pass
    else: raise AssertionError("cross-environment runtime accepted")
for origin in ["https://staging.zyxacademy.com", "https://www.zyxacademy.com/path", "https://www.zyxacademy.com@evil.invalid"]:
    try: public_config('{"NEXT_PUBLIC_APP_URL":"' + origin + '"}')
    except ValueError: pass
    else: raise AssertionError("invalid production origin accepted")
'''
        scripts = Path(__file__).resolve().parent
        result = subprocess.run([sys.executable, "-c", code], cwd=scripts,
                                env={**os.environ, "CLOUD_RUN_ENVIRONMENT": "production"}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()

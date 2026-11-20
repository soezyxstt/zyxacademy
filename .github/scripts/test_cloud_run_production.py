import os
from pathlib import Path
import subprocess
import sys
import unittest


class ProductionRuntimeTest(unittest.TestCase):
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

"""Exercise deployment ordering and failure handling without Google Cloud access."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("deploy-cloud-run.sh")
IMAGE = "asia-east1-docker.pkg.dev/zyx-academy/zyx-staging/zyx-academy@sha256:" + "a" * 64
ACCOUNT = "zyx-staging-build@zyx-academy.iam.gserviceaccount.com"
ORIGIN = "https://staging.zyxacademy.com"


class CloudRunDeploymentTest(unittest.TestCase):
    def deploy(self, scenario="success", marker="staging", origin=ORIGIN, project="zyx-academy", manual=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = [
                {"name": "ZYX_ENVIRONMENT", "value": marker},
                {"name": "BETTER_AUTH_URL", "value": origin},
                {"name": "NEXT_PUBLIC_APP_URL", "value": origin},
            ] + [
                {"name": key, "valueFrom": {"secretKeyRef": {"name": "staging-" + key, "key": "1"}}}
                for key in ("DATABASE_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID",
                            "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "GEMINI_API_KEY",
                            "INNGEST_EVENT_KEY", "TURSO_AUTH_TOKEN")
            ]
            before = {
                "spec": {"template": {"spec": {"serviceAccountName": ACCOUNT,
                                               "containers": [{"env": environment}]}}},
                "status": {"latestReadyRevisionName": "old-revision",
                           "traffic": [{"revisionName": "old-revision", "percent": 100}]},
            }
            if manual:
                before["spec"]["template"]["spec"]["containers"][0]["env"] = [
                    {"name": "DATABASE_URL", "value": "file:dev.db"},
                    {"name": "TURSO_DATABASE_URL", "value": "file:old.db"},
                ]
            (root / "before.json").write_text(json.dumps(before))
            fake = root / "gcloud"
            fake.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ["FAKE_ROOT"])
args = sys.argv[1:]
with (root / "calls.jsonl").open("a") as log:
    log.write(json.dumps(args) + "\\n")
scenario = os.environ["SCENARIO"]
if args[:3] == ["run", "services", "describe"]:
    if scenario == "missing-service": sys.exit(1)
    if "--format=value(status.latestCreatedRevisionName)" in args:
        print("new-revision")
    elif (root / "after.json").exists():
        print((root / "after.json").read_text())
    else:
        print((root / "before.json").read_text())
elif args[:2] == ["run", "deploy"]:
    runtime = next(arg.split("=", 1)[1] for arg in args if arg.startswith("--env-vars-file="))
    (root / "runtime-snapshot.json").write_text(Path(runtime).read_text())
    (root / "runtime-path.txt").write_text(runtime)
    if scenario == "deploy-failed": sys.exit(1)
    ready = "old-revision"
    print(json.dumps({"status": {"latestCreatedRevisionName": "new-revision",
                                 "latestReadyRevisionName": ready}}))
elif args[:3] == ["run", "revisions", "describe"]:
    image = "wrong-image" if scenario == "wrong-image" else os.environ["CLOUD_RUN_IMAGE"]
    ready = "False" if scenario == "not-ready" else "True"
    print(json.dumps({"spec": {"containers": [{"image": image}]},
                      "status": {"conditions": [{"type": "Ready", "status": ready}]}}))
elif args[:3] == ["run", "services", "update-traffic"]:
    after = {"status": {"url": "https://staging.example.run.app",
        "traffic": [{"revisionName": "new-revision", "percent": 100}]}}
    (root / "after.json").write_text(json.dumps(after))
    print(json.dumps([after]))
else:
    sys.exit("Unexpected gcloud operation")
''')
            fake.chmod(0o700)
            env = {
                "PATH": str(root) + os.pathsep + os.environ["PATH"],
                "GCP_PROJECT": project, "GCP_REGION": "asia-east1",
                "CLOUD_RUN_SERVICE": "zyx-academy",
                "CLOUD_RUN_RUNTIME_ACCOUNT": ACCOUNT, "CLOUD_RUN_IMAGE": IMAGE,
                "CLOUD_RUN_BUILD_ORIGIN": ORIGIN,
                "FAKE_ROOT": str(root), "SCENARIO": scenario,
                "GITHUB_STEP_SUMMARY": str(root / "summary.md"),
                "GITHUB_STAGING_SECRETS": json.dumps({
                    "TURSO_CONNECTION_URL": "libsql://zyx-staging-soezyxstt.aws-ap-south-1.turso.io",
                    **{key: "dummy-runtime-value" for key in ("TURSO_AUTH_TOKEN", "BETTER_AUTH_SECRET",
                       "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "GEMINI_API_KEY", "INNGEST_EVENT_KEY")},
                    "GCP_SERVICE_ACCOUNT_KEY": "never-copy-this-ci-key",
                }),
                "GITHUB_STAGING_VARS": "{}",
            }
            result = subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True, text=True)
            calls = [json.loads(line) for line in (root / "calls.jsonl").read_text().splitlines()] if (root / "calls.jsonl").exists() else []
            summary = (root / "summary.md").read_text() if (root / "summary.md").exists() else ""
            self.last_runtime = json.loads((root / "runtime-snapshot.json").read_text()) if (root / "runtime-snapshot.json").exists() else None
            if (root / "runtime-path.txt").exists():
                self.assertFalse(Path((root / "runtime-path.txt").read_text()).exists())
            return result, calls, summary

    def test_updates_traffic_only_after_exact_digest_is_ready(self):
        result, calls, summary = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c[:2] for c in calls], [["run", "services"], ["run", "deploy"],
                                                ["run", "services"], ["run", "revisions"], ["run", "services"],
                                                ["run", "services"]])
        self.assertIn("--no-traffic", calls[1])
        self.assertIn("--image=" + IMAGE, calls[1])
        self.assertIn("--max=1", calls[1])
        self.assertIn("--min=0", calls[1])
        self.assertIn("--to-revisions=new-revision=100", calls[-2])
        self.assertFalse(any("allow-unauthenticated" in arg for c in calls for arg in c))
        self.assertIn("old-revision", summary)

    def test_failed_deployment_or_wrong_revision_never_changes_traffic(self):
        for scenario in ("deploy-failed", "not-ready", "wrong-image"):
            with self.subTest(scenario=scenario):
                result, calls, _ = self.deploy(scenario=scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c[:3] == ["run", "services", "update-traffic"] for c in calls))

    def test_missing_service_does_not_create_an_unconfigured_app(self):
        result, calls, _ = self.deploy(scenario="missing-service")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)

    def test_production_marker_is_rejected_before_deployment(self):
        result, calls, _ = self.deploy(marker="production")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)

    def test_build_origin_is_synced_to_runtime(self):
        result, calls, _ = self.deploy(origin="https://other-staging.example")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.last_runtime["BETTER_AUTH_URL"], ORIGIN)
        self.assertEqual(self.last_runtime["NEXT_PUBLIC_APP_URL"], ORIGIN)

    def test_manual_service_gets_github_runtime_settings_before_traffic_switch(self):
        result, calls, _ = self.deploy(manual=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for key in ("DATABASE_URL", "TURSO_DATABASE_URL", "TURSO_CONNECTION_URL"):
            self.assertEqual(self.last_runtime[key], "libsql://zyx-staging-soezyxstt.aws-ap-south-1.turso.io")
        self.assertEqual(self.last_runtime["ZYX_ENVIRONMENT"], "staging")
        self.assertNotIn("GCP_SERVICE_ACCOUNT_KEY", self.last_runtime)

    def test_different_project_is_rejected_before_cloud_access(self):
        result, calls, _ = self.deploy(project="other-project")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()

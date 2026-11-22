import copy
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from deploy_cloud_run_staging import (
    REQUIRED_SECRET_KEYS, REVISION, RUNTIME_ACCOUNT, STAGING, change_traffic,
    prepare, public_config, traffic, validate_template,
)


CONFIG = {"NEXT_PUBLIC_APP_URL": "https://staging.zyxacademy.com"}
CANDIDATE = "zyx-academy-staging-web-r123a1"
PREVIOUS = "zyx-academy-staging-web-r122a1"


def service_with_traffic(revision):
    return {"status": {"traffic": [{"revisionName": revision, "percent": 100},
                                   {"revisionName": CANDIDATE, "tag": "isolated"}],
                       "url": "https://staging.run.app"}}


def spec():
    endpoint = f"https://{STAGING['branch']}.storage.c-3.ap-southeast-1.aws.neon.tech"
    settings = {
        **CONFIG,
        "ZYX_ENVIRONMENT": "staging",
        "ZYX_MCP_ENVIRONMENT": "staging",
        "BETTER_AUTH_URL": CONFIG["NEXT_PUBLIC_APP_URL"],
        "STORAGE_PROVIDER_MODE": "neon",
        "NEON_STORAGE_BUCKET": STAGING["bucket"],
        "AWS_REGION": "ap-southeast-1",
        "AWS_ENDPOINT_URL_S3": endpoint,
        "INNGEST_ENV": STAGING["inngest"],
        "DIKTAT_RENDERER_URL": STAGING["renderer"],
        "COMPUTE_SERVICE_URL": f"https://{STAGING['branch']}-zyxcompute.compute.c-3.ap-southeast-1.aws.neon.tech",
        "CF_ACCOUNT_ID": "fake-staging-account",
    }
    secrets = REQUIRED_SECRET_KEYS | {"CF_BROWSER_API_TOKEN"}
    env = ([{"name": name, "value": value} for name, value in settings.items()] +
           [{"name": name, "valueFrom": {"secretKeyRef": {"name": "zyx-staging-web-" + name.lower().replace("_", "-"),
                                                          "key": "1"}}} for name in secrets])
    return {"serviceAccountName": RUNTIME_ACCOUNT, "containers": [{"env": env}]}


class CloudRunStagingTest(unittest.TestCase):
    def test_missing_python_ticket_key_blocks_deployment(self):
        candidate = spec()
        entries = candidate["containers"][0]["env"]
        entries[:] = [item for item in entries if item["name"] != "PYTHON_RUNTIME_TOKEN_SECRET"]
        with self.assertRaisesRegex(ValueError, "missing required Secret Manager references"):
            validate_template(candidate, CONFIG)

    def test_cloud_run_jobs_require_manual_staging_dispatch(self):
        text = (Path(__file__).resolve().parents[1] / 'workflows/deploy-cloud-run-staging.yml').read_text()
        triggers = text.split('\non:\n', 1)[1].split('\npermissions:', 1)[0]
        self.assertEqual(re.findall(r'^  ([\w_]+):', triggers, re.MULTILINE), ['workflow_dispatch'])
        jobs = re.findall(r'^  ([\w-]+):\n    if: (.+)\n    environment: (.+)$', text, re.MULTILINE)
        self.assertEqual({name: environment for name, _, environment in jobs},
                         {'release': 'staging-cloud-run', 'import-secrets': 'staging'})
        for name, condition, _ in jobs:
            for event in ('push', 'pull_request', 'workflow_call', 'workflow_dispatch'):
                for branch in ('staging', 'main'):
                    for operation in ('candidate', 'promote', 'rollback', 'import-secrets'):
                        values = {'github.event_name': event, 'github.repository': 'soezyxstt/zyxacademy',
                                  'github.ref': f'refs/heads/{branch}', 'inputs.operation': operation}
                        expression = re.sub(r'(?:github|inputs)\.[\w.]+',
                                            lambda match: repr(values[match.group()]), condition)
                        with self.subTest(condition=condition, event=event, branch=branch, operation=operation):
                            expected_operation = (operation == 'import-secrets') == (name == 'import-secrets')
                            self.assertEqual(eval(expression.replace('&&', 'and'), {'__builtins__': {}}),
                                             event == 'workflow_dispatch' and branch == 'staging' and expected_operation)

    def test_traffic_dispatch_requires_an_exact_revision(self):
        sha = "f" * 40
        with tempfile.TemporaryDirectory() as temp:
            env = {
                "GITHUB_REPOSITORY": "soezyxstt/zyxacademy",
                "GITHUB_REF": "refs/heads/staging",
                "GITHUB_EVENT_NAME": "workflow_dispatch",
                "GITHUB_SHA": sha,
                "CLOUD_RUN_WORKLOAD_IDENTITY_PROVIDER": "projects/1/locations/global/workloadIdentityPools/staging/providers/github",
                "CLOUD_RUN_PREFLIGHT_DATABASE_VERSION": "1",
                "CLOUD_RUN_PUBLIC_CONFIG": '{"NEXT_PUBLIC_APP_URL":"https://staging.zyxacademy.com"}',
                "RUNNER_TEMP": temp,
            }
            with patch.dict("os.environ", env, clear=True), patch("deploy_cloud_run_staging.command", return_value=sha):
                for operation, revision in (("promote", CANDIDATE), ("rollback", PREVIOUS)):
                    with self.subTest(operation=operation):
                        with patch.dict("os.environ", {"CLOUD_RUN_OPERATION": operation, "CLOUD_RUN_REVISION": revision}):
                            self.assertEqual(prepare(), CONFIG)
                        for invalid in ("", "latest", "zyx-academy-production-web-r123a1"):
                            with patch.dict("os.environ", {"CLOUD_RUN_OPERATION": operation, "CLOUD_RUN_REVISION": invalid}):
                                with self.assertRaisesRegex(ValueError, "An exact revision is required"):
                                    prepare()

    def test_rejects_non_staging_or_unlisted_build_settings(self):
        self.assertEqual(public_config('{"NEXT_PUBLIC_APP_URL":"https://staging.zyxacademy.com"}'), CONFIG)
        for origin in ("https://www.zyxacademy.com", "https://staging.zyxacademy.com@untrusted.com",
                       "https://staging.zyxacademy.com/anything", "https://arbitrary.workers.dev"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                public_config(f'{{"NEXT_PUBLIC_APP_URL":"{origin}"}}')
        with self.assertRaises(ValueError):
            public_config('{"NEXT_PUBLIC_APP_URL":"https://staging.zyxacademy.com","DATABASE_URL":"value"}')
        with self.assertRaises(ValueError):
            public_config('{"NEXT_PUBLIC_APP_URL":"https://staging.zyxacademy.com","NEXT_PUBLIC_STAGING_MEDIA_ORIGIN":"https://cdn.zyxacademy.com"}')

    def test_requires_exact_staging_runtime_and_pinned_scoped_secrets(self):
        original = spec()
        validate_template(original, CONFIG)
        for key, value in (("DATABASE_URL", {"value": "server-secret"}),
                           ("CLOUD_RUN_ORIGIN_TOKEN", {"valueFrom": {"secretKeyRef": {
                               "name": "zyx-staging-web-origin", "key": "latest"}}}),
                           ("NODE_OPTIONS", {"valueFrom": {"secretKeyRef": {
                               "name": "zyx-staging-web-node-options", "key": "1"}}}),
                           ("NODE_ENV", {"value": "development"}),
                           ("ZYX_ENVIRONMENT", {"value": "production"}),
                           ("NEXT_PUBLIC_APP_URL", {"value": "https://www.zyxacademy.com"}),
                           ("NEON_STORAGE_BUCKET", {"value": "zyx-production"})):
            changed = copy.deepcopy(original)
            entries = changed["containers"][0]["env"]
            entries[:] = [entry for entry in entries if entry["name"] != key] + [{"name": key, **value}]
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_template(changed, CONFIG)

    def test_accepts_gateway_route_and_byok_aliases_and_rejects_provider_keys_in_plaintext(self):
        candidate = spec()
        entries = candidate["containers"][0]["env"]
        entries.extend({"name": key, "value": value} for key, value in (
            ("AI_META_GATEWAY_ROUTE", "custom-meta"), ("AI_META_MODEL_5", "muse-spark-1.2-contributor"),
            ("AI_META_BYOK_ALIASES", "meta-1,meta-2")))
        validate_template(candidate, CONFIG)
        entries.append({"name": "AI_META_API_KEY", "value": "test"})
        with self.assertRaises(ValueError):
            validate_template(candidate, CONFIG)

    def test_ignores_tagged_revisions_without_traffic(self):
        self.assertTrue(REVISION.fullmatch(CANDIDATE))
        self.assertEqual(traffic(service_with_traffic(PREVIOUS)), {PREVIOUS: 100})

    def test_post_switch_smoke_failure_restores_previous_traffic(self):
        before, after = service_with_traffic(PREVIOUS), service_with_traffic(CANDIDATE)
        with (
            patch.dict("os.environ", {"CLOUD_RUN_REVISION": CANDIDATE, "GITHUB_SHA": "f" * 40}),
            patch("deploy_cloud_run_staging.check_revision", return_value=({
                "spec": spec(), "metadata": {"labels": {"zyx-source-sha": "f" * 40}},
            }, "verified-digest")),
            patch("deploy_cloud_run_staging.verify_database"),
            patch("deploy_cloud_run_staging.read_tag", return_value="https://candidate.run.app"),
            patch("deploy_cloud_run_staging.smoke", side_effect=[None, ValueError("unhealthy")]),
            patch("deploy_cloud_run_staging.describe_service", side_effect=[before, after, after, before]),
            patch("deploy_cloud_run_staging.run") as cli,
        ):
            with self.assertRaisesRegex(SystemExit, "Previous Cloud Run traffic was restored"):
                change_traffic(CONFIG, before, "promote")
        self.assertEqual(cli.call_count, 2)
        self.assertIn(f"--to-revisions={PREVIOUS}=100", cli.call_args.args)


if __name__ == "__main__":
    unittest.main()

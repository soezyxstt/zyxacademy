import os
from pathlib import Path
import re
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from import_cloud_run_staging_secrets import IMPORT_KEYS, OPTIONAL_IMPORT_KEYS, STAGING, main


def staging_environment():
    return {
        **dict.fromkeys(IMPORT_KEYS, "synthetic-secret"),
        "GITHUB_REPOSITORY": "soezyxstt/zyxacademy",
        "GITHUB_REF": "refs/heads/staging",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "DATABASE_URL": (
            f"postgresql://zyx_staging_app_20261115:synthetic@{STAGING['host']}/neondb"
            "?sslmode=verify-full"
        ),
    }


class ImportSecretsTest(unittest.TestCase):
    def test_workflow_supplies_every_supported_import(self):
        workflow = (Path(__file__).resolve().parents[1] / "workflows/deploy-cloud-run-staging.yml").read_text()
        imports = workflow.split("- name: Import allowlisted staging credentials", 1)[1]
        keys = set(re.findall(r"^          ([A-Z][A-Z0-9_]*):", imports, re.MULTILINE))
        self.assertEqual(keys, IMPORT_KEYS | OPTIONAL_IMPORT_KEYS)
        self.assertTrue(IMPORT_KEYS.isdisjoint(OPTIONAL_IMPORT_KEYS))
        for required_key in (
            "PYTHON_RUNTIME_TOKEN_SECRET",
            "CF_AI_GATEWAY_URL",
            "CF_AI_GATEWAY_TOKEN",
            "ZYRA_CONTROL_PLANE_URL",
            "ZYRA_CONTROL_PLANE_TOKEN",
        ):
            self.assertIn(required_key, IMPORT_KEYS)
        self.assertNotIn("FIREBASE_SERVICE_ACCOUNT_JSON", keys)

    def test_imports_available_optional_values_without_leaking_them_to_children(self):
        with (
            patch.dict(os.environ, {**staging_environment(), "GOOGLE_REFRESH_TOKEN": "optional-value",
                                   "STEEL_API_KEY": "", "GITHUB_TOKEN": "excluded"}, clear=True),
            patch("import_cloud_run_staging_secrets.subprocess.run",
                  return_value=SimpleNamespace(stdout="projects/1/secrets/example/versions/2", returncode=0)) as run,
            patch("builtins.print") as log,
        ):
            main()
        self.assertEqual(run.call_count, len(IMPORT_KEYS) + 1)
        self.assertEqual(sum(kwargs["input"] == "optional-value" for _, kwargs in run.call_args_list), 1)
        for _, kwargs in run.call_args_list:
            self.assertTrue((IMPORT_KEYS | OPTIONAL_IMPORT_KEYS).isdisjoint(kwargs["env"]))
        self.assertNotIn("optional-value", str(log.call_args_list))

    def test_sends_values_only_through_stdin(self):
        with (
            patch.dict(os.environ, staging_environment(), clear=True),
            patch("import_cloud_run_staging_secrets.subprocess.run",
                  return_value=SimpleNamespace(stdout="projects/1/secrets/example/versions/1", returncode=0)) as run,
            patch("builtins.print") as log,
        ):
            main()

        self.assertEqual(run.call_count, len(IMPORT_KEYS))
        for args, kwargs in run.call_args_list:
            self.assertIn("--data-file=-", args[0])
            self.assertNotIn(kwargs["input"], " ".join(args[0]))
            self.assertTrue(IMPORT_KEYS.isdisjoint(kwargs["env"]))
        self.assertNotIn("synthetic", str(log.call_args_list))

    def test_rejects_missing_values_or_wrong_target_before_import(self):
        for changes in ({"GITHUB_REF": "refs/heads/main"}, {"GOOGLE_CLIENT_SECRET": ""},
                        {"PYTHON_RUNTIME_TOKEN_SECRET": ""},
                        {"CF_AI_GATEWAY_URL": ""}, {"CF_AI_GATEWAY_TOKEN": ""},
                        {"ZYRA_CONTROL_PLANE_URL": ""}, {"ZYRA_CONTROL_PLANE_TOKEN": ""},
                        {"DATABASE_URL": "postgresql://another-user:secret@example.com/neondb?sslmode=verify-full"}):
            with (
                self.subTest(keys=list(changes)),
                patch.dict(os.environ, {**staging_environment(), **changes}, clear=True),
                patch("import_cloud_run_staging_secrets.subprocess.run") as run,
                self.assertRaises(SystemExit),
            ):
                main()
            run.assert_not_called()

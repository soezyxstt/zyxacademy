import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from import_cloud_run_staging_secrets import IMPORT_KEYS, STAGING, main


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
                        {"DATABASE_URL": "postgresql://another-user:secret@example.com/neondb?sslmode=verify-full"}):
            with (
                self.subTest(keys=list(changes)),
                patch.dict(os.environ, {**staging_environment(), **changes}, clear=True),
                patch("import_cloud_run_staging_secrets.subprocess.run") as run,
                self.assertRaises(SystemExit),
            ):
                main()
            run.assert_not_called()

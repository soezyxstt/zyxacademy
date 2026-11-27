import csv
import json
from collections import Counter
from math import ceil
import os
from pathlib import Path
import runpy
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


ROOT = Path(__file__).resolve().parents[2]


class PublicScopeTest(unittest.TestCase):
    def test_readiness_denominator_keeps_auth_and_protected_operations(self):
        with (ROOT / "plans/native-parallel/routes.tsv").open() as file:
            rows = list(csv.DictReader(file, delimiter="\t"))
        public = {
            "app/tautan/page.tsx", "app/forms/[id]/page.tsx", "app/f/[slug]/page.tsx", "app/meet/[slug]/page.tsx",
        }
        auth = {f"app/(marketing)/{action}/page.tsx" for action in ("sign-in", "sign-out", "sign-up")}
        native = {row["web_source"]: row["owner"] for row in rows if row["web_source"] not in public and (
            not row["web_source"].startswith("app/(marketing)/") or row["web_source"] in auth
        )}
        self.assertEqual((168, 151, 144), (len(rows), len(native), ceil(0.95 * len(native))))
        self.assertEqual(Counter(student=50, academic=54, operations=36, integration=11), Counter(native.values()))
        self.assertTrue(auth <= native.keys())
        for route in ("forms", "meet", "tautan"):
            self.assertEqual("operations", native[f"app/(admin)/admin/{route}/page.tsx"])

    def test_default_maestro_excludes_public_flows_with_explicit_diagnostic_opt_in(self):
        with TemporaryDirectory() as directory:
            fixture = Path(directory)
            scripts = fixture / "scripts/native-parity"
            scripts.mkdir(parents=True)
            shutil.copyfile(ROOT / "scripts/native-parity/check-interactions.sh", scripts / "check-interactions.sh")
            flows = fixture / ".maestro/native-parity"
            flows.mkdir(parents=True)
            protected = {"button.yaml", "notification-inbox.yaml"}
            public = {"meet.yaml", "public-directory.yaml", "public-forms.yaml"}
            for name in protected | public:
                (flows / name).touch()
            maestro = fixture / "maestro"
            maestro.write_text("#!/usr/bin/env python3\nimport json, sys\nprint(json.dumps(sys.argv[1:]))\n")
            maestro.chmod(0o755)
            for flag, expected in (("0", protected), ("1", protected | public)):
                command = subprocess.run(
                    ["bash", str(scripts / "check-interactions.sh"), "android", "emulator"],
                    cwd=fixture, env={**os.environ, "NATIVE_PARITY_MAESTRO": str(maestro), "NATIVE_PARITY_PUBLIC_FIXTURES": flag},
                    capture_output=True, text=True, check=True,
                )
                selected = {Path(path).name for path in json.loads(command.stdout) if path.endswith(".yaml")}
                self.assertEqual(expected, selected)

    def test_normal_app_routes_omit_archived_public_pages_and_their_capture_options(self):
        mobile = ROOT / "apps/mobile-native"
        routes = ["public-links", "public-forms", "meet"]
        for route in routes:
            self.assertFalse((mobile / "app/internal" / route / "[caseId].tsx").exists())
            self.assertTrue((mobile / "diagnostics/public-pages" / route / "[caseId].tsx").is_file())
        capture = (mobile / "app/internal/parity-capture.tsx").read_text()
        reference = (mobile / "app/internal/webview-reference/[component].tsx").read_text()
        options = (mobile / "features/parity/historical-public.tsx").read_text()
        for forbidden in ("publicFormCases", "meetingCaseIds", "directoryCases", "directoryReadyScript"):
            self.assertNotIn(forbidden, capture + reference + options)
        self.assertIn("componentNames.map", capture)
        self.assertIn("publicCaptureSections.map", capture)
        self.assertIn("publicDirectoryReference(component)", reference)
        self.assertIn("}[] = [];", options)
        self.assertIn("return null;", options)

    def test_hosted_overlay_mounts_unmodified_routes_and_restores_capture_options(self):
        mobile = ROOT / "apps/mobile-native"
        overlay = runpy.run_path(str(ROOT / "scripts/native-parity/mount-public-fixtures.py"))
        with TemporaryDirectory() as directory:
            checkout = Path(directory)
            shutil.copytree(mobile / overlay["ARCHIVE"], checkout / overlay["ARCHIVE"])
            options = checkout / "features/parity" / overlay["OPTIONS"]
            options.parent.mkdir(parents=True)
            shutil.copyfile(mobile / "features/parity" / overlay["OPTIONS"], options)
            archive = checkout / overlay["ARCHIVE"]
            public_alias = checkout / "app/f/[slug].tsx"
            public_alias.parent.mkdir(parents=True)
            public_alias.write_text("Browser route")
            for _ in range(2):
                overlay["mount"](checkout)
                for route in overlay["ROUTES"]:
                    path = Path(route) / "[caseId].tsx"
                    self.assertEqual((archive / path).read_bytes(), (checkout / "app/internal" / path).read_bytes())
                self.assertEqual((archive / overlay["OPTIONS"]).read_bytes(), options.read_bytes())
                self.assertEqual("Browser route", public_alias.read_text())

            conflict = checkout / "app/internal/meet/[caseId].tsx"
            conflict.write_text("another route")
            with self.assertRaisesRegex(ValueError, "Existing fixture path requires review"):
                overlay["mount"](checkout)
            self.assertEqual("another route", conflict.read_text())

    def test_mount_cli_rejects_a_non_hosted_checkout(self):
        result = subprocess.run(
            ["python3", str(ROOT / "scripts/native-parity/mount-public-fixtures.py")],
            env={**os.environ, "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "self-hosted", "NATIVE_PARITY_PUBLIC_FIXTURES": "1"},
            capture_output=True, text=True,
        )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("only mount in the opt-in hosted device job", result.stderr)

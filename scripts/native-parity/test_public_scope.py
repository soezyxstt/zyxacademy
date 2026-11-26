import csv
import json
from collections import Counter
from math import ceil
import os
from pathlib import Path
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

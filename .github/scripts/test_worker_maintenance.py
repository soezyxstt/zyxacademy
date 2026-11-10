"""Keep production maintenance isolated from deployment and private artifacts."""
from itertools import product
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/deploy.yml").read_text()
JOBS = dict(re.findall(r"(?ms)^  ([\w-]+):\n(.*?)(?=^  [\w-]+:\n|\Z)", WORKFLOW.split("\njobs:\n", 1)[1]))
MODES = ("vector-plan", "vector-apply", "vector-verify", "remaining")
FLAGS = ("business_acceptance", "browser_diagnostics", "runtime_diagnostics", "restore_turso_worker")


def allowed(job, maintenance, branch="main", event="workflow_dispatch", **flags):
    condition = re.search(r"(?m)^    if: (.+)$", JOBS[job]).group(1)
    values = {"github.event_name": event, "github.ref_name": branch,
              "inputs.maintenance": maintenance, "inputs.diagnostic_environment": "production"}
    values.update({f"inputs.{flag}": flags.get(flag, False) for flag in FLAGS})
    expression = re.sub(r"(?:github|inputs)\.[\w.]+", lambda match: repr(values[match.group()]), condition)
    expression = re.sub(r"!(?!=)", " not ", expression.replace("&&", " and ").replace("||", " or "))
    return bool(eval(expression, {"__builtins__": {}}))


class WorkerMaintenanceTest(unittest.TestCase):
    def test_maintenance_blocks_every_other_job_even_with_mixed_flags(self):
        for mode, branch, bits in product(MODES, ("main", "staging", "agent/recovery"), product((False, True), repeat=4)):
            flags = dict(zip(FLAGS, bits))
            with self.subTest(mode=mode, branch=branch, flags=flags):
                self.assertTrue(allowed("maintain-existing-worker", mode, branch=branch, **flags))
                for job in JOBS:
                    if job != "maintain-existing-worker":
                        self.assertFalse(allowed(job, mode, branch=branch, **flags), job)

    def test_empty_and_none_keep_existing_dispatch_behavior(self):
        for mode in ("", "none"):
            with self.subTest(mode=mode):
                self.assertFalse(allowed("maintain-existing-worker", mode))
                self.assertTrue(allowed("deploy-neon-production", mode))
                self.assertTrue(allowed("deploy-neon-staging", mode, branch="staging"))
                self.assertTrue(allowed("verify-existing-worker", mode, business_acceptance=True))
                self.assertTrue(allowed("browser-diagnostics", mode, browser_diagnostics=True))
                self.assertTrue(allowed("runtime-diagnostics", mode, runtime_diagnostics=True))
                self.assertTrue(allowed("runtime-diagnostics", mode, restore_turso_worker=True))
        for mode, event in product(MODES, ("push", "pull_request")):
            self.assertFalse(allowed("maintain-existing-worker", mode, event=event))

    def test_maintenance_has_no_build_deploy_restore_or_private_artifact_upload(self):
        block = JOBS["maintain-existing-worker"]
        self.assertIn("    environment: production\n", block)
        self.assertIn("cancel-in-progress: false", block)
        self.assertNotRegex(block, r"(?i)(?:bun|npm|pnpm)\s+(?:run\s+)?build\b|next\s+build\b|"
                                  r"deploy-(?:neon|worker)|--restore-turso|wrangler\s+deploy|vercel\s+deploy|gcloud\s+run")
        self.assertIn("bun install --frozen-lockfile --ignore-scripts", block)
        upload = block.split("- uses: actions/upload-artifact@", 1)[1]
        paths = re.search(r"(?m)^          path: \|\n((?:            [^\n]+\n)+)", upload).group(1)
        self.assertEqual([line.strip() for line in paths.splitlines()], [
            "artifacts/neon-worker/production/vector-recovery.json",
            "artifacts/neon-worker/production/remaining-smoke.json",
            "artifacts/neon-worker/production/remaining-retained.json",
        ])
        self.assertNotRegex(paths, r"[?*]|\.env|snapshot|before-vectors|batch-")


if __name__ == "__main__":
    unittest.main()

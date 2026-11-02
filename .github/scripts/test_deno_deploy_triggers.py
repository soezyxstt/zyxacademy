"""Tests ensuring GitHub Actions Deno deploy trigger paths stay tightly scoped to actual worker dependencies."""
import fnmatch
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT_DIR = Path(__file__).resolve().parents[2]
DEPLOY_WORKFLOW = ROOT_DIR / ".github" / "workflows" / "deploy.yml"


def load_trigger_paths():
    text = DEPLOY_WORKFLOW.read_text(encoding="utf-8")

    push_match = re.search(r"push:.*?paths:(.*?)(?:pull_request|workflow_dispatch)", text, re.S)
    if not push_match:
        raise ValueError("Could not find push.paths in deploy.yml")
    push_paths = re.findall(r"-\s*['\"]([^'\"]+)['\"]", push_match.group(1))

    pr_match = re.search(r"pull_request:.*?paths:(.*?)(?:workflow_dispatch|concurrency)", text, re.S)
    if not pr_match:
        raise ValueError("Could not find pull_request.paths in deploy.yml")
    pr_paths = re.findall(r"-\s*['\"]([^'\"]+)['\"]", pr_match.group(1))

    return push_paths, pr_paths


def matches_any_pattern(file_path: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if pattern.endswith("/**") and "*" not in pattern[:-3]:
            prefix = pattern[:-3]
            if file_path == prefix or file_path.startswith(prefix + "/"):
                return True
        elif fnmatch.fnmatch(file_path, pattern):
            return True
    return False


class DenoDeployTriggersTest(unittest.TestCase):
    def test_diktat_asset_smoke_uses_local_postgres_placeholder(self):
        text = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
        step = text.split("- name: Verify Diktat Runtime Assets", 1)[1].split("- name:", 1)[0]
        self.assertIn("DATABASE_URL: postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder", step)

    def test_only_release_branches_can_mutate_worker_and_staging_guard_runs_first(self):
        text = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("&& (github.ref_name == 'main' || github.ref_name == 'staging')", text)
        self.assertLess(text.index("name: Validate staging Neon target before Deno mutation"),
                        text.index("name: Provision Deno Deploy App"))

    def test_deploy_workflow_has_no_broad_top_level_globs(self):
        push_paths, pr_paths = load_trigger_paths()
        forbidden_globs = {"app/**", "components/**", "lib/**", "prompts/**", "db/**"}

        for paths, scope in [(push_paths, "push.paths"), (pr_paths, "pull_request.paths")]:
            with self.subTest(scope=scope):
                found_forbidden = set(paths) & forbidden_globs
                self.assertFalse(
                    found_forbidden,
                    f"Found overly broad globs in {scope} that cause false triggers: {found_forbidden}",
                )

    def test_impact_files_covered_by_deploy_workflow(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            impact_file = Path(tmp_dir) / "impact.txt"
            subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    "scripts/audit-worker-dependencies.ts",
                    f"--impact-output={impact_file}",
                ],
                cwd=ROOT_DIR,
                check=True,
                capture_output=True,
            )
            impact_files = [line.strip() for line in impact_file.read_text().splitlines() if line.strip()]

        self.assertGreater(len(impact_files), 200, "Expected at least 200 worker impact files")

        push_paths, pr_paths = load_trigger_paths()

        uncovered_push = [f for f in impact_files if not matches_any_pattern(f, push_paths)]
        self.assertEqual(
            uncovered_push,
            [],
            f"Worker impact files missing from deploy.yml push.paths: {uncovered_push}",
        )

        uncovered_pr = [f for f in impact_files if not matches_any_pattern(f, pr_paths)]
        self.assertEqual(
            uncovered_pr,
            [],
            f"Worker impact files missing from deploy.yml pull_request.paths: {uncovered_pr}",
        )

    def test_unrelated_files_do_not_trigger_deploy_workflow(self):
        push_paths, pr_paths = load_trigger_paths()

        unrelated_files = [
            "app/(student)/dashboard/page.tsx",
            "app/(admin)/admin/academic/schedules/page.tsx",
            "app/auth/login/page.tsx",
            "components/ui/button.tsx",
            "components/landing/hero.tsx",
            "components/admin/academic-schedules-dashboard.tsx",
            "lib/schedule/week-policy.ts",
            "lib/academic/semester.ts",
            "lib/forms/validation.ts",
            "prompts/study.txt",
            "docs/ARCHITECTURE.md",
            "drizzle/meta/_journal.json",
            "tests/contracts/schedule-calendar-date.test.ts",
        ]

        for file_path in unrelated_files:
            with self.subTest(file_path=file_path):
                self.assertFalse(
                    matches_any_pattern(file_path, push_paths),
                    f"{file_path} unexpectedly matched push.paths",
                )
                self.assertFalse(
                    matches_any_pattern(file_path, pr_paths),
                    f"{file_path} unexpectedly matched pull_request.paths",
                )

    def test_impact_detection_does_not_blindly_match_app_or_components(self):
        text = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn(
            "^(app/|components/|lib/|scripts/authoring/",
            text,
            "Detect Worker Impact must not blindly match broad directory prefixes",
        )


if __name__ == "__main__":
    unittest.main()

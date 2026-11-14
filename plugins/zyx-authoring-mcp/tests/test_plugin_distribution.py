import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import configure_environment as ce  # noqa: E402


class PluginDistributionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo_plugin_root = Path(__file__).resolve().parent.parent
        self.temp_dir = Path(tempfile.mkdtemp(prefix="zyx-plugin-test-"))
        self.source_copy = self.temp_dir / "source-plugin"
        ce.copy_allowlisted_tree(self.repo_plugin_root, self.source_copy)

    def tearDown(self) -> None:
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_release_exports_original_and_focused_skills_with_matching_host_metadata(self) -> None:
        original = (
            "zyx-authoring-pipeline", "zyx-source-pack-mcp", "zyx-idea-bundle-mcp",
            "zyx-product-bundle-mcp", "zyx-question-authoring-mcp",
            "reference-question-ingest", "zyx-admin-operations",
        )
        focused = (
            "zyx-blog-mcp", "zyx-content-revisions", "zyx-forms-mcp",
            "zyx-media-mcp", "zyx-operation-recovery",
        )
        release = ce.load_release_metadata(self.source_copy)
        self.assertEqual(tuple(release["skills"]), original + focused)
        self.assertEqual(ce.EXPECTED_SKILLS, original + focused)
        self.assertEqual(release["version"], "0.5.0")
        self.assertEqual(release["bootstrapProtocol"], 1)
        self.assertEqual(release["minCompatibleVersion"], "0.2.0")
        server_source = (self.repo_plugin_root.parent.parent / "lib/authoring/mcp-playbook.ts").read_text(encoding="utf-8")
        self.assertRegex(server_source, rf'RECOMMENDED_PLUGIN_VERSION\s*=\s*["\']{re.escape(release["version"])}["\']')

        for env_name in ("staging", "production"):
            with self.subTest(environment=env_name):
                target = self.temp_dir / f"inventory-{env_name}"
                summary = ce.configure_plugin(self.source_copy, env_name, output_dir=target)
                self.assertEqual(set(summary["fileHashes"]), ce.allowed_package_files())
                self.assertEqual({entry.name for entry in (target / "skills").iterdir()}, set(original + focused))
                codex = ce.read_json(target / ".codex-plugin/plugin.json")
                claude = ce.read_json(target / ".claude-plugin/plugin.json")
                self.assertEqual(codex["version"], release["version"])
                self.assertEqual(claude["version"], release["version"])
                self.assertLessEqual(len(codex["interface"]["shortDescription"]), 30)
                for skill in focused:
                    text = (target / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
                    self.assertRegex(text, rf"(?m)^name: {re.escape(skill)}$")
                    self.assertIn("admin.environment", text)
                    self.assertIn("admin.capabilities", text)
                    self.assertIn(f'"pluginVersion": "{release["version"]}"', text)
                    self.assertEqual(text.count("<!-- BEGIN:environment-connection -->"), 1)
                    yaml_text = (target / "skills" / skill / "agents/openai.yaml").read_text(encoding="utf-8")
                    fields = {
                        key.strip(): json.loads(value.strip())
                        for line in yaml_text.splitlines()
                        if line.startswith("  ")
                        for key, value in [line.strip().split(":", 1)]
                    }
                    self.assertEqual(set(fields), {"display_name", "short_description", "default_prompt"})
                    self.assertGreaterEqual(len(fields["short_description"]), 25)
                    self.assertLessEqual(len(fields["short_description"]), 64)
                    self.assertIn(f"${skill}", fields["default_prompt"])

    def test_missing_focused_skill_files_fail_packaging_instead_of_silently_omitting_skill(self) -> None:
        for relative in (
            "skills/zyx-blog-mcp/SKILL.md",
            "skills/zyx-operation-recovery/agents/openai.yaml",
        ):
            with self.subTest(relative=relative):
                source_file = self.source_copy / relative
                saved = source_file.read_bytes()
                source_file.unlink()
                with self.assertRaisesRegex(ValueError, "missing required allowlist files"):
                    ce.inspect_source_tree(self.source_copy)
                source_file.write_bytes(saved)

    def test_admin_skills_need_identity_discovery_while_revision_skill_keeps_stage_bootstrap(self) -> None:
        target = self.temp_dir / "workflow-boundaries"
        ce.configure_plugin(self.source_copy, "staging", output_dir=target)
        for skill in ce.ADMIN_IDENTITY_SKILLS:
            with self.subTest(skill=skill):
                path = target / "skills" / skill / "SKILL.md"
                saved = path.read_text(encoding="utf-8")
                path.write_text(saved.replace("admin.environment", "admin.identity_removed"), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "must require admin.environment"):
                    ce.validate_rendered_package(target, "staging")
                path.write_text(saved, encoding="utf-8")

        revision_path = target / "skills/zyx-content-revisions/SKILL.md"
        saved = revision_path.read_text(encoding="utf-8")
        self.assertIn("zyx-idea-bundle-mcp", saved)
        self.assertIn("zyx-product-bundle-mcp", saved)
        revision_path.write_text(saved.replace("workflow.get_playbook", "workflow.bootstrap_removed"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "must require workflow.get_playbook"):
            ce.validate_rendered_package(target, "staging")

    def test_build_preserves_unmanaged_output_and_rejects_extra_files_in_managed_output(self) -> None:
        target = self.temp_dir / "unmanaged-output"
        target.mkdir()
        sentinel = target / "personal-notes.txt"
        sentinel.write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unmanaged non-empty"):
            ce.configure_plugin(self.source_copy, "staging", output_dir=target)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")

        managed = self.temp_dir / "managed-output"
        ce.configure_plugin(self.source_copy, "staging", output_dir=managed)
        readme = (managed / "README.md").read_bytes()
        extra = managed / "personal-notes.txt"
        extra.write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "outside package allowlist"):
            ce.configure_plugin(self.source_copy, "staging", output_dir=managed)
        self.assertEqual(extra.read_text(encoding="utf-8"), "preserve")
        self.assertEqual((managed / "README.md").read_bytes(), readme)

    def test_ci_creates_metadata_parent_before_shell_redirection(self) -> None:
        workflow = (self.repo_plugin_root.parent.parent / ".github/workflows/sync-plugin.yml").read_text(encoding="utf-8")
        block = workflow.split("- name: Validate Both Environment Builds", 1)[1].split("- name:", 1)[0]
        self.assertLess(block.index("mkdir -p /tmp/zyx-plugin-validate"), block.index("> /tmp/zyx-plugin-validate/staging-meta.json"))

    def test_build_rejects_reparse_ancestors_before_resolving_output(self) -> None:
        parent = self.temp_dir / "linked-parent"
        original_check = ce.is_symlink_or_reparse
        with mock.patch.object(ce, "is_symlink_or_reparse", side_effect=lambda p: p == parent or original_check(p)):
            with self.assertRaisesRegex(ValueError, "symlink or reparse output path"):
                ce.configure_plugin(self.source_copy, "staging", output_dir=parent / "build")
        self.assertFalse(parent.exists())

    def test_both_environments_build_deterministically_and_idempotently(self) -> None:
        for env_name in ("staging", "production"):
            out_a = self.temp_dir / f"build-{env_name}-a"
            out_b = self.temp_dir / f"build-{env_name}-b"
            summary_a = ce.configure_plugin(self.source_copy, env_name, output_dir=out_a)
            summary_b = ce.configure_plugin(self.source_copy, env_name, output_dir=out_b)
            self.assertEqual(summary_a["payloadHash"], summary_b["payloadHash"])
            self.assertEqual(summary_a["version"], "0.5.0")
            self.assertEqual(summary_a["bootstrapProtocol"], 1)
            for skill in ce.EXPECTED_SKILLS:
                content = (out_a / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn('"pluginVersion": "0.5.0"', content)
                self.assertNotIn('"pluginVersion": "0.4.1"', content)

            cfg = ce.ENVIRONMENTS[env_name]
            mcp_json = ce.read_json(out_a / ".mcp.json")
            self.assertEqual(
                mcp_json,
                {"mcpServers": {cfg["server_id"]: {"type": "http", "url": cfg["endpoint"]}}},
            )
            ag_json = ce.read_json(out_a / "mcp_config.json")
            self.assertEqual(
                ag_json,
                {"mcpServers": {cfg["server_id"]: {"serverUrl": cfg["endpoint"]}}},
            )
            claude_desktop = ce.read_json(out_a / "claude-desktop-config.example.json")
            self.assertEqual(
                claude_desktop,
                {"mcpServers": {cfg["server_id"]: {"type": "streamable-http", "url": cfg["endpoint"]}}},
            )

    def test_refuses_in_place_overwrite_of_live_repo_source_without_output_dir(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            ce.configure_plugin(self.repo_plugin_root, "staging")
        self.assertIn("Refusing to mutate repository source plugin directory", str(ctx.exception))

    def test_packaging_rejects_zip_env_references_and_unknown_files(self) -> None:
        bad_zip = self.source_copy / "skills" / "rogue.zip"
        bad_zip.write_bytes(b"PK\x03\x04")
        with self.assertRaises(ValueError) as ctx:
            ce.inspect_source_tree(self.source_copy)
        self.assertIn("Disallowed archive or secret file", str(ctx.exception))
        bad_zip.unlink()

        bad_env = self.source_copy / ".env.local"
        bad_env.write_text("SECRET=123\n", encoding="utf-8")
        with self.assertRaises(ValueError) as ctx:
            ce.inspect_source_tree(self.source_copy)
        self.assertIn("Disallowed archive or secret file", str(ctx.exception))
        bad_env.unlink()

        bad_ref_dir = self.source_copy / "skills" / "zyx-product-bundle-mcp" / "references"
        bad_ref_dir.mkdir(parents=True, exist_ok=True)
        (bad_ref_dir / "workflow.md").write_text("# Old local ref\n", encoding="utf-8")
        with self.assertRaises(ValueError) as ctx:
            ce.inspect_source_tree(self.source_copy)
        self.assertIn("Disallowed directory", str(ctx.exception))
        shutil.rmtree(bad_ref_dir)

        unknown_file = self.source_copy / "unexpected.txt"
        unknown_file.write_text("stray", encoding="utf-8")
        with self.assertRaises(ValueError) as ctx:
            ce.inspect_source_tree(self.source_copy)
        self.assertIn("Disallowed file outside package allowlist", str(ctx.exception))
        unknown_file.unlink()

    def test_verify_release_progression_handles_noop_collision_regression_and_advance(self) -> None:
        baseline = self.temp_dir / "baseline"
        candidate = self.temp_dir / "candidate"
        ce.configure_plugin(self.source_copy, "staging", output_dir=baseline)
        ce.configure_plugin(self.source_copy, "staging", output_dir=candidate)

        noop_res = ce.verify_release_progression(candidate, baseline)
        self.assertTrue(noop_res["ok"])
        self.assertEqual(noop_res["status"], "noop")

        skill_path = candidate / "skills/zyx-blog-mcp/SKILL.md"
        skill_path.write_text(skill_path.read_text(encoding="utf-8") + "\nUpdated blog guidance.\n", encoding="utf-8")
        collision_res = ce.verify_release_progression(candidate, baseline)
        self.assertFalse(collision_res["ok"])
        self.assertEqual(collision_res["status"], "version_collision")

        for rel in ("release.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"):
            data = ce.read_json(candidate / rel)
            data["version"] = "0.6.0"
            ce.write_json(candidate / rel, data)
        advance_res = ce.verify_release_progression(candidate, baseline)
        self.assertTrue(advance_res["ok"])
        self.assertEqual(advance_res["status"], "advance")

        for rel in ("release.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"):
            data = ce.read_json(candidate / rel)
            data["version"] = "0.1.9"
            ce.write_json(candidate / rel, data)
        reg_res = ce.verify_release_progression(candidate, baseline)
        self.assertFalse(reg_res["ok"])
        self.assertEqual(reg_res["status"], "version_regression")

    def test_doctor_redacts_secrets_and_detects_healthy_legacy_and_drift(self) -> None:
        ag_plugins = self.temp_dir / "ag-plugins"
        ag_staging_dir = ag_plugins / "zyx-authoring-mcp-staging"
        ce.configure_plugin(self.source_copy, "staging", output_dir=ag_staging_dir)

        ag_mcp_cfg = self.temp_dir / "mcp_config.json"
        ce.write_json(
            ag_mcp_cfg,
            {
                "mcpServers": {
                    "zyx-authoring-staging": {
                        "serverUrl": "https://user:supersecret@staging.zyxacademy.com/api/mcp/authoring?token=secret123#frag"
                    },
                    "other-tool": {
                        "serverUrl": "https://example.com/mcp",
                        "headers": {"Authorization": "Bearer secret-jwt-token-999"},
                    },
                }
            },
        )

        report = ce.run_doctor(
            self.source_copy,
            ["staging"],
            antigravity_dir=ag_plugins,
            antigravity_mcp_config=ag_mcp_cfg,
        )
        serialized = json.dumps(report)
        self.assertNotIn("supersecret", serialized)
        self.assertNotIn("secret123", serialized)
        self.assertNotIn("secret-jwt-token-999", serialized)
        self.assertTrue(report["ok"])
        self.assertEqual(report["reports"][0]["status"], "healthy")

        ce.write_json(
            ag_mcp_cfg,
            {"mcpServers": {"zyx-authoring": {"serverUrl": "https://staging.zyxacademy.com/api/mcp/authoring"}}},
        )
        legacy_report = ce.run_doctor(
            self.source_copy,
            ["staging"],
            antigravity_dir=ag_plugins,
            antigravity_mcp_config=ag_mcp_cfg,
        )
        self.assertFalse(legacy_report["ok"])
        self.assertEqual(legacy_report["reports"][0]["status"], "legacy_server_id")

    def test_sync_default_builds_only_to_artifacts_and_preserves_non_zyx_config(self) -> None:
        artifacts_root = self.temp_dir / "artifacts"
        managed_target = self.temp_dir / "managed-plugin"
        host_cfg = self.temp_dir / "mcp_config.json"
        ce.write_json(
            host_cfg,
            {"mcpServers": {"github-mcp": {"serverUrl": "https://mcp.github.com/sse"}}},
        )

        res = ce.run_sync(
            self.source_copy,
            "staging",
            artifacts_root=artifacts_root,
            managed_target_dir=managed_target,
            host_config_path=host_cfg,
        )
        self.assertTrue((Path(res["artifactDir"]) / "release.json").is_file())
        self.assertTrue((managed_target / ce.OWNERSHIP_MARKER_FILENAME).is_file())

        updated_cfg = ce.read_json(host_cfg)
        self.assertIn("github-mcp", updated_cfg["mcpServers"])
        self.assertIn("zyx-authoring-staging", updated_cfg["mcpServers"])

    def test_sync_rejects_unmanaged_non_empty_target_and_host_cache_paths(self) -> None:
        artifacts_root = self.temp_dir / "artifacts"
        unmanaged = self.temp_dir / "unmanaged"
        unmanaged.mkdir(parents=True)
        (unmanaged / "user-file.txt").write_text("keep me", encoding="utf-8")

        with self.assertRaises(ValueError) as ctx:
            ce.run_sync(
                self.source_copy,
                "staging",
                artifacts_root=artifacts_root,
                managed_target_dir=unmanaged,
            )
        self.assertIn("lacks ownership marker", str(ctx.exception))
        self.assertTrue((unmanaged / "user-file.txt").is_file())

        fake_cache = self.temp_dir / ".codex" / "plugins" / "cache" / "zyx-authoring-mcp-staging"
        with self.assertRaises(ValueError) as ctx2:
            ce.run_sync(
                self.source_copy,
                "staging",
                artifacts_root=artifacts_root,
                managed_target_dir=fake_cache,
            )
        self.assertIn("Refusing to mutate internal host plugin cache", str(ctx2.exception))

    def test_sync_restores_backup_when_final_swap_fails(self) -> None:
        artifacts_root = self.temp_dir / "artifacts"
        managed = self.temp_dir / "managed-rollback"
        ce.run_sync(
            self.source_copy,
            "staging",
            artifacts_root=artifacts_root,
            managed_target_dir=managed,
        )
        sentinel = managed / "README.md"
        original_readme = sentinel.read_text(encoding="utf-8")

        real_replace = os.replace
        call_count = {"n": 0}

        def failing_second_replace(src: os.PathLike[str] | str, dst: os.PathLike[str] | str) -> None:
            call_count["n"] += 1
            if call_count["n"] == 2:
                raise OSError("Simulated rename failure")
            real_replace(src, dst)

        with mock.patch("os.replace", side_effect=failing_second_replace):
            with self.assertRaises(RuntimeError):
                ce.run_sync(
                    self.source_copy,
                    "production",
                    artifacts_root=artifacts_root,
                    managed_target_dir=managed,
                )

        self.assertTrue(managed.exists())
        self.assertEqual((managed / "README.md").read_text(encoding="utf-8"), original_readme)


if __name__ == "__main__":
    unittest.main()

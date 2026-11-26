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
        self.assertEqual(release["version"], "0.5.6")
        self.assertEqual(release["bootstrapProtocol"], 1)
        self.assertEqual(release["minCompatibleVersion"], "0.2.0")
        server_source = (self.repo_plugin_root.parent.parent / "lib/authoring/mcp-playbook.ts").read_text(encoding="utf-8")
        self.assertRegex(server_source, rf'RECOMMENDED_PLUGIN_VERSION\s*=\s*["\']{re.escape(release["version"])}["\']')

        for env_name in ("staging", "production"):
            with self.subTest(environment=env_name):
                target = self.temp_dir / f"inventory-{env_name}"
                summary = ce.configure_plugin(self.source_copy, env_name, output_dir=target)
                self.assertEqual(set(summary["fileHashes"]), ce.allowed_package_files(ce.rendered_skill_ids(env_name)))
                self.assertEqual({entry.name for entry in (target / "skills").iterdir()}, set(ce.rendered_skill_ids(env_name)))
                self.assertEqual(summary["skills"], list(ce.rendered_skill_ids(env_name)))
                self.assertEqual(summary["canonicalSkills"], list(ce.EXPECTED_SKILLS))
                self.assertEqual(summary["skillSuffix"], "-stg" if env_name == "staging" else "")
                self.assertEqual(ce.load_release_metadata(target)["skills"], summary["skills"])
                codex = ce.read_json(target / ".codex-plugin/plugin.json")
                claude = ce.read_json(target / ".claude-plugin/plugin.json")
                self.assertEqual(codex["version"], release["version"])
                self.assertEqual(claude["version"], release["version"])
                self.assertLessEqual(len(codex["interface"]["shortDescription"]), 30)
                for canonical_skill, skill in zip(original + focused, ce.rendered_skill_ids(env_name)):
                    text = (target / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
                    self.assertRegex(text, rf"(?m)^name: {re.escape(skill)}$")
                    if canonical_skill in ce.ADMIN_IDENTITY_SKILLS:
                        self.assertIn("admin.environment", text)
                        self.assertIn("admin.capabilities", text)
                    declared_versions = re.findall(r'(?:"pluginVersion"|pluginVersion):\s*"([^"]+)"', text)
                    self.assertEqual(set(declared_versions), {release["version"]})
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
                    self.assertEqual(fields["display_name"].endswith(" (Staging)"), env_name == "staging")
                    self.assertIn(ce.SKILL_HOST_PROMPT_SUFFIX.format(server_id=ce.ENVIRONMENTS[env_name]["server_id"]), fields["default_prompt"])
                    self.assertIn("`tools/list`", text)
                    self.assertIn("argumen `operation`", text)
                    self.assertIn("`authoring_solution_review_context`", text)
                    for role in ce.BOOTSTRAP_ARGUMENT_RE.findall(text):
                        self.assertIn(role, ce.BOOTSTRAP_ROLE_IDS)
                        self.assertFalse(role.endswith("-stg"))
                    for link in re.findall(r"\]\((\.\./[^)#]+/SKILL\.md)(?:#[^)]*)?\)", text):
                        self.assertTrue((target / "skills" / skill / link).is_file(), link)

    def test_both_environment_packages_export_disjoint_host_skill_ids(self) -> None:
        staging = self.temp_dir / "staging"
        production = self.temp_dir / "production"
        ce.configure_plugin(self.source_copy, "staging", output_dir=staging)
        ce.configure_plugin(self.source_copy, "production", output_dir=production)
        report = ce.verify_environment_coexistence(staging, production)
        self.assertTrue(report["ok"])
        self.assertEqual(report["skillCount"], 24)
        self.assertEqual(set(report["staging"]), {skill + "-stg" for skill in report["production"]})
        self.assertFalse(set(report["staging"]) & set(report["production"]))
        self.assertEqual(set(report["production"]), set(ce.EXPECTED_SKILLS))

    def test_host_references_change_while_bootstrap_role_arguments_stay_canonical(self) -> None:
        source = '\n'.join([
            'name: zyx-idea-bundle-mcp',
            'Use $zyx-product-bundle-mcp and [revisions](../zyx-content-revisions/SKILL.md).',
            '`skill: "zyx-product-bundle-mcp"` and {"skill": "zyx-idea-bundle-mcp"}',
        ])
        staging = ce.render_skill_references(source, "staging")
        self.assertIn('name: zyx-idea-bundle-mcp-stg', staging)
        self.assertIn('$zyx-product-bundle-mcp-stg ', staging)
        self.assertIn('../zyx-content-revisions-stg/SKILL.md', staging)
        self.assertIn('skill: "zyx-product-bundle-mcp"', staging)
        self.assertIn('"skill": "zyx-idea-bundle-mcp"', staging)
        self.assertEqual(ce.render_skill_references(staging, "staging"), staging)
        self.assertEqual(ce.render_skill_references(staging, "production"), source)

    def test_rebuilding_owned_output_removes_previous_environment_skill_directories(self) -> None:
        output = self.temp_dir / "reused-output"
        first = ce.configure_plugin(self.source_copy, "staging", output_dir=output)
        ce.configure_plugin(self.source_copy, "production", output_dir=output)
        final = ce.configure_plugin(self.source_copy, "staging", output_dir=output)
        self.assertEqual(first["payloadHash"], final["payloadHash"])
        self.assertEqual({path.name for path in (output / "skills").iterdir()}, set(ce.rendered_skill_ids("staging")))

    def test_rendered_package_rejects_wrong_skill_name_reference_prompt_or_bootstrap_role(self) -> None:
        target = self.temp_dir / "invalid-skills"
        ce.configure_plugin(self.source_copy, "staging", output_dir=target)
        idea = target / "skills/zyx-idea-bundle-mcp-stg/SKILL.md"
        original = idea.read_text(encoding="utf-8")
        changes = [
            original.replace('name: zyx-idea-bundle-mcp-stg', 'name: zyx-idea-bundle-mcp'),
            original + '\nUse [source](../zyx-source-pack-mcp/SKILL.md).\n',
            original + '\nUse [unknown](../zyx-missing-stg/SKILL.md).\n',
            original + '\n`skill: "zyx-idea-bundle-mcp-stg"`\n',
        ]
        for changed in changes:
            with self.subTest(change=changed[-90:]):
                idea.write_text(changed, encoding="utf-8")
                with self.assertRaises(ValueError):
                    ce.validate_rendered_package(target, "staging")
        idea.write_text(original, encoding="utf-8")
        host = target / "skills/zyx-idea-bundle-mcp-stg/agents/openai.yaml"
        host.write_text(host.read_text(encoding="utf-8").replace('$zyx-idea-bundle-mcp-stg', '$zyx-idea-bundle-mcp'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "must invoke its rendered skill name"):
            ce.validate_rendered_package(target, "staging")

    def test_short_host_ids_leave_room_for_all_portable_tool_names(self) -> None:
        for environment, config in ce.ENVIRONMENTS.items():
            with self.subTest(environment=environment):
                ce.validate_host_namespace(config)
                prefix = f"mcp_{config['plugin_id']}_{config['server_id']}_"
                longest = prefix + ("a" * ce.PUBLIC_TOOL_NAME_MAX_LENGTH)
                self.assertRegex(longest, r"^[a-zA-Z0-9_-]{1,64}$")
                old_config = {
                    **config,
                    "plugin_id": ce.LEGACY_PLUGIN_IDS[environment],
                    "server_id": ce.LEGACY_ENVIRONMENT_SERVER_IDS[environment],
                }
                with self.assertRaisesRegex(ValueError, "host tool-name budget"):
                    ce.validate_host_namespace(old_config)

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
                path = target / "skills" / (skill + "-stg") / "SKILL.md"
                saved = path.read_text(encoding="utf-8")
                path.write_text(saved.replace("admin.environment", "admin.identity_removed"), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "must require admin.environment"):
                    ce.validate_rendered_package(target, "staging")
                path.write_text(saved, encoding="utf-8")

        revision_path = target / "skills/zyx-content-revisions-stg/SKILL.md"
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
            self.assertEqual(summary_a["version"], "0.5.6")
            self.assertEqual(summary_a["bootstrapProtocol"], 1)
            for skill in ce.rendered_skill_ids(env_name):
                content = (out_a / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
                declared_versions = re.findall(r'(?:"pluginVersion"|pluginVersion):\s*"([^"]+)"', content)
                self.assertEqual(set(declared_versions), {"0.5.6"})
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
            # Regenerating and switching environments must not duplicate or retain
            # an old connection guard in any of the 12 host prompts.
            repeat = ce.configure_plugin(out_a, env_name)
            self.assertEqual(repeat["payloadHash"], summary_a["payloadHash"])
            other = "production" if env_name == "staging" else "staging"
            ce.configure_plugin(out_a, other)
            round_trip = ce.configure_plugin(out_a, env_name)
            self.assertEqual(round_trip["payloadHash"], summary_a["payloadHash"])

    def test_refuses_in_place_overwrite_of_live_repo_source_without_output_dir(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            ce.configure_plugin(self.repo_plugin_root, "staging")
        self.assertIn("Refusing to mutate repository source plugin directory", str(ctx.exception))

    def test_version_bump_updates_json_and_prose_bootstrap_literals_for_every_skill(self) -> None:
        release = ce.load_release_metadata(self.source_copy)
        release["version"] = "0.5.7"
        ce.write_json(self.source_copy / "release.json", release)
        target = self.temp_dir / "next-version"
        ce.configure_plugin(self.source_copy, "staging", output_dir=target)
        for skill in ce.rendered_skill_ids("staging"):
            text = (target / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
            versions = re.findall(r'(?:"pluginVersion"|pluginVersion):\s*"([^"]+)"', text)
            self.assertEqual(set(versions), {"0.5.7"}, skill)

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

        skill_path = candidate / "skills/zyx-blog-mcp-stg/SKILL.md"
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

    def test_release_progression_accepts_the_previous_unsuffixed_staging_inventory(self) -> None:
        baseline = self.temp_dir / "legacy-staging-release"
        ce.copy_allowlisted_tree(self.source_copy, baseline)
        for relative in ("release.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"):
            value = ce.read_json(baseline / relative)
            value["version"] = "0.5.3"
            ce.write_json(baseline / relative, value)
        candidate = self.temp_dir / "new-staging-release"
        ce.configure_plugin(self.source_copy, "staging", output_dir=candidate)
        result = ce.verify_release_progression(candidate, baseline)
        self.assertEqual(result["status"], "advance")
        self.assertEqual(result["baselineVersion"], "0.5.3")
        self.assertTrue(result["baselinePayloadHash"])

    def test_doctor_redacts_secrets_and_detects_healthy_legacy_and_drift(self) -> None:
        ag_plugins = self.temp_dir / "ag-plugins"
        ag_staging_dir = ag_plugins / "zyx-stg"
        ce.configure_plugin(self.source_copy, "staging", output_dir=ag_staging_dir)

        ag_mcp_cfg = self.temp_dir / "mcp_config.json"
        ce.write_json(
            ag_mcp_cfg,
            {
                "mcpServers": {
                    "zyx-stg": {
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

    def test_doctor_finds_long_id_install_and_sync_leaves_it_untouched(self) -> None:
        plugins_root = self.temp_dir / "old-plugins"
        old_dir = plugins_root / ce.LEGACY_PLUGIN_IDS["staging"]
        ce.configure_plugin(self.source_copy, "staging", output_dir=old_dir)
        old_config = {"mcpServers": {
            ce.LEGACY_ENVIRONMENT_SERVER_IDS["staging"]: {
                "serverUrl": ce.ENVIRONMENTS["staging"]["endpoint"],
            },
        }}
        ce.write_json(old_dir / ".mcp.json", old_config)
        config_path = self.temp_dir / "mcp_config.json"
        ce.write_json(config_path, old_config)
        before = config_path.read_bytes()
        report = ce.run_doctor(self.source_copy, ["staging"], antigravity_dir=plugins_root, antigravity_mcp_config=config_path)
        self.assertFalse(report["ok"])
        self.assertEqual(report["reports"][0]["path"], str(old_dir))
        self.assertEqual(report["reports"][0]["status"], "legacy_server_id")
        self.assertEqual(config_path.read_bytes(), before)
        with self.assertRaisesRegex(ValueError, "migrate the legacy entry explicitly"):
            ce.update_host_mcp_config_file(config_path, "staging")
        self.assertEqual(config_path.read_bytes(), before)

    def test_sync_migrates_only_owned_legacy_staging_skill_files(self) -> None:
        plugins = self.temp_dir / "installed"
        staging = plugins / "zyx-stg"
        production = plugins / "zyx-prd"
        # The canonical publishing source still models the old unsuffixed layout.
        ce.copy_allowlisted_tree(self.source_copy, staging)
        production_before = ce.configure_plugin(self.source_copy, "production", output_dir=production)
        self.assertTrue((staging / "skills/zyx-blog-mcp/SKILL.md").is_file())
        doctor = ce.inspect_installed_plugin_dir(staging, self.source_copy, "staging")
        self.assertEqual(doctor["status"], "drift")
        self.assertTrue(any("legacy skill directories" in issue for issue in doctor["issues"]))
        ce.run_sync(self.source_copy, "staging", self.temp_dir / "artifacts", managed_target_dir=staging)
        self.assertFalse((staging / "skills/zyx-blog-mcp").exists())
        self.assertEqual({path.name for path in (staging / "skills").iterdir()}, set(ce.rendered_skill_ids("staging")))
        self.assertEqual(ce.inspect_installed_plugin_dir(staging, self.source_copy, "staging")["status"], "healthy")
        self.assertEqual(ce.validate_rendered_package(production, "production")["payloadHash"], production_before["payloadHash"])

    def test_sync_preserves_another_environment_and_unknown_user_files(self) -> None:
        target = self.temp_dir / "production-install"
        production = ce.run_sync(self.source_copy, "production", self.temp_dir / "artifacts", managed_target_dir=target)
        with self.assertRaisesRegex(ValueError, "another environment"):
            ce.run_sync(self.source_copy, "staging", self.temp_dir / "artifacts", managed_target_dir=target)
        self.assertEqual(ce.validate_rendered_package(target, "production")["payloadHash"], production["payloadHash"])
        user_file = target / "notes.txt"
        user_file.write_text("keep this", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "outside package allowlist"):
            ce.run_sync(self.source_copy, "production", self.temp_dir / "artifacts", managed_target_dir=target)
        self.assertEqual(user_file.read_text(encoding="utf-8"), "keep this")
        user_file.unlink()
        nested_file = target / "tests/user-notes.txt"
        nested_file.parent.mkdir()
        nested_file.write_text("also keep", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "outside package allowlist"):
            ce.run_sync(self.source_copy, "production", self.temp_dir / "artifacts", managed_target_dir=target)
        self.assertEqual(nested_file.read_text(encoding="utf-8"), "also keep")

    def test_staging_sync_preserves_production_connection_during_id_migration(self) -> None:
        config_path = self.temp_dir / "mcp_config.json"
        production = {"serverUrl": ce.ENVIRONMENTS["production"]["endpoint"]}
        ce.write_json(config_path, {"mcpServers": {"zyx-authoring-production": production}})
        ce.update_host_mcp_config_file(config_path, "staging")
        servers = ce.read_json(config_path)["mcpServers"]
        self.assertEqual(servers["zyx-authoring-production"], production)
        self.assertEqual(servers["zyx-stg"], {"serverUrl": ce.ENVIRONMENTS["staging"]["endpoint"]})
        staging = ce.inspect_mcp_json_file(config_path, "zyx-stg", ce.ENVIRONMENTS["staging"]["endpoint"])
        production_report = ce.inspect_mcp_json_file(config_path, "zyx-prd", ce.ENVIRONMENTS["production"]["endpoint"])
        self.assertEqual(staging["status"], "healthy")
        self.assertEqual(production_report["status"], "legacy_server_id")

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
        self.assertIn("zyx-stg", updated_cfg["mcpServers"])

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

        fake_cache = self.temp_dir / ".codex" / "plugins" / "cache" / "zyx-stg"
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
                    "staging",
                    artifacts_root=artifacts_root,
                    managed_target_dir=managed,
                )

        self.assertTrue(managed.exists())
        self.assertEqual((managed / "README.md").read_text(encoding="utf-8"), original_readme)


if __name__ == "__main__":
    unittest.main()

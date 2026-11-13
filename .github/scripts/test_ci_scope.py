"""Exercise the real planner with repository and before/after dependency graphs."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ci_plan', ROOT / 'scripts/ci/plan.py')
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class ScopeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.head = ci.Snapshot()

    def plan(self, *paths):
        return ci.plan(paths, self.head)

    def test_ordinary_frontend_does_not_run_worker_or_authoring(self):
        result = self.plan('components/landing/hero.tsx')
        self.assertTrue(result['web'])
        self.assertTrue(result['typecheck'])
        for key in ['worker', 'v4', 'authoring', 'schedule', 'plugin']:
            self.assertFalse(result[key], key)

    def test_fingerprinted_css_requires_release_but_not_worker_import_check(self):
        result = self.plan('app/globals.css')
        self.assertTrue(result['web'])
        self.assertTrue(result['v4'])
        self.assertFalse(result['worker'])
        self.assertFalse(result['typecheck'])

    def test_background_entry_does_not_build_web(self):
        result = self.plan('workers/deno-background/main.ts')
        self.assertTrue(result['worker'])
        for key in ['web', 'v4', 'typecheck', 'test_typecheck', 'authoring', 'schedule']:
            self.assertFalse(result[key], key)

    def test_new_worker_and_shared_job_are_worker_inputs(self):
        for path in ['workers/deno-background/new.ts', 'workers/neon-background/new.ts', 'scripts/neon/build-worker.mjs', 'jobs/new.ts']:
            self.assertTrue(self.plan(path)['worker'])

    def test_neon_deployment_workflow_selects_worker_validation(self):
        result = self.plan('.github/workflows/deploy-neon-worker.yml')
        self.assertTrue(result['worker'])
        self.assertTrue(result['ci'])

    def test_other_worker_is_not_a_web_or_deno_background_change(self):
        result = self.plan('workers/zyra-control-plane/index.ts')
        for key in ['web', 'worker', 'v4', 'typecheck']:
            self.assertFalse(result[key], key)

    def test_other_worker_gets_its_own_compiler(self):
        result = self.plan(next(iter(sorted(self.head.under('workers/zyra-control-plane/src/')))))
        self.assertIn('workers/zyra-control-plane/tsconfig.json', result['worker_projects'])
        self.assertFalse(result['web'])
        self.assertFalse(result['worker'])

    def test_web_only_prompt_does_not_select_deno(self):
        result = self.plan('prompts/tutor.ts')
        self.assertFalse(result['worker'])
        self.assertFalse(result['v4'])

    def test_structured_config_selects_its_compiler_without_deployment(self):
        result = self.plan('tsconfig.structured-articles.json')
        self.assertTrue(result['structured_typecheck'])
        for key in ['web', 'worker', 'v4', 'authoring', 'schedule', 'typecheck', 'test_typecheck']:
            self.assertFalse(result[key], key)

    def test_structured_source_selects_its_compiler(self):
        self.assertTrue(self.plan('lib/articles/legacy-structure.ts')['structured_typecheck'])

    def test_schedule_audit_dependency_is_not_missed(self):
        self.assertTrue(self.plan('lib/schedule/tutor-audit.ts')['schedule'])

    def test_suite_source_dependencies_are_followed(self):
        paths = ci.scope_paths(self.head)
        self.assertIn('db/schema.ts', paths['schedule'])
        self.assertIn('lib/auth/peran.ts', paths['schedule'])

    def test_plugin_only_checks_distribution(self):
        result = self.plan('plugins/zyx-authoring-mcp/plugin.json')
        self.assertTrue(result['plugin'])
        self.assertFalse(result['web'])
        self.assertFalse(result['worker'])
        self.assertFalse(result['authoring'])

    def test_backend_change_does_not_validate_plugin_distribution(self):
        self.assertFalse(self.plan('lib/authoring/mcp-server.ts')['plugin'])

    def test_docs_keep_ops_knowledge_current_without_compiler_checks(self):
        result = self.plan('docs/features.md')
        self.assertTrue(result['web'])
        self.assertFalse(result['worker'])
        self.assertFalse(result['typecheck'])

    def test_plans_and_android_do_not_build_application(self):
        for path in ['plans/example.md', 'android/app/build.gradle']:
            self.assertFalse(any(self.plan(path)[key] for key in ci.SCOPES))

    def test_dependency_and_planner_changes_fail_conservatively(self):
        for path in ['bun.lock', 'scripts/ci/plan.py', '.github/workflows/ci.yml']:
            self.assertTrue(all(self.plan(path)[key] for key in ci.SCOPES), path)

    def test_server_only_preload_revalidates_the_contract_context(self):
        result = self.plan('tests/helpers/server-only-preload.ts')
        self.assertEqual(result['tests'], self.plan('tests/helpers/postgres-preload.ts')['tests'])
        self.assertIn('tests/contracts/cp2-publication-integration.test.ts', result['tests'])
        self.assertIn('tests/contracts/product-v4-browser-runner.test.ts', result['tests'])
        self.assertTrue(result['authoring'])
        self.assertTrue(result['schedule'])

    def test_changed_test_is_selected_without_deployment(self):
        path = 'tests/contracts/group-name-policy.test.ts'
        result = self.plan(path)
        self.assertTrue(result['schedule'])
        self.assertTrue(result['test_typecheck'])
        self.assertFalse(result['web'])
        self.assertFalse(result['worker'])

    def test_mixed_changes_select_union(self):
        result = self.plan('components/landing/hero.tsx', 'workers/deno-background/main.ts')
        self.assertTrue(result['web'])
        self.assertTrue(result['worker'])

    def test_legacy_repair_cannot_restore_duplicate_automation(self):
        workflow = (ROOT / '.github/workflows/pr36-review-fixes.yml').read_text()
        self.assertNotIn('  push:', workflow)
        repair = (ROOT / '.github/scripts/pr36_review_fixes.py').read_text()
        self.assertNotIn('schedule-domain-validation.yml', repair)

    def test_workflow_change_selects_own_surface_only(self):
        result = self.plan('.github/workflows/sync-plugin.yml')
        self.assertTrue(result['ci'])
        self.assertTrue(result['plugin'])
        self.assertFalse(result['web'])
        self.assertFalse(result['worker'])

    def test_compiler_change_runs_typecheck(self):
        self.assertTrue(self.plan('tsconfig.json')['typecheck'])
        self.assertTrue(self.plan('tsconfig.test.json')['test_typecheck'])

    def test_deleted_file_is_not_sent_to_eslint(self):
        self.assertEqual(self.plan('components/does-not-exist.tsx')['lint_files'], [])


class HistoryTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'CI test')
        self.git('config', 'user.email', 'ci@example.invalid')
        self.write('lib/compute/product-v4-runtime-binding.ts', 'export const PRODUCT_V4_RUNTIME_FILES = [] as const;')

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args):
        return ci.git(*args, root=self.root).decode().strip()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)

    def snapshot(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')
        return ci.Snapshot(self.git('rev-parse', 'HEAD'), self.root)

    def test_transitive_new_import_and_cycle(self):
        self.write('workers/deno-background/main.ts', 'import "@/shared/a";')
        self.write('shared/a.ts', 'export * from "./b.js";')
        self.write('shared/b.ts', 'import "./a";')
        head = self.snapshot()
        self.assertTrue(ci.plan(['shared/b.ts'], head)['worker'])

    def test_transitive_prompt_is_still_a_worker_dependency(self):
        self.write('workers/deno-background/main.ts', 'import "@/shared/helper";')
        self.write('shared/helper.ts', 'import "@/prompts/worker";')
        self.write('prompts/worker.ts', 'export const prompt = "worker";')
        self.write('prompts/web.ts', 'export const prompt = "web";')
        head = self.snapshot()
        self.assertTrue(ci.plan(['prompts/worker.ts'], head)['worker'])
        self.assertFalse(ci.plan(['prompts/web.ts'], head)['worker'])

    def test_dynamic_import_between_exports_is_not_swallowed(self):
        self.write('workers/deno-background/main.ts', 'export const value = 1; const lazy = import("@/shared/lazy"); export { other } from "@/shared/other";')
        self.write('shared/lazy.ts', 'export const value = 1;')
        self.write('shared/other.ts', 'export const other = 2;')
        head = self.snapshot()
        self.assertTrue(ci.plan(['shared/lazy.ts'], head)['worker'])
        self.assertTrue(ci.plan(['shared/other.ts'], head)['worker'])

    def test_removing_import_still_invalidates_previous_consumer(self):
        self.write('workers/deno-background/main.ts', 'import "@/shared/old";')
        self.write('shared/old.ts', 'export const value = 1;')
        base = self.snapshot()
        self.write('workers/deno-background/main.ts', 'export const value = 1;')
        (self.root / 'shared/old.ts').unlink()
        head = self.snapshot()
        result = ci.plan(['shared/old.ts'], head, base)
        self.assertTrue(result['worker'])
        self.assertEqual(result['lint_files'], [])

    def test_test_dependency_change_selects_only_affected_test(self):
        self.write('tests/first.test.ts', 'import "@/shared/helper";')
        self.write('tests/second.test.ts', 'export const value = 2;')
        self.write('shared/helper.ts', 'export const value = 1;')
        head = self.snapshot()
        self.assertEqual(ci.plan(['shared/helper.ts'], head)['tests'], ['tests/first.test.ts'])

    def test_source_inspection_does_not_import_the_inspected_module(self):
        self.write('tests/source.test.ts', 'const path = "components/page.tsx";')
        self.write('components/page.tsx', 'import "@/shared/helper";')
        self.write('shared/helper.ts', 'export const value = 1;')
        head = self.snapshot()
        self.assertEqual(ci.plan(['components/page.tsx'], head)['tests'], ['tests/source.test.ts'])
        self.assertEqual(ci.plan(['shared/helper.ts'], head)['tests'], [])

    def test_deleted_test_does_not_run(self):
        self.write('tests/old.test.ts', 'export const value = 1;')
        base = self.snapshot()
        (self.root / 'tests/old.test.ts').unlink()
        head = self.snapshot()
        self.assertEqual(ci.plan(['tests/old.test.ts'], head, base)['tests'], [])

    def test_renamed_test_keeps_its_old_dependencies(self):
        self.write('tests/old.test.ts', 'import "@/shared/old";')
        self.write('shared/old.ts', 'export const value = 1;')
        base = self.snapshot()
        self.write('tests/new.test.ts', 'export const value = 2;')
        (self.root / 'tests/old.test.ts').unlink()
        head = self.snapshot()
        self.assertEqual(ci.plan(['tests/old.test.ts', 'tests/new.test.ts'], head, base)['tests'], ['tests/new.test.ts'])

    def test_force_selects_all_surfaces(self):
        head = self.snapshot()
        self.assertTrue(all(ci.plan([], head, force=True)[key] for key in ci.SCOPES))

    def test_missing_manifest_fails_instead_of_silently_skipping(self):
        (self.root / 'lib/compute/product-v4-runtime-binding.ts').unlink()
        head = ci.Snapshot(root=self.root)
        with self.assertRaisesRegex(ValueError, 'manifest'):
            ci.plan([], head)


if __name__ == '__main__':
    unittest.main()

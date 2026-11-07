"""Regression coverage for lost pending pushes and stale deployment prevention."""
import importlib.util
from pathlib import Path
import unittest
from urllib.error import URLError
import test_ci_scope as scope_tests
ci = scope_tests.ci

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_base', ROOT / 'scripts/ci/release_base.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseBaseTest(unittest.TestCase):
    def run_data(self, **overrides):
        data = {'head_sha': 'a' * 40, 'event': 'push', 'head_branch': 'staging', 'conclusion': 'success'}
        data.update(overrides)
        return {'workflow_runs': [data]}

    def test_successful_release_is_used_instead_of_previous_push(self):
        calls = []
        def request(path):
            calls.append(path)
            return self.run_data()
        self.assertEqual(release.successful_base('org/repo', 'staging', 'c' * 40, request), 'a' * 40)
        self.assertIn('event=push', calls[0])
        self.assertIn('status=success', calls[0])
        self.assertIn('branch=staging', calls[0])

    def test_no_success_or_unreadable_history_selects_full_validation(self):
        self.assertEqual(release.successful_base('org/repo', 'staging', 'c' * 40, lambda _: {'workflow_runs': []}), '')
        def denied(_):
            raise URLError('denied')
        self.assertEqual(release.successful_base('org/repo', 'staging', 'c' * 40, denied), '')

    def test_invalid_or_untrusted_runs_are_not_used(self):
        for override in [{'conclusion': 'failure'}, {'event': 'pull_request'}, {'head_branch': 'main'},
                         {'head_sha': 'invalid'}, {'head_sha': 'c' * 40}]:
            with self.subTest(override=override):
                self.assertEqual(release.successful_base('org/repo', 'staging', 'c' * 40,
                                                        lambda _: self.run_data(**override)), '')

    def test_superseded_run_cannot_deploy(self):
        with self.assertRaisesRegex(ValueError, 'superseded'):
            release.ensure_current('org/repo', 'staging', 'b' * 40, lambda _: {'object': {'sha': 'c' * 40}})
        release.ensure_current('org/repo', 'staging', 'c' * 40, lambda _: {'object': {'sha': 'c' * 40}})

    def test_workflow_uses_release_base_and_guards_gate(self):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn('steps.release-base.outputs.base', text)
        self.assertNotIn('github.event.before', text)
        gate = text.split('  gate:\n')[1].split('  deploy-web:\n')[0]
        self.assertIn('release_base.py --ensure-current', gate)
        self.assertIn('needs: [impact, gate]', text)


class DroppedPushTest(unittest.TestCase):
    setUp = scope_tests.HistoryTest.setUp
    tearDown = scope_tests.HistoryTest.tearDown
    git = scope_tests.HistoryTest.git
    write = scope_tests.HistoryTest.write
    snapshot = scope_tests.HistoryTest.snapshot
    def test_pending_worker_push_is_included_in_later_frontend_push(self):
        self.write('workers/deno-background/main.ts', 'export const value = 1;')
        base = self.snapshot()
        self.write('workers/deno-background/main.ts', 'export const value = 2;')
        skipped = self.snapshot()
        self.write('components/new.tsx', 'export const view = 1;')
        head = self.snapshot()
        successful = release.successful_base('org/repo', 'staging', head.revision, lambda _: {
            'workflow_runs': [{'head_sha': base.revision, 'event': 'push', 'head_branch': 'staging', 'conclusion': 'success'}]})
        changed = self.git('diff', '--name-only', successful, head.revision).splitlines()
        self.assertTrue(ci.plan(changed, head, base)['worker'])
        before_diff = self.git('diff', '--name-only', skipped.revision, head.revision).splitlines()
        self.assertFalse(ci.plan(before_diff, head, skipped)['worker'])

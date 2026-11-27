"""Verify the iOS launcher transformation preserves fixture data and assertions."""

import json
from hashlib import sha256
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest

import yaml


COMPILER = runpy.run_path(Path(__file__).with_name('compile-ios-fixtures.py'))


class IosFixtureCompilerTest(unittest.TestCase):
    def test_fixture_parameters_are_decoded_once_and_ambiguous_urls_fail(self):
        parse = COMPILER['fixture_params']
        prefix = 'zyx-native-parity://student-fixture?scenario=populated'
        self.assertEqual(parse(prefix + '&theme=light&locale=id&store=disk&path=%2Fcourses%2Fmath%2Fquiz%2Fq%3FattemptId%3Da%252Fb&query_q=A%2BB'), {
            'scenario': 'populated', 'theme': 'light', 'locale': 'id', 'store': 'disk',
            'path': '/courses/math/quiz/q?attemptId=a%2Fb', 'query_q': 'A+B',
        })
        for link in (prefix + '&scenario=other', prefix + '&unexpected=x', prefix + '#x',
                     'zyx-native-parity://gallery/separator', 'https://example.invalid/student-fixture'):
            with self.subTest(link=link), self.assertRaises(ValueError):
                parse(link)

    def test_existing_restart_and_clear_state_are_preserved(self):
        link = {'openLink': 'zyx-native-parity://student-fixture?scenario=populated&store=disk'}
        gallery = {'extendedWaitUntil': {'visible': 'separator', 'timeout': 30000}}
        choice = {'assertVisible': {'id': 'student-assessment-option-1', 'checked': True}}
        screenshot = {'takeScreenshot': 'student-assessment-restored-after-restart'}
        original = [{'launchApp': {'clearState': True}}, gallery, link, choice,
                    'stopApp', 'launchApp', gallery, link, choice, screenshot]
        compile_steps = COMPILER['compile_steps']
        prepared = compile_steps(original, lambda params: '042')
        open_case = COMPILER['open_case']('042')
        wait = COMPILER['wait_for_menu']()
        self.assertEqual(prepared, [original[0], wait, *open_case, choice,
                                   'stopApp', 'launchApp', wait, *open_case, choice, screenshot])
        self.assertEqual(compile_steps([choice, link], lambda params: '042'), [choice,
            {'launchApp': {'stopApp': True, 'clearState': False}}, wait, *open_case])
        with self.assertRaises(ValueError):
            compile_steps([{'runFlow': {'commands': [link]}}], lambda params: '042')

    def test_compiled_suites_preserve_identity_and_probe_an_actual_student_fixture(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            standalone, generated, output = root / 'standalone', root / 'generated', root / 'compiled'
            link = {'openLink': 'zyx-native-parity://student-fixture?scenario=catalog-parity'}
            metadata = {'appId': 'com.zyx.academy.nativeparity', 'name': 'Source identity'}
            steps = [link, {'assertVisible': '4 courses'}, {'takeScreenshot': 'original-capture'}]
            source = [standalone / 'catalog.yaml', generated / 'courses/smoke-001.yaml']
            for path in source:
                COMPILER['write_flow'](path, metadata, steps)
            originals = {path: path.read_bytes() for path in source}
            COMPILER['compile_flows'](standalone, generated, output)
            self.assertEqual(originals, {path: path.read_bytes() for path in source})
            self.assertEqual(json.loads((output / 'cases.json').read_text()), {'001': {'params': {'scenario': 'catalog-parity'}}})
            for path in ('standalone/catalog.yaml', 'generated/courses/smoke-001.yaml'):
                prepared_metadata, prepared_steps = yaml.safe_load_all((output / path).read_text())
                self.assertEqual(prepared_metadata, metadata)
                self.assertEqual(prepared_steps[-2:], steps[-2:])
                self.assertFalse(COMPILER['contains_link'](prepared_steps))
            _, probe = yaml.safe_load_all((output / 'verify-menu.yaml').read_text())
            self.assertEqual(probe[-1]['extendedWaitUntil']['visible'], {'id': 'student-course-ma1101'})
            self.assertIn({'tapOn': {'id': 'student-ios-case-001'}}, probe)
            provenance = json.loads((output / 'provenance.json').read_text())
            self.assertFalse(provenance['externalUrlVerified'])
            self.assertFalse(provenance['warmRouteReentryVerified'])
            self.assertEqual(provenance['midFlowReentry'], 'cold_process_preserving_app_storage')
            self.assertEqual(provenance['caseMap']['sha256'], sha256((output / 'cases.json').read_bytes()).hexdigest())
            for file, flow in zip(source, provenance['flows'], strict=True):
                self.assertEqual(flow['sourceSha256'], sha256(originals[file]).hexdigest())
                self.assertEqual(flow['compiledSha256'], sha256((output / flow['compiled']).read_bytes()).hexdigest())
                self.assertEqual(flow['caseIds'], ['001'])


if __name__ == '__main__':
    unittest.main()

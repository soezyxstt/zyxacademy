"""Test retry selection and provenance without an emulator."""

import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw
from android_maestro import transport_failed
from standalone_evidence import ATTEMPTS_FILE, StandaloneEvidence


def write_report(directory, tests):
    suite = ET.Element('testsuite')
    for name, file, message in tests:
        test = ET.SubElement(suite, 'testcase', name=name, file=file, status='ERROR' if message else 'SUCCESS')
        if message:
            ET.SubElement(test, 'failure').text = message
    ET.ElementTree(suite).write(directory / 'report.xml')


class AndroidStandaloneTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.recover = runpy.run_path(Path(__file__).with_name('retry-android-standalone.py'))['retry']
        self.flows = [self.root / name for name in ('retryable.yaml', 'assertion.yaml')]
        self.transport = 'DeviceServerDiedException: device offline'

    def run_retry(self, retry_tests, *, device_ready=True):
        def attempt(maestro, device, files, directory):
            existing = json.loads((self.root / ATTEMPTS_FILE).read_text())
            self.assertEqual(existing['cases']['retryable']['effective'], '.')
            write_report(directory, retry_tests)
            return 0 if all(test[2] is None for test in retry_tests) else 1

        run = Mock(side_effect=attempt)
        with patch.dict(self.recover.__globals__, {'run_maestro': run, 'ready': Mock(return_value=device_ready)}):
            status = self.recover('maestro', 'device', self.root, self.flows)
        return status, run, json.loads((self.root / ATTEMPTS_FILE).read_text())

    def test_only_transport_retried_and_raw_initial_report_retained(self):
        first = [('retryable', self.flows[0].name, self.transport),
                 ('assertion', self.flows[1].name, 'Assertion is false: Mulai kuis')]
        write_report(self.root, first)
        initial = (self.root / 'report.xml').read_bytes()
        status, run, provenance = self.run_retry([('retryable', self.flows[0].name, None)])
        self.assertEqual(status, 1)
        run.assert_called_once_with('maestro', 'device', [self.flows[0]], self.root / 'standalone-retry/001')
        self.assertEqual((self.root / 'report.xml').read_bytes(), initial)
        self.assertEqual(provenance['cases']['retryable']['effective'], 'standalone-retry/001')
        self.assertNotIn('retry', provenance['cases']['assertion'])
        evidence = StandaloneEvidence(self.root)
        self.assertEqual(evidence.status('retryable'), 'SUCCESS')
        self.assertEqual(evidence.status('assertion'), 'ERROR')

    def test_missing_or_duplicate_retry_does_not_replace_initial(self):
        for retry_tests in ([], [('retryable', self.flows[0].name, None)] * 2):
            with self.subTest(retry_tests=retry_tests):
                write_report(self.root, [('retryable', self.flows[0].name, self.transport), ('assertion', self.flows[1].name, None)])
                status, run, provenance = self.run_retry(retry_tests)
                self.assertEqual(status, 1)
                run.assert_called_once()
                self.assertEqual(provenance['cases']['retryable']['effective'], '.')
                self.assertEqual(provenance['cases']['retryable']['retry']['result'], 'not_recorded')
                self.assertEqual(StandaloneEvidence(self.root).status('retryable'), 'ERROR')
                (self.root / 'standalone-retry/001/report.xml').unlink()
                (self.root / 'standalone-retry/001').rmdir()

    def test_partial_initial_retries_only_known_testcase_and_remains_incomplete(self):
        write_report(self.root, [('retryable', self.flows[0].name, self.transport)])
        status, run, provenance = self.run_retry([('retryable', self.flows[0].name, None)])
        self.assertEqual(status, 1)
        run.assert_called_once()
        self.assertFalse(provenance['initialComplete'])
        evidence = StandaloneEvidence(self.root)
        self.assertEqual(evidence.status('retryable'), 'SUCCESS')
        self.assertEqual(evidence.status('assertion'), 'not_recorded')

    def test_second_transport_failure_stays_failed(self):
        write_report(self.root, [('retryable', self.flows[0].name, self.transport), ('assertion', self.flows[1].name, None)])
        status, run, provenance = self.run_retry([('retryable', self.flows[0].name, self.transport)])
        self.assertEqual(status, 1)
        run.assert_called_once()
        self.assertEqual(provenance['cases']['retryable']['retry']['result'], 'transport_failure')
        self.assertEqual(StandaloneEvidence(self.root).status('retryable'), 'ERROR')

    def test_duplicate_initial_cannot_trigger_retry(self):
        write_report(self.root, [('retryable', self.flows[0].name, self.transport)] * 2)
        status, run, provenance = self.run_retry([])
        self.assertEqual(status, 1)
        self.assertEqual(provenance['cases'], {})
        run.assert_not_called()

    def test_recovers_complete_run_only_when_retry_succeeds(self):
        write_report(self.root, [('retryable', self.flows[0].name, self.transport), ('assertion', self.flows[1].name, None)])
        status, run, provenance = self.run_retry([('retryable', self.flows[0].name, None)])
        self.assertEqual(status, 0)
        run.assert_called_once()
        self.assertTrue(provenance['initialComplete'])
        self.assertEqual(StandaloneEvidence(self.root).status('assertion'), 'SUCCESS')

    def test_unknown_requires_an_unambiguous_transport_log_without_assertion(self):
        log = self.root / 'results/run/retryable/logs/maestro.log'
        log.parent.mkdir(parents=True)
        log.write_text(self.transport)
        self.assertTrue(transport_failed('retryable', 'Unknown error', self.root))
        log.write_text('Assertion is false: Mulai kuis\n' + self.transport)
        self.assertFalse(transport_failed('retryable', 'Unknown error', self.root))
        self.assertFalse(transport_failed('retryable', self.transport, self.root))

    def test_scroll_refuses_to_join_images_from_two_attempts(self):
        testcase = 'Student course long material list fixture'
        retry = self.root / 'standalone-retry/001'
        capture_name = 'student-long-content'
        for directory in (self.root, retry):
            (directory / f'results/run/{testcase}/takeScreenshot').mkdir(parents=True)
        initial_capture = self.root / f'results/run/{testcase}/takeScreenshot/{capture_name}.png'
        retry_capture = retry / f'results/run/{testcase}/takeScreenshot/{capture_name}.png'
        image = Image.new('RGB', (40, 80), 'white')
        ImageDraw.Draw(image).rectangle((12, 22, 20, 30), fill='black')
        image.save(initial_capture)
        image.save(retry_capture.with_name(f'{capture_name}-restored.png'))
        write_report(retry, [(testcase, 'long-content.yaml', None)])
        index = {'version': 1, 'cases': {testcase: {'initial': 'transport_failure', 'effective': 'standalone-retry/001',
            'retry': {'directory': 'standalone-retry/001', 'result': 'passed'}}}}
        (self.root / ATTEMPTS_FILE).write_text(json.dumps(index))
        compare = runpy.run_path(Path(__file__).with_name('check-scroll-restoration.py'))['compare']
        self.assertEqual(compare(self.root)['status'], 'missing')
        image.save(retry_capture)
        self.assertEqual(compare(self.root)['status'], 'pass')


if __name__ == '__main__':
    unittest.main()

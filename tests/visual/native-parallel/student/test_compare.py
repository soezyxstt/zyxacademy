"""Exercise rejection and pixel counting using synthetic Maestro output."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


class MatchedReferenceTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.script = Path(__file__).resolve().with_name('compare.py')
        self.case = 'Student quiz gateway attempt states'
        self.state = 'quiz-gateway-new'
        self.web = self.root / 'web' / 'android'
        self.web.mkdir(parents=True)
        pinned = self.script.parent / 'quiz-gateway' / 'web' / 'android'
        for name in [self.state + '.png', 'quiz-gateway-reference.json']:
            shutil.copyfile(pinned / name, self.web / name)
        self.native = self.root / 'native'
        self.flow = self.native / 'results' / 'unit-test' / self.case
        self.image = self.flow / 'takeScreenshot' / ('student-' + self.state + '.png')
        self.image.parent.mkdir(parents=True)
        shutil.copyfile(self.web / (self.state + '.png'), self.image)
        (self.native / 'report.xml').write_text(f'<testsuite><testcase name="{self.case}" status="SUCCESS"/></testsuite>')
        command = {'command': {'takeScreenshotCommand': {'path': self.image.stem}},
                   'metadata': {'status': 'COMPLETED', 'artifacts': [{'type': 'TAKE_SCREENSHOT', 'path': 'takeScreenshot/' + self.image.name}]}}
        (self.flow / 'commands.json').write_text(json.dumps([command]))

    def compare(self):
        out = self.root / 'comparison'
        process = subprocess.run([sys.executable, str(self.script), '--platform', 'android',
                                  '--web', str(self.web.parent), '--native', str(self.native),
                                  '--output', str(out)], capture_output=True, text=True)
        # Other cases are deliberately absent, so the entire run is incomplete.
        self.assertEqual(process.returncode, 1, process.stderr)
        return next(row for row in json.loads((out / 'comparison.json').read_text()) if row['id'] == self.state)

    def test_counts_changed_pixels_on_the_whole_viewport(self):
        self.assertEqual(self.compare()['status'], 'pass')
        with Image.open(self.image) as source:
            pixels = source.convert('RGB')
        previous = pixels.getpixel((0, 0))
        pixels.putpixel((0, 0), (255 - previous[0], previous[1], previous[2]))
        pixels.save(self.image)
        result = self.compare()
        self.assertEqual((result['status'], result['differing_pixels'], result['bounds']), ('different', 1, [0, 0, 1, 1]))

    def test_refuses_a_capture_without_its_device_trace(self):
        (self.flow / 'commands.json').write_text('[]')
        self.assertEqual(self.compare()['status'], 'not_comparable')

    def test_refuses_a_failed_testcase(self):
        (self.native / 'report.xml').write_text(f'<testsuite><testcase name="{self.case}" status="ERROR"><failure/></testcase></testsuite>')
        self.assertEqual(self.compare()['status'], 'not_comparable')

    def test_refuses_changed_web_inputs(self):
        file = self.web / 'quiz-gateway-reference.json'
        data = json.loads(file.read_text())
        data['states']['new']['assessment']['questionCount'] += 1
        file.write_text(json.dumps(data))
        self.assertEqual(self.compare()['status'], 'not_comparable')

    def test_uses_only_the_selected_retry_junit_and_capture(self):
        retry = self.native / 'standalone-retry' / '001'
        shutil.copytree(self.native / 'results', retry / 'results')
        success = f'<testsuite><testcase name="{self.case}" file="quiz-gateway.yaml" status="SUCCESS"/></testsuite>'
        (retry / 'report.xml').write_text(success)
        failure = f'<testsuite><testcase name="{self.case}" file="quiz-gateway.yaml" status="ERROR"><failure>device offline</failure></testcase></testsuite>'
        (self.native / 'report.xml').write_text(failure)
        index = {'version': 1, 'cases': {self.case: {'flow': 'quiz-gateway.yaml', 'initial': 'transport_failure', 'effective': 'standalone-retry/001',
            'retry': {'directory': 'standalone-retry/001', 'result': 'passed'}}}}
        (self.native / 'standalone-attempts.json').write_text(json.dumps(index))
        result = self.compare()
        self.assertEqual(result['status'], 'pass')
        self.assertEqual(result['native_scenario']['attempt'], 'standalone-retry/001')
        self.assertTrue(Path(result['native']['path']).is_relative_to(retry))
        shutil.copytree(retry / 'results' / 'unit-test', retry / 'results' / 'duplicate')
        self.assertEqual(self.compare()['status'], 'missing')
        shutil.rmtree(retry / 'results' / 'duplicate')
        (retry / 'report.xml').write_text(failure)
        self.assertEqual(self.compare()['status'], 'not_comparable')
        (retry / 'report.xml').write_text(success.replace('quiz-gateway.yaml', 'unrelated.yaml'))
        mismatch = self.compare()
        self.assertEqual(mismatch['status'], 'not_comparable')
        self.assertEqual(mismatch['native_scenario']['status'], 'not_recorded')


if __name__ == '__main__':
    unittest.main()

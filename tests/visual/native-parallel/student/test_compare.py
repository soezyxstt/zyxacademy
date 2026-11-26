"""Exercise rejection and pixel counting using synthetic Maestro output."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

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

    def test_requires_current_source_bytes_and_this_captures_state_assertion(self):
        repo = self.root / 'source'
        scripts = repo / 'tests/visual/native-parallel/student'
        scripts.mkdir(parents=True)
        for name in ('compare.py', 'standalone_evidence.py', 'signed-assessment-review.json'):
            shutil.copyfile(self.script.parent / name, scripts / name)
        self.script = scripts / 'compare.py'
        source = repo / 'fixture-input.json'
        source.write_text('fixture bytes')
        reference = json.loads((self.web / 'quiz-gateway-reference.json').read_text())
        reference['sourceDigests'] = {source.name: hashlib.sha256(source.read_bytes()).hexdigest()}
        reference['states']['new']['nativeMarkers'] = [{'id': 'quiz-start', 'selected': False}]
        group = {'states': list(reference['states']), 'testcase': self.case, 'sourcePaths': [source.name]}
        (scripts / 'matched-reference-groups.json').write_text(json.dumps({'quiz-gateway': group}))
        pinned = scripts / 'quiz-gateway/web/android'
        pinned.mkdir(parents=True)
        for directory in (self.web, pinned):
            (directory / 'quiz-gateway-reference.json').write_text(json.dumps(reference))
        trace = self.flow / 'commands.json'
        capture, = json.loads(trace.read_text())
        check = {'command': {'assertConditionCommand': {'condition': {'visible': {'idRegex': 'quiz-start', 'selected': False}}}},
                 'metadata': {'status': 'COMPLETED'}}
        self.assertEqual(self.compare()['status'], 'not_comparable')
        trace.write_text(json.dumps([check, {'command': {'takeScreenshotCommand': {'path': 'prior'}}, 'metadata': {'status': 'COMPLETED'}}, capture]))
        self.assertEqual(self.compare()['status'], 'not_comparable')
        trace.write_text(json.dumps([check, capture]))
        self.assertEqual(self.compare()['status'], 'pass')
        source.write_text('different fixture bytes')
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


class SignedReviewReferenceTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        original = Path(__file__).resolve().parent
        repo = self.root / 'source'
        scripts = repo / 'tests/visual/native-parallel/student'
        scripts.mkdir(parents=True)
        for name in ('compare.py', 'standalone_evidence.py', 'signed-assessment-review.json'):
            shutil.copyfile(original / name, scripts / name)
        (scripts / 'matched-reference-groups.json').write_text('{}')
        self.script = scripts / 'compare.py'
        self.config = json.loads((scripts / 'signed-assessment-review.json').read_text())
        reference = self.config['referencePath']
        shutil.copytree(original / reference, scripts / reference)
        self.web = self.root / 'web' / reference
        shutil.copytree(original / reference, self.web)
        snapshot = 'packages/native-parity/student/assessment/signed-results-responses.json'
        self.snapshot = repo / snapshot
        self.snapshot.parent.mkdir(parents=True)
        shutil.copyfile(original.parents[3] / snapshot, self.snapshot)
        self.native = self.root / 'native'
        testcase = self.config['testcase']
        flow = self.config['flow']
        self.trace = self.native / 'results' / 'unit-test' / testcase / 'commands.json'
        self.trace.parent.mkdir(parents=True)
        (self.native / 'report.xml').write_text(
            f'<testsuite><testcase name="{testcase}" file="{flow}" status="SUCCESS"/></testsuite>'
        )
        (self.native / 'standalone-attempts.json').write_text(json.dumps({
            'version': 1, 'cases': {testcase: {'flow': flow, 'initial': 'passed', 'effective': '.'}},
        }))
        self.commands = []
        self.images = {}
        for state, config in self.config['states'].items():
            path = '/courses/assessment-evidence-mathematics/my-results/' + config['submissionId']
            filename = f"student-{self.config['group']}-{state}.png"
            image = self.trace.parent / 'takeScreenshot' / filename
            image.parent.mkdir(exist_ok=True)
            shutil.copyfile(self.web / 'android' / f'review-{state}.png', image)
            self.images[state] = image
            self.add_command('openLinkCommand', {
                'link': 'zyx-native-parity://student-fixture?scenario=assessment-signed-results&locale=id&theme=light&path=' + quote(path, safe=''),
            })
            for when, selections in (
                ('visible', [{'idRegex': 'student-fixture-id-light'}, *[{'textRegex': text} for text in config['visible']]]),
                ('notVisible', [{'textRegex': text} for text in config['hidden']]),
            ):
                for selector in selections:
                    self.add_command('assertConditionCommand', {'condition': {when: selector}})
            self.add_command('takeScreenshotCommand', {'path': image.stem}, [{'type': 'TAKE_SCREENSHOT', 'path': 'takeScreenshot/' + filename}])

    def add_command(self, name, command, artifacts=()):
        self.commands.append({'command': {name: command}, 'metadata': {'status': 'COMPLETED', 'artifacts': artifacts}})

    def compare(self, platform='android'):
        self.trace.write_text(json.dumps(self.commands))
        out = self.root / 'comparison'
        process = subprocess.run([sys.executable, str(self.script), '--platform', platform,
                                  '--web', str(self.root / 'web'), '--native', str(self.native),
                                  '--output', str(out)], capture_output=True, text=True)
        self.assertEqual(process.returncode, 1, process.stderr)
        prefix = self.config['group'] + '-'
        return {row['id'].removeprefix(prefix): row for row in json.loads((out / 'comparison.json').read_text())
                if row['id'].startswith(prefix)}

    def test_committed_signed_web_inputs_require_no_ios_pairs(self):
        self.assertEqual({state: row['status'] for state, row in self.compare().items()},
                         {'released-quiz': 'pass', 'pending-tryout': 'pass', 'graded-tryout': 'pass'})
        self.assertEqual(self.compare('ios'), {})

    def test_rejects_wrong_route_and_missing_hidden_assertion(self):
        route = next(item for item in self.commands if 'openLinkCommand' in item['command'])
        route['command']['openLinkCommand']['link'] += '-wrong'
        self.commands = [item for item in self.commands
                         if item['command'].get('assertConditionCommand', {}).get('condition', {}).get('notVisible') != {'textRegex': '95%'}]
        rows = self.compare()
        self.assertIn('replay route', rows['released-quiz']['reason'])
        self.assertIn('expected state assertions', rows['pending-tryout']['reason'])
        self.assertEqual(rows['graded-tryout']['status'], 'pass')

    def test_rejects_wrong_extent_and_unpinned_web_bytes(self):
        Image.new('RGB', (380, 819)).save(self.images['released-quiz'])
        web = self.web / 'android' / 'review-pending-tryout.png'
        shutil.copyfile(self.images['graded-tryout'], web)
        rows = self.compare()
        self.assertIn('Image dimensions differ', rows['released-quiz']['reason'])
        self.assertIn('committed server capture', rows['pending-tryout']['reason'])

    def test_rejects_changed_snapshot_or_unfinished_flow(self):
        (self.native / 'report.xml').write_text(
            f'<testsuite><testcase name="{self.config["testcase"]}" file="{self.config["flow"]}" status="ERROR"><failure/></testcase></testsuite>'
        )
        self.assertTrue(all('effective Maestro attempt' in row['reason'] for row in self.compare().values()))
        (self.native / 'report.xml').write_text(
            f'<testsuite><testcase name="{self.config["testcase"]}" file="{self.config["flow"]}" status="SUCCESS"/></testsuite>'
        )
        self.snapshot.write_bytes(self.snapshot.read_bytes() + b'\n')
        self.assertTrue(all('response snapshot differs' in row['reason'] for row in self.compare().values()))


if __name__ == '__main__':
    unittest.main()

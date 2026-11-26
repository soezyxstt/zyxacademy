#!/usr/bin/env python3
"""Report dimensions and compare only reference pairs with identical inputs.

Require the documented input verification for each pair and never resize
screenshots. A skipped pair is not a passing diff.
"""
import argparse
import glob
import hashlib
import json
import sys
from xml.etree import ElementTree
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--platform', required=True, choices=['android', 'ios'])
parser.add_argument('--web', required=True)
parser.add_argument('--native', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
# The catalog reference contains five records; native enrolled shows a dashboard
# with two different fixture records. They are documented together to make the
# input mismatch visible, not as an image comparison.
flashcard_states = ('question', 'review-pending', 'review-failed')
state_groups = json.loads(Path(__file__).with_name('matched-reference-groups.json').read_text())
pairs = [
    *[
        {'id': f'catalog-{state}', 'web': f'**/{args.platform}/catalog-{state}.png',
         'native': f'**/student-catalog-{state}.png', 'verification': 'catalog'}
        for state in ('all', 'tpb', 'pka')
    ],
    *[
        {'id': f'flashcard-{state}', 'web': f'**/{args.platform}/flashcard-{state}.png',
         'native': f'**/student-flashcard-{state}.png', 'verification': 'flashcard'}
        for state in flashcard_states
    ],
    *[
        {'id': f'{group}-{state}', 'web': f'**/{args.platform}/{group}-{state}.png',
         'native': f'**/student-{group}-{state}.png', 'verification': group, 'state': state,
         'dependency': config.get('dependencies', {}).get(state)}
        for group, config in state_groups.items() for state in config['states']
    ],
    {'id': 'catalog-versus-enrolled-dashboard', 'web': '**/catalog-populated.png',
     'native': '**/student-enrolled-dashboard.png',
     'reason': 'Different screen and synthetic course records; cannot compare pixels.'},
    {'id': 'catalog-versus-unenrolled-dashboard', 'web': '**/catalog-populated.png',
     'native': '**/student-unenrolled-dashboard.png',
     'reason': 'Different screen and synthetic course records; cannot compare pixels.'},
]

def locate(root, pattern):
    matches = glob.glob(str(Path(root) / pattern), recursive=True)
    return Path(matches[0]) if len(matches) == 1 else None

def describe(path):
    if not path:
        return None
    with Image.open(path) as im:
        return {'path': str(path), 'width': im.width, 'height': im.height,
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

def native_capture_problem(native, testcase):
    try:
        pieces = native.relative_to(args.native).parts
        if len(pieces) != 5 or pieces[0] != 'results' or pieces[2:4] != (testcase, 'takeScreenshot'):
            return 'The screenshot is outside the expected Maestro testcase.'
        commands = json.loads((native.parents[1] / 'commands.json').read_text())
        relative_image = '/'.join(pieces[-2:])
        for item in commands:
            result = item['metadata']
            if result['status'] == 'FAILED':
                break
            capture = item.get('command', {}).get('takeScreenshotCommand')
            if capture and capture.get('path') == native.stem and result['status'] == 'COMPLETED':
                recorded = {'type': 'TAKE_SCREENSHOT', 'path': relative_image}
                if recorded in result.get('artifacts', []):
                    return None
        return 'The device trace did not record this screenshot after its state assertions.'
    except (KeyError, OSError, ValueError, TypeError):
        return 'Missing or unreadable Maestro screenshot trace.'

def native_scenario_status(testcase):
    try:
        cases = [case for case in ElementTree.parse(Path(args.native) / 'report.xml').iter('testcase')
                 if case.get('name') == testcase]
        if len(cases) == 1:
            if cases[0].find('failure') is not None or cases[0].find('error') is not None:
                return 'ERROR'
            return cases[0].get('status', 'unknown')
    except (ElementTree.ParseError, OSError):
        pass
    return 'not_recorded'

def verify_state(group, state, web, native):
    config = state_groups[group]
    states = config['states']
    testcase = config['testcase'].format(state=state)
    name = f'{group}-reference.json'
    marker = locate(args.web, f'**/{args.platform}/{name}')
    if not marker or marker.parent != web.parent:
        return f'Missing or ambiguous {group} input manifest alongside the web capture.'
    pinned = Path(__file__).parent / group / 'web' / args.platform / name
    viewport, scale = ({'width': 380, 'height': 820}, 1) if args.platform == 'android' else ({'width': 402, 'height': 874}, 3)
    try:
        reference = json.loads(pinned.read_text())
        manifest = json.loads(marker.read_text())
        if reference.get('platform') != args.platform or reference.get('viewport') != viewport or reference.get('deviceScaleFactor') != scale:
            return f'The committed {group} reference has a different target device extent.'
        if not reference.get('theme') or not reference.get('locale') or set(reference['states']) != set(states):
            return f'The committed {group} reference lacks its expected states, locale or theme.'
        # Chromium versions and rasterization can differ between the capture host
        # and CI. All fields describing the input and presentation must agree.
        inputs = {key: value for key, value in reference.items() if key not in ('browser', 'captures')}
        if not reference['states'][state] or any(manifest.get(key) != value for key, value in inputs.items()):
            return f'The {group} capture inputs differ from those linked to the device fixture.'
        root = Path(__file__).resolve().parents[4]
        if 'productFixture' in config:
            sources = {
                config['productFixture']: reference['fixtureSha256'],
                'tests/visual/native-parallel/student/product/seed.ts': reference['seedSha256'],
            }
        elif group == 'calendar':
            sources = dict(reference['sourceDigests'])
            sources.update({f'apps/mobile-native/assets/fonts/{name}.ttf': sha for name, sha in reference['fontDigests'].items()})
        else:
            sources = {}
        for source, expected in sources.items():
            file = (root / source).resolve()
            if not file.is_relative_to(root) or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
                return f'The {group} source differs from the reference: {source}'
        digest = hashlib.sha256(web.read_bytes()).hexdigest()
        if manifest['captures'].get(web.name) != digest:
            return f'The {group} web capture digest differs from the capture manifest.'
        if 'productFixture' in config and reference['captures'].get(web.name) != digest:
            return f'The {group} capture differs from its signed-session product reference.'
        with Image.open(web) as image:
            if image.size != (viewport['width'] * scale, viewport['height'] * scale):
                return f'The {group} web capture dimensions differ from the target extent.'
        if problem := native_capture_problem(native, testcase):
            return problem
        if native_scenario_status(testcase) != 'SUCCESS':
            return f'Maestro did not verify the {group} inputs and visible states.'
    except (AttributeError, KeyError, OSError, ValueError, TypeError, ElementTree.ParseError):
        return f'Unreadable {group} input manifest, image or device report.'
    return None

def verify_flashcard(web):
    marker = locate(args.web, f'**/{args.platform}/flashcard-reference.json')
    if not marker or marker.parent != web.parent:
        return 'Missing manifest for the flashcard capture.'
    viewport, scale = ({'width': 380, 'height': 820}, 1) if args.platform == 'android' else ({'width': 402, 'height': 874}, 3)
    expected = {'platform': args.platform, 'viewport': viewport, 'deviceScaleFactor': scale,
                'scenario': 'flashcard-parity', 'courseId': 'matematika-1', 'courseTitle': 'Kalkulus Dasar', 'grade': 3,
                'rejectionStatus': 422, 'rejection': {'error': 'Review rejected'}, 'locale': 'id', 'theme': 'light',
                'font': 'Inter from native assets', 'motion': 'reduced',
                'webComposition': 'Student application and course navigation with fixture transport'}
    try:
        manifest = json.loads(marker.read_text())
        if any(manifest.get(name) != value for name, value in expected.items()):
            return 'Flashcard input metadata does not match the device flow.'
        if manifest.get('captures', {}).get(web.name) != hashlib.sha256(web.read_bytes()).hexdigest():
            return 'Flashcard capture digest does not match its manifest.'
        with Image.open(web) as image:
            if image.size != (viewport['width'] * scale, viewport['height'] * scale):
                return 'Flashcard capture does not match the target pixel extent.'
    except (ValueError, AttributeError, OSError):
        return 'Unreadable flashcard input manifest or capture.'
    native_report = locate(args.native, 'report.xml')
    if not native_report:
        return 'Missing Maestro report for the flashcard state assertions.'
    try:
        cases = [case for case in ElementTree.parse(native_report).iter('testcase')
                 if case.get('name') == 'Learning flashcard flip and grade']
        if len(cases) != 1 or cases[0].get('status') != 'SUCCESS':
            return 'Maestro did not verify the flashcard question, pending, rejection and retry states.'
    except (ElementTree.ParseError, OSError):
        return 'Unreadable Maestro report for the flashcard captures.'
    return None

def verification_problem(pair, web, native):
    kind = pair.get('verification')
    if kind == 'catalog':
        if not locate(args.web, '**/catalog-input-verified.txt'):
            return 'Catalog input verification marker is missing.'
        return native_capture_problem(native, 'Catalog comparable fixture all TPB and PKA')
    if kind == 'flashcard':
        return verify_flashcard(web) or native_capture_problem(native, 'Learning flashcard flip and grade')
    if kind in state_groups:
        return verify_state(kind, pair['state'], web, native)
    return pair['reason']

report = []
for pair in pairs:
    web, native = locate(args.web, pair['web']), locate(args.native, pair['native'])
    item = {'id': pair['id'], 'platform': args.platform, 'web': describe(web), 'native': describe(native)}
    kind = pair.get('verification')
    testcase = (state_groups[kind]['testcase'].format(state=pair['state']) if kind in state_groups else
                'Catalog comparable fixture all TPB and PKA' if kind == 'catalog' else
                'Learning flashcard flip and grade' if kind == 'flashcard' else None)
    if testcase:
        item['native_scenario'] = {'name': testcase, 'status': native_scenario_status(testcase)}
    if not web or not native:
        item.update(status='missing', reason='One or both capture files are absent or ambiguous.')
    elif reason := verification_problem(pair, web, native):
        item.update(status='not_comparable', reason=reason)
    elif pair.get('dependency'):
        item.update(status='blocked_renderer', reason=pair['dependency'])
    else:
        with Image.open(web) as a, Image.open(native) as b:
            a, b = a.convert('RGB'), b.convert('RGB')
            if a.size != b.size:
                item.update(status='not_comparable', reason='Image dimensions differ; no resizing performed.')
            else:
                diff = ImageChops.difference(a, b)
                bounds = diff.getbbox()
                pixels = sum(pixel != (0, 0, 0) for pixel in diff.getdata())
                max_channel_difference = max(channel[1] for channel in diff.getextrema())
                diff_path = out / (pair['id'] + '-diff.png')
                diff.save(diff_path)
                item.update(status='pass' if not pixels else 'different', differing_pixels=pixels,
                            max_channel_difference=max_channel_difference,
                            bounds=list(bounds) if bounds else None, diff=str(diff_path))
    report.append(item)
(out / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
# An evidence run is incomplete if any intended matched capture is missing,
# unverified, or has incompatible dimensions. A nonzero diff is recorded as
# "different" and is not a parity pass, even though producing the diff succeeded.
if any(item['status'] not in ('pass', 'different', 'blocked_renderer') for pair, item in zip(pairs, report) if pair.get('verification')):
    sys.exit(1)

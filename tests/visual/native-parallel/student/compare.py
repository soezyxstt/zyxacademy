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
        return {'path': str(path), 'width': im.width, 'height': im.height}

def verify_flashcard(web):
    marker = locate(args.web, f'**/{args.platform}/flashcard-reference.json')
    if not marker or marker.parent != web.parent:
        return 'Missing manifest for the flashcard capture.'
    viewport, scale = ({'width': 380, 'height': 820}, 1) if args.platform == 'android' else ({'width': 402, 'height': 874}, 3)
    expected = {'platform': args.platform, 'viewport': viewport, 'deviceScaleFactor': scale,
                'scenario': 'flashcard-parity', 'courseId': 'matematika-1', 'courseTitle': 'Kalkulus Dasar', 'grade': 3,
                'rejectionStatus': 422, 'rejection': {'error': 'Review rejected'}, 'locale': 'id', 'theme': 'light',
                'font': 'Inter from native assets', 'motion': 'reduced'}
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

def verification_problem(pair, web):
    kind = pair.get('verification')
    if kind == 'catalog':
        return None if locate(args.web, '**/catalog-input-verified.txt') else 'Catalog input verification marker is missing.'
    if kind == 'flashcard':
        return verify_flashcard(web)
    return pair['reason']

report = []
for pair in pairs:
    web, native = locate(args.web, pair['web']), locate(args.native, pair['native'])
    item = {'id': pair['id'], 'platform': args.platform, 'web': describe(web), 'native': describe(native)}
    if not web or not native:
        item.update(status='missing', reason='One or both capture files are absent or ambiguous.')
    elif reason := verification_problem(pair, web):
        item.update(status='not_comparable', reason=reason)
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
if any(item['status'] not in ('pass', 'different') for pair, item in zip(pairs, report) if pair.get('verification')):
    sys.exit(1)

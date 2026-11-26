#!/usr/bin/env python3
"""Report dimensions and compare only reference pairs with identical inputs.

The present web fixtures and native fixtures have different records and screens.
Do not mark a pair equivalent until source, state, locale, theme, font, viewport,
and scale are independently verified. A skipped pair is not a passing diff.
"""
import argparse
import glob
import json
import sys
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
pairs = [
    *[
        {'id': f'catalog-{state}', 'web': f'**/{args.platform}/catalog-{state}.png',
         'native': f'**/student-catalog-{state}.png', 'same_input': True,
         'reason': 'Catalog fixture, selected category, locale and theme match. Layout remains subject to comparison.'}
        for state in ('all', 'tpb', 'pka')
    ],
    {'id': 'catalog-versus-enrolled-dashboard', 'web': '**/catalog-populated.png',
     'native': '**/student-enrolled-dashboard.png', 'same_input': False,
     'reason': 'Different screen and synthetic course records; cannot compare pixels.'},
    {'id': 'catalog-versus-unenrolled-dashboard', 'web': '**/catalog-populated.png',
     'native': '**/student-unenrolled-dashboard.png', 'same_input': False,
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

report = []
for pair in pairs:
    web, native = locate(args.web, pair['web']), locate(args.native, pair['native'])
    item = {'id': pair['id'], 'platform': args.platform, 'web': describe(web), 'native': describe(native)}
    if not web or not native:
        item.update(status='missing', reason='One or both capture files are absent or ambiguous.')
    elif pair['same_input'] and not locate(args.web, '**/catalog-input-verified.txt'):
        item.update(status='not_comparable', reason='Catalog input verification marker is missing.')
    elif not pair['same_input']:
        item.update(status='not_comparable', reason=pair['reason'])
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
if any(item['status'] not in ('pass', 'different') for item in report[:3]):
    sys.exit(1)

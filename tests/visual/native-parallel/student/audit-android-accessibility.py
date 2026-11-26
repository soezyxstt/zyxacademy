#!/usr/bin/env python3
"""Audit named controls in two retained Android Maestro accessibility hierarchies."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def attrs(tree):
    yield tree.get('attributes', {})
    for child in tree.get('children', []):
        yield from attrs(child)


def require(nodes, **expected):
    matches = [node for node in nodes if all(node.get(key) == value for key, value in expected.items())]
    if len(matches) != 1:
        raise ValueError(f'Expected one node matching {expected}, found {len(matches)}')
    return matches[0]


def control(nodes, label, selected=None, checked=None, android_class=None, **expected):
    node = require(nodes, accessibilityText=label, enabled='true', clickable='true',
                   **{'important-for-accessibility': 'true'}, **expected)
    for key, value in [('selected', selected), ('checked', checked), ('class', android_class)]:
        if value is not None and node.get(key) != value:
            raise ValueError(f'{label} expected {key}={value}, found {node.get(key)}')
    bounds = tuple(map(int, re.findall(r'-?\d+', node['bounds'])))
    x0, y0, x1, y1 = bounds
    if not (0 <= x0 < x1 <= 380 and 0 <= y0 < y1 <= 820):
        raise ValueError(f'{label} has no positive in-frame bounds: {bounds}')
    width, height = x1 - x0, y1 - y0
    return {'name': label, 'class': node['class'], 'selected': node['selected'] == 'true',
            'checked': node['checked'] == 'true', 'boundsPX': bounds, 'sizeDP': [width, height],
            'below44DP': min(width, height) < 44, 'below48DP': min(width, height) < 48}


def audit(folder):
    provenance = json.loads((folder / 'provenance.json').read_text())
    if (provenance['platform'], provenance['viewport'], provenance['densityDpi']) != ('android', [380, 820], 160):
        raise ValueError('This audit expects the archived 380×820 Android mdpi setup.')
    hierarchies = {}
    for capture in provenance['captures']:
        file = capture['file']
        raw = (folder / file).read_bytes()
        if hashlib.sha256(raw).hexdigest() != capture['sha256']:
            raise ValueError(f'SHA-256 mismatch for {file}')
        hierarchies[file] = list(attrs(json.loads(raw)))
    catalog = hierarchies['catalog-tpb.json']
    discussion = hierarchies['discussion-list.json']
    require(catalog, accessibilityText='Filter by major', **{'resource-id': 'student-catalog-tab'})
    tabs = [control(catalog, label, selected=selected, **{'resource-id': f'student-catalog-tab-{key}'})
            for key, label, selected in [('all', 'All (5)', 'false'), ('tpb', 'TPB', 'true'), ('pka', 'PKA', 'false')]]
    links = [control(catalog, label) for label in ['View plans', 'contact us on WhatsApp']]
    if links[0]['boundsPX'][2] > links[1]['boundsPX'][0]:
        raise ValueError('Expected separate, non-overlapping catalog footer links.')
    course_labels = {
        'bk1101': 'Berpikir Komputasi, Coming soon',
        'fi1101': 'Fisika Dasar I, 1 material, Limited access',
        'ma1101': 'Matematika I, 6 materials · 2 quizzes',
        'ma1102': 'Matematika Lanjut untuk Sains dan Rekayasa, 1 tryout, Free access · 1-3 Jan 2030 (07:00 WIB)',
    }
    courses = [control(catalog, label, **{'resource-id': f'student-course-{key}'}) for key, label in course_labels.items()]
    for badge in ['BK', 'FI', 'MA', 'ML']:
        require(catalog, text=badge, clickable='false', **{'important-for-accessibility': 'false'})
    navigation = [control(catalog, name, selected='true' if name == 'Courses' else 'false')
                  for name in ['Home', 'Courses', 'Schedule', 'Discuss', 'Me']]
    button = 'android.widget.Button'
    discussion_controls = [
        *[control(discussion, name, android_class=button, selected=selected)
          for name, selected in [('Semua kanal', 'false'), ('Umum', 'false'), ('Matematika I', 'true')]],
        control(discussion, 'Bisukan kanal', android_class='android.widget.Switch', checked='false'),
        control(discussion, 'Cari diskusi', android_class='android.widget.EditText'),
        control(discussion, 'Cari', android_class=button),
        control(discussion, 'Pertanyaan baru', android_class=button),
        control(discussion, 'Terbuka', android_class=button, selected='true'),
        control(discussion, 'Selesai', android_class=button, selected='false'),
        control(discussion, 'Limit kiri dan kanan pada fungsi potongan, 0 jawaban · 22 Nov 2026, 1 belum dibaca', android_class=button),
    ]
    return {'workflowRun': provenance['workflowRun'], 'tabs': tabs, 'footerLinks': links, 'courses': courses,
            'decorativeBadgesExcluded': ['BK', 'FI', 'MA', 'ML'], 'navigation': navigation, 'discussion': discussion_controls}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('captures', type=Path)
    print(json.dumps(audit(parser.parse_args().captures), indent=2, ensure_ascii=False))

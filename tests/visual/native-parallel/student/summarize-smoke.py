#!/usr/bin/env python3
"""Join generated scope to observed Maestro JUnit and screenshot artifacts."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = Path(args.output)
manifest = json.loads(Path(args.manifest).read_text())
observed = {}
report_count = 0
for report in out.glob('*/report.xml'):
    try:
        root = ET.parse(report).getroot()
    except ET.ParseError:
        continue
    report_count += 1
    for test in root.iter('testcase'):
        name = test.get('name', '')
        status = 'failed' if test.find('failure') is not None or test.find('error') is not None else 'skipped' if test.find('skipped') is not None else 'passed'
        observed[name] = status
for route in manifest['routes']:
    for case in route['cases']:
        name = case.get('testName')
        if not name:
            case['result'] = 'blocked'
            continue
        matches = [value for key, value in observed.items() if key == name or name in key]
        result = matches[0] if len(matches) == 1 else 'not_run'
        screenshots = []
        for path in out.rglob(case['capture']):
            with path.open('rb') as stream:
                if stream.read(8) == b'\x89PNG\r\n\x1a\n':
                    screenshots.append(path)
        if result == 'passed' and not screenshots:
            result = 'passed_missing_capture'
        case['result'] = result
        if screenshots:
            case['artifacts'] = [str(path.relative_to(out)) for path in screenshots]
counts = {}
for route in manifest['routes']:
    for case in route['cases']:
        counts[case['result']] = counts.get(case['result'], 0) + 1
manifest['status'] = 'observed_device_run' if report_count else 'device_results_unavailable'
manifest['counts'] = counts
(out / 'smoke-summary.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(counts, indent=2))

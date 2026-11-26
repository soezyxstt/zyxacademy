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


def report_results(report):
    try:
        root = ET.parse(report).getroot()
    except (OSError, ET.ParseError):
        return {}
    observed = {}
    for test in root.iter('testcase'):
        name = test.get('name', '')
        status = 'failed' if test.find('failure') is not None or test.find('error') is not None else 'skipped' if test.find('skipped') is not None else 'passed'
        observed[name] = status
    return observed


def attempt(case, folder, results):
    name = case['testName']
    result = results.get(name, 'not_run')
    screenshots = []
    capture = f'results/*/{name}/takeScreenshot/{case["capture"]}'
    if folder in partitions:
        roots = [folder / record['partition'] for record in partitions[folder] if name in record['cases']]
        paths = roots[0].glob(capture) if len(roots) == 1 else []
    else:
        paths = folder.glob(capture)
    for path in sorted(paths):
        with path.open('rb') as stream:
            if stream.read(8) == b'\x89PNG\r\n\x1a\n':
                screenshots.append(str(path.relative_to(out)))
    if result == 'passed' and len(screenshots) != 1:
        result = 'passed_missing_capture'
    return {'result': result, **({'artifacts': screenshots} if screenshots else {})}


observed = {report.parent.name: report_results(report) for report in out.glob('*/report.xml')}
selected = {path.parent.parent.name: set(json.loads(path.read_text())) for path in out.glob('*/retry/selected.json')}
retried = {area: report_results(out / area / 'retry' / 'report.xml') for area in selected}
partitions = {path.parent: json.loads(path.read_text())
              for pattern in ('*/partitions.json', '*/retry/partitions.json') for path in out.glob(pattern)}
for route in manifest['routes']:
    for case in route['cases']:
        name = case.get('testName')
        if not name:
            case['result'] = 'blocked'
            continue
        area = case['area']
        first = attempt(case, out / area, observed.get(area, {}))
        effective = first
        if first['result'] == 'failed' and name in selected.get(area, set()):
            retry = attempt(case, out / area / 'retry', retried[area])
            case['attempts'] = [
                {'phase': 'initial', 'junit': f'{area}/report.xml', **first},
                {'phase': 'retry', 'junit': f'{area}/retry/report.xml' if retried[area] else None, **retry},
            ]
            if retry['result'] != 'not_run':
                effective = retry
        case.update(effective)
counts = {}
for route in manifest['routes']:
    for case in route['cases']:
        counts[case['result']] = counts.get(case['result'], 0) + 1
manifest['status'] = 'observed_device_run' if any(observed.values()) else 'device_results_unavailable'
manifest['counts'] = counts
(out / 'smoke-summary.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(counts, indent=2))

#!/usr/bin/env python3
"""Retry failed Android fixture cases that lost the Maestro device connection."""
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


TRANSPORT_FAILURE = re.compile(r'DeviceServerDiedException|\bdevice offline\b', re.I)


def test_results(report):
    results = {}
    for test in ET.parse(report).iter('testcase'):
        name = test.get('name', '')
        failure = test.find('failure')
        if failure is None:
            failure = test.find('error')
        if failure is not None:
            results[name] = (failure.get('message') or failure.text or '').strip()
        else:
            results[name] = 'Skipped' if test.find('skipped') is not None else None
    return results


def transport_failed(name, message, area):
    if not re.fullmatch(r'smoke-\d+', name):
        return False
    if message.startswith(('Assertion is false:', 'No visible element found:')):
        return False
    if TRANSPORT_FAILURE.search(message):
        return True
    if not message.startswith('Unknown error'):
        return False
    logs = list((area / 'results').glob(f'*/{name}/logs/maestro.log'))
    return len(logs) == 1 and bool(TRANSPORT_FAILURE.search(logs[0].read_text(errors='replace')))


def main():
    maestro, device, flow_dir, area_dir = sys.argv[1:]
    flows, area = Path(flow_dir).resolve(), Path(area_dir).resolve()
    try:
        failures = {name: message for name, message in test_results(area / 'report.xml').items()
                    if message is not None}
    except (OSError, ET.ParseError):
        return 1
    selected = [name for name, message in failures.items()
                if transport_failed(name, message, area) and (flows / f'{name}.yaml').is_file()]
    if not selected:
        return 1
    retry = area / 'retry'
    retry.mkdir()
    (retry / 'selected.json').write_text(json.dumps(selected, indent=2) + '\n')
    print(f'Retrying {len(selected)} Android transport failures in {area.name}.', flush=True)
    try:
        if subprocess.run(['adb', '-s', device, 'wait-for-device'], timeout=45).returncode:
            return 1
    except subprocess.TimeoutExpired:
        print(f'Android device {device} did not reconnect within 45 seconds.', file=sys.stderr)
        return 1
    result = subprocess.run(
        [maestro, '--platform', 'android', '--device', device, 'test',
         '--format', 'junit', '--output', str(retry / 'report.xml'),
         '--test-output-dir', str(retry / 'results'), '--debug-output', str(retry / 'logs'),
         *(str(flows / f'{name}.yaml') for name in selected)],
        cwd=retry,
    )
    if result.returncode or len(selected) != len(failures):
        return 1
    try:
        observed = test_results(retry / 'report.xml')
    except (OSError, ET.ParseError):
        return 1
    return int(observed != dict.fromkeys(selected))


if __name__ == '__main__':
    sys.exit(main())

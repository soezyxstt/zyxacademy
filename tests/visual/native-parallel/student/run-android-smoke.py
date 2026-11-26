#!/usr/bin/env python3
"""Run Android Maestro cases in bounded partitions and retry transport failures once."""
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


TRANSPORT_FAILURE = re.compile(r'DeviceServerDiedException|\bdevice offline\b', re.I)
PARTITION_SIZE = 8


def read_cases(report, expected):
    try:
        tests = list(ET.parse(report).iter('testcase'))
    except (OSError, ET.ParseError):
        return {}
    observed = {test.get('name'): test for test in tests}
    return observed if observed.keys() <= expected and len(tests) == len(observed) else {}


def failure_message(test):
    for child in ('failure', 'error'):
        failure = test.find(child)
        if failure is not None:
            return (failure.get('message') or failure.text or '').strip()
    return 'Skipped' if test.find('skipped') is not None else None


def transport_failed(name, message, partition):
    if message is None or message.startswith(('Assertion is false:', 'No visible element found:')):
        return False
    if TRANSPORT_FAILURE.search(message):
        return True
    if not message.startswith('Unknown error'):
        return False
    logs = list((partition / 'results').glob(f'*/{name}/logs/maestro.log'))
    return len(logs) == 1 and bool(TRANSPORT_FAILURE.search(logs[0].read_text(errors='replace')))


def ready(device):
    try:
        return subprocess.run(['adb', '-s', device, 'wait-for-device', 'shell', 'true'],
                              timeout=45).returncode == 0
    except subprocess.TimeoutExpired:
        print(f'Android device {device} did not reconnect within 45 seconds.', file=sys.stderr)
        return False


def run_partitions(maestro, device, flows, phase):
    cases = {}
    transport = []
    partitions = []
    complete = True
    device_ready = True
    for offset in range(0, len(flows), PARTITION_SIZE):
        batch = flows[offset:offset + PARTITION_SIZE]
        partition = phase / 'partitions' / f'{len(partitions) + 1:03}'
        partition.mkdir(parents=True)
        names = {flow.stem for flow in batch}
        record = {'partition': str(partition.relative_to(phase)), 'cases': [flow.stem for flow in batch]}
        partitions.append(record)
        device_ready = device_ready and ready(device)
        if not device_ready:
            record['status'] = 'device_unavailable'
            complete = False
            continue
        report = partition / 'report.xml'
        result = subprocess.run(
            [maestro, '--platform', 'android', '--device', device, 'test',
             '--format', 'junit', '--output', str(report), '--test-output-dir', str(partition / 'results'),
             '--debug-output', str(partition / 'logs'), *(str(flow) for flow in batch)],
            cwd=partition,
        )
        observed = read_cases(report, names)
        failures = {name: failure_message(test) for name, test in observed.items()}
        batch_complete = observed.keys() == names and (
            result.returncode == 0 or any(reason is not None for reason in failures.values())
        )
        complete = complete and batch_complete
        record.update(status='complete' if batch_complete else 'incomplete',
                      exitCode=result.returncode, observed=list(observed))
        cases.update(observed)
        transport.extend(name for name, reason in failures.items() if transport_failed(name, reason, partition))

    (phase / 'partitions.json').write_text(json.dumps(partitions, indent=2) + '\n')
    suite = ET.Element('testsuite', name='Student smoke', tests=str(len(cases)),
                       failures=str(sum(failure_message(test) is not None for test in cases.values())))
    suite.extend(cases.values())
    ET.ElementTree(suite).write(phase / 'report.xml', encoding='utf-8', xml_declaration=True)
    return cases, transport, complete


def main():
    maestro, device, flow_dir, area_dir = sys.argv[1:]
    area = Path(area_dir).resolve()
    flows = sorted(Path(flow_dir).resolve().glob('smoke-*.yaml'))
    cases, transport, complete = run_partitions(maestro, device, flows, area)
    if transport:
        retry = area / 'retry'
        retry.mkdir()
        (retry / 'selected.json').write_text(json.dumps(transport, indent=2) + '\n')
        print(f'Retrying {len(transport)} Android transport failures in {area.name}.', flush=True)
        observed, _, retry_complete = run_partitions(
            maestro, device, [flow for flow in flows if flow.stem in transport], retry,
        )
        cases.update(observed)
        complete = complete and retry_complete
    return int(not complete or len(cases) != len(flows) or any(failure_message(test) is not None for test in cases.values()))


if __name__ == '__main__':
    sys.exit(main())

"""Shared Android Maestro transport diagnostics and readiness checks."""

import re
import subprocess
import sys
import xml.etree.ElementTree as ET


TRANSPORT_FAILURE = re.compile(r'DeviceServerDiedException|\bdevice offline\b', re.I)
ASSERTION_FAILURE = re.compile(r'Assertion is false:|No visible element found:', re.I)
PARTITION_SIZE = 8


def read_cases(report, expected=None):
    try:
        tests = list(ET.parse(report).iter('testcase'))
    except (OSError, ET.ParseError):
        return {}
    observed = {test.get('name'): test for test in tests}
    if None in observed or len(tests) != len(observed) or (expected is not None and not observed.keys() <= expected):
        return {}
    return observed


def failure_message(test):
    for child in ('failure', 'error'):
        failure = test.find(child)
        if failure is not None:
            return (failure.get('message') or failure.text or '').strip()
    return 'Skipped' if test.find('skipped') is not None else None


def transport_failed(name, message, partition):
    if message is None or ASSERTION_FAILURE.search(message):
        return False
    direct = bool(TRANSPORT_FAILURE.search(message))
    if not direct and not message.startswith('Unknown error'):
        return False
    logs = [run / name / 'logs/maestro.log' for run in (partition / 'results').glob('*')]
    logs = [path for path in logs if path.is_file()]
    if not logs:
        return direct
    if len(logs) != 1:
        return False
    try:
        trace = logs[0].read_text(errors='replace')
    except OSError:
        return False
    return (direct or bool(TRANSPORT_FAILURE.search(trace))) and not ASSERTION_FAILURE.search(trace)


def ready(device):
    try:
        return subprocess.run(['adb', '-s', device, 'wait-for-device', 'shell', 'true'],
                              timeout=45).returncode == 0
    except subprocess.TimeoutExpired:
        print(f'Android device {device} did not reconnect within 45 seconds.', file=sys.stderr)
        return False


def run_maestro(maestro, device, flows, directory):
    return subprocess.run(
        [maestro, '--platform', 'android', '--device', device, 'test',
         '--format', 'junit', '--output', str(directory / 'report.xml'),
         '--test-output-dir', str(directory / 'results'),
         '--debug-output', str(directory / 'logs'), *(str(flow) for flow in flows)],
        cwd=directory,
    ).returncode

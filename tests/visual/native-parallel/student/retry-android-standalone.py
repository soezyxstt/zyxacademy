#!/usr/bin/env python3
"""Replay only standalone cases whose initial report proves ADB transport failure."""

import json
from pathlib import Path
import sys

from android_maestro import PARTITION_SIZE, failure_message, read_cases, ready, run_maestro, transport_failed
from standalone_evidence import ATTEMPTS_FILE


def validate_flows(cases, flows):
    # Maestro records the source YAML in each testcase. Require a unique known
    # file as well as a unique testcase name before replaying it.
    files = {name: Path(test.get('file', '')).name for name, test in cases.items()}
    return files if set(files.values()) <= flows.keys() and len(files) == len(set(files.values())) else {}


def result(name, test, directory):
    if test is None:
        return 'not_recorded'
    message = failure_message(test)
    if transport_failed(name, message, directory):
        return 'transport_failure'
    if message is not None:
        return 'skipped' if test.find('skipped') is not None else 'failed'
    return 'passed' if test.get('status') == 'SUCCESS' else 'not_recorded'


def write_index(directory, provenance):
    temporary = directory / f'{ATTEMPTS_FILE}.tmp'
    temporary.write_text(json.dumps(provenance, indent=2) + '\n')
    temporary.replace(directory / ATTEMPTS_FILE)


def retry(maestro, device, directory, flow_paths):
    flows = {path.name: path for path in flow_paths}
    initial = read_cases(directory / 'report.xml')
    files = validate_flows(initial, flows)
    complete = bool(files) and len(files) == len(flow_paths)
    records = {
        name: {'flow': filename, 'initial': result(name, initial[name], directory), 'effective': '.'}
        for name, filename in files.items()
    }
    selected = [name for name, record in records.items() if record['initial'] == 'transport_failure']
    batches = []
    provenance = {'version': 1, 'initialReport': 'report.xml', 'initialComplete': complete,
                  'cases': records, 'batches': batches}
    # Keep comparison readers on the original attempt until a replay report is validated.
    write_index(directory, provenance)
    device_ready = True
    for offset in range(0, len(selected), PARTITION_SIZE):
        names = selected[offset:offset + PARTITION_SIZE]
        folder = Path('standalone-retry') / f'{len(batches) + 1:03d}'
        target = directory / folder
        target.mkdir(parents=True)
        print(f'Retrying {len(names)} Android standalone transport failures in {folder}.', flush=True)
        batch = {'directory': folder.as_posix(), 'cases': names}
        batches.append(batch)
        device_ready = device_ready and ready(device)
        if device_ready:
            paths = [flows[files[name]] for name in names]
            code = run_maestro(maestro, device, paths, target)
            observed = read_cases(target / 'report.xml', set(names))
            expected_files = {name: files[name] for name in observed}
            if validate_flows(observed, flows) != expected_files:
                observed = {}
            batch_ok = observed.keys() == set(names) and (code == 0 or any(failure_message(test) is not None for test in observed.values()))
            batch.update(status='complete' if batch_ok else 'incomplete', exitCode=code)
        else:
            observed = {}
            batch_ok = False
            batch['status'] = 'device_unavailable'
        complete = complete and batch_ok
        for name in names:
            outcome = result(name, observed.get(name), target)
            record = records[name]
            record['retry'] = {'directory': folder.as_posix(), 'result': outcome}
            if outcome != 'not_recorded':
                record['effective'] = folder.as_posix()
        write_index(directory, provenance)

    return int(not selected or not complete or any(
        (record['initial'] if record['effective'] == '.' else record['retry']['result']) != 'passed'
        for record in records.values()
    ))


if __name__ == '__main__':
    maestro, device, root, *flows = sys.argv[1:]
    sys.exit(retry(maestro, device, Path(root).resolve(), [Path(path).resolve() for path in flows]))

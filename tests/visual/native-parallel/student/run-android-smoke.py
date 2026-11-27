#!/usr/bin/env python3
"""Run Android Maestro cases in bounded partitions and retry transport failures once."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from android_maestro import PARTITION_SIZE, failure_message, read_cases, ready, run_maestro, transport_failed


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
        exit_code = run_maestro(maestro, device, batch, partition)
        observed = read_cases(partition / 'report.xml', names)
        failures = {name: failure_message(test) for name, test in observed.items()}
        batch_complete = observed.keys() == names and (
            exit_code == 0 or any(reason is not None for reason in failures.values())
        )
        complete = complete and batch_complete
        record.update(status='complete' if batch_complete else 'incomplete',
                      exitCode=exit_code, observed=list(observed))
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

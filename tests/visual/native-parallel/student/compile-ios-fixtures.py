#!/usr/bin/env python3
"""Compile canonical Student fixture links to the isolated iOS evidence menu."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from urllib.parse import parse_qsl, urlsplit

import yaml


MENU = 'student-ios-menu'
INPUT = 'student-ios-case-input'
SYNTHETIC_PARAMS = {'scenario', 'path', 'theme', 'locale', 'store'}


def fixture_params(link):
    url = urlsplit(link)
    if (url.scheme, url.netloc, url.path, url.fragment) != ('zyx-native-parity', 'student-fixture', '', ''):
        raise ValueError(f'Unsupported Student fixture URL: {link}')
    fields = parse_qsl(url.query, keep_blank_values=True, strict_parsing=True, errors='strict')
    params = dict(fields)
    if len(fields) != len(params) or not params.get('scenario') or any(
        key not in SYNTHETIC_PARAMS and not (key.startswith('query_') and len(key) > len('query_')) for key in params
    ):
        raise ValueError(f'Invalid Student fixture parameters: {link}')
    return params


def open_case(case_id):
    return [
        {'tapOn': {'id': INPUT}},
        {'inputText': case_id},
        {'tapOn': {'id': f'student-ios-case-{case_id}'}},
    ]


def wait_for_menu(timeout=30000):
    return {'extendedWaitUntil': {'visible': {'id': MENU}, 'timeout': timeout}}


def contains_link(node):
    if isinstance(node, dict):
        return 'openLink' in node or any(contains_link(child) for child in node.values())
    return isinstance(node, list) and any(contains_link(child) for child in node)


def compile_steps(steps, register):
    result = []
    for step in steps:
        if isinstance(step, dict) and 'openLink' in step:
            if set(step) != {'openLink'} or not isinstance(step['openLink'], str):
                raise ValueError(f'Unsupported Maestro link command: {step}')
            previous = result[-1] if result else None
            if not isinstance(previous, dict) or previous.get('extendedWaitUntil', {}).get('visible') != {'id': MENU}:
                # A fixture switch returns to the launcher while preserving app data.
                result.extend([{'launchApp': {'stopApp': True, 'clearState': False}}, wait_for_menu()])
            result.extend(open_case(register(fixture_params(step['openLink']))))
        elif contains_link(step):
            raise ValueError(f'Nested links need an explicit iOS fixture launcher: {step}')
        elif isinstance(step, dict) and step.get('extendedWaitUntil', {}).get('visible') == 'separator':
            result.append(wait_for_menu(step['extendedWaitUntil']['timeout']))
        else:
            result.append(step)
    return result


def write_flow(path, metadata, steps):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump_all([metadata, steps], allow_unicode=True, sort_keys=False, width=10000))


def compile_flows(standalone, generated, output):
    if output.exists() and any(output.iterdir()):
        raise ValueError(f'Existing iOS launcher artifacts in {output}. Use an empty output directory.')
    cases, indices, converted = {}, {}, []

    def register(params):
        key = tuple(sorted(params.items()))
        if key not in indices:
            case_id = f'{len(indices) + 1:03d}'
            if len(case_id) != 3:
                raise ValueError('The iOS fixture menu supports at most 999 inputs')
            indices[key] = case_id
            cases[case_id] = {'params': params}
        return indices[key]

    standalone_paths = sorted(standalone.glob('*.yaml'))
    smoke_paths = sorted(generated.glob('*/smoke-*.yaml'))
    if not standalone_paths or not smoke_paths:
        raise ValueError('Expected canonical standalone and generated Student flows')
    for group, source, paths in (('standalone', standalone, standalone_paths), ('generated', generated, smoke_paths)):
        for path in paths:
            try:
                raw = path.read_bytes()
                metadata, steps = yaml.safe_load_all(raw)
                relative = path.relative_to(source)
                target = output / group / relative
                case_ids = []

                def register_step(params):
                    case_id = register(params)
                    case_ids.append(case_id)
                    return case_id

                write_flow(target, metadata, compile_steps(steps, register_step))
                converted.append({'source': relative.as_posix(), 'sourceSha256': sha256(raw).hexdigest(),
                                  'compiled': target.relative_to(output).as_posix(),
                                  'compiledSha256': sha256(target.read_bytes()).hexdigest(), 'caseIds': case_ids})
            except (ValueError, yaml.YAMLError) as error:
                raise ValueError(f'{path}: {error}') from error

    probe = register({'scenario': 'catalog-parity'})
    write_flow(output / 'verify-menu.yaml', {'appId': 'com.zyx.academy.nativeparity', 'name': 'Student iOS fixture launcher'}, [
        {'launchApp': {'clearState': True}}, wait_for_menu(), *open_case(probe),
        {'extendedWaitUntil': {'visible': {'id': 'student-course-ma1101'}, 'timeout': 30000}},
    ])
    case_map = output / 'cases.json'
    case_map.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + '\n')
    checkout = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=Path(__file__).resolve().parents[4], text=True).strip()
    provenance = {'checkoutSha': checkout, 'navigation': 'ios_in_app_fixture_launcher',
                  'midFlowReentry': 'cold_process_preserving_app_storage',
                  'evidence': ['fixture_states', 'within_screen_interactions', 'process_restart'],
                  'externalUrlVerified': False, 'warmRouteReentryVerified': False,
                  'caseMap': {'file': case_map.name, 'sha256': sha256(case_map.read_bytes()).hexdigest()}, 'flows': converted}
    (output / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'Prepared {len(standalone_paths)} standalone flows, {len(smoke_paths)} smoke flows, and {len(cases)} iOS menu targets.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for path in ('standalone', 'generated', 'output'):
        parser.add_argument(path, type=Path)
    args = parser.parse_args()
    compile_flows(args.standalone, args.generated, args.output)

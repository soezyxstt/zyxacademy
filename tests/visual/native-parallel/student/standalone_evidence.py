"""Resolve a standalone testcase to one exact attempt and its raw artifacts."""

import json
from pathlib import Path
import re
from xml.etree import ElementTree


ATTEMPTS_FILE = 'standalone-attempts.json'


class StandaloneEvidence:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.cases = None
        path = self.directory / ATTEMPTS_FILE
        if path.exists():
            self.cases = {}
            try:
                data = json.loads(path.read_text())
                if data['version'] == 1 and isinstance(data['cases'], dict):
                    self.cases = data['cases']
            except (KeyError, OSError, TypeError, ValueError):
                pass

    def folder(self, testcase):
        if self.cases is None:
            return self.directory
        record = self.cases.get(testcase)
        if not isinstance(record, dict):
            return None
        phase = record.get('effective')
        if phase == '.':
            return self.directory
        attempt = record.get('retry')
        if (record.get('initial') == 'transport_failure' and isinstance(phase, str)
                and re.fullmatch(r'standalone-retry/\d{3}', phase) and isinstance(attempt, dict)
                and attempt.get('directory') == phase and attempt.get('result') in ('passed', 'failed', 'skipped', 'transport_failure')):
            return self.directory / phase
        return None

    def status(self, testcase):
        record = self.cases.get(testcase) if self.cases is not None else None
        if isinstance(record, dict) and record.get('effective') == 'incomplete':
            return 'incomplete'
        folder = self.folder(testcase)
        if folder is not None:
            try:
                cases = [case for case in ElementTree.parse(folder / 'report.xml').iter('testcase')
                         if case.get('name') == testcase]
                if len(cases) == 1:
                    if record is not None and (not record.get('flow')
                            or Path(cases[0].get('file', '')).name != record['flow']):
                        return 'not_recorded'
                    if cases[0].find('failure') is not None or cases[0].find('error') is not None:
                        return 'ERROR'
                    if cases[0].find('skipped') is not None:
                        return 'SKIPPED'
                    return cases[0].get('status', 'unknown')
            except (ElementTree.ParseError, OSError):
                pass
        return 'not_recorded'

    def captures(self, testcase, filename):
        if self.cases is None:
            return list(self.directory.rglob(filename))
        folder = self.folder(testcase)
        if folder is None:
            return []
        return [path for run in (folder / 'results').glob('*')
                if (path := run / testcase / 'takeScreenshot' / filename).is_file()]

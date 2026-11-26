"""Exercise product runner orchestration with stand-ins for hosted macOS tools."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parent
STUB = """#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['ZYX_PRODUCT_COMMANDS'], 'a') as log:
    print(json.dumps([name, *args]), file=log)
if name == 'xcrun':
    if args[:3] == ['simctl', 'list', 'devices']:
        print(json.dumps({'devices': {'iOS': [{'name': 'iPhone 17 Pro', 'udid': 'simulator'}]}}))
    elif args[0] == 'xcodebuild':
        root = Path(args[args.index('-derivedDataPath') + 1])
        app = root / 'Build/Products/Release-iphonesimulator/ZyxAcademyNative.app'
        app.mkdir(parents=True)
        if not os.environ.get('ZYX_PRODUCT_MISSING_BUNDLE'):
            (app / 'main.jsbundle').write_text('fixture release bundle')
    elif args[0] == 'lipo':
        print('arm64')
    elif args[:2] == ['simctl', 'terminate']:
        print('found nothing to terminate', file=sys.stderr)
        sys.exit(1)
elif name == 'plutil':
    print('com.zyx.academy.nativeparity')
elif name == 'maestro':
    cold = args[-1].endswith('cold-private-entry.yaml')
    Path(args[args.index('--output') + 1]).write_text('<testsuites/>')
    if cold and os.environ.get('ZYX_PRODUCT_FAIL_COLD'):
        sys.exit(9)
"""


class IosProductEntryTest(unittest.TestCase):
    def run_fixture(self, **options):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / 'scripts/native-parity'
            scripts.mkdir(parents=True)
            for name in ('capture-ios.sh', 'capture-ios-product.sh', 'check-interactions.sh'):
                shutil.copyfile(SCRIPTS / name, scripts / name)
            fixtures = root / '.maestro/native-integration'
            (fixtures / 'helpers').mkdir(parents=True)
            for name in ('private-entry.yaml', 'helpers/cold-private-entry.yaml'):
                shutil.copyfile(SCRIPTS.parents[1] / '.maestro/native-integration' / name, fixtures / name)
            (root / 'apps/mobile-native').mkdir(parents=True)
            bin_path = root / 'bin'
            bin_path.mkdir()
            for name in ('npx', 'pod', 'xcrun', 'plutil', 'maestro'):
                stub = bin_path / name
                stub.write_text(STUB)
                stub.chmod(0o755)
            (bin_path / 'python').symlink_to(sys.executable)
            log = root / 'commands.jsonl'
            env = {**os.environ, **options, 'PATH': f'{bin_path}:{os.environ["PATH"]}', 'RUNNER_TEMP': directory,
                   'ZYX_PRODUCT_COMMANDS': str(log), 'NATIVE_PARITY_MAESTRO': str(bin_path / 'maestro')}
            result = subprocess.run(['bash', str(scripts / 'capture-ios.sh'), 'product'], cwd=root, env=env,
                                    capture_output=True, text=True, timeout=5)
            output = root / 'artifacts/native-integration/ios'
            self.assertTrue(output.exists(), result.stderr)
            return (result.returncode, [json.loads(line) for line in log.read_text().splitlines()],
                    sorted(file.name for file in output.iterdir()))

    def test_builds_once_installs_release_and_dispatches_a_cold_product_url(self):
        status, commands, artifacts = self.run_fixture()
        self.assertEqual(status, 0)
        builds = [command for command in commands if command[:2] == ['xcrun', 'xcodebuild']]
        self.assertEqual(len(builds), 1)
        self.assertIn('ONLY_ACTIVE_ARCH=YES', builds[0])
        self.assertIn('platform=iOS Simulator,id=simulator', builds[0])
        self.assertIn('Release', builds[0])
        self.assertIn(['xcrun', 'simctl', 'openurl', 'simulator', 'zyx-native-parity://admin'], commands)
        self.assertFalse(any('zyx-native-parity://gallery/separator' in command for command in commands))
        runners = [command[-1] for command in commands if command[0] == 'maestro']
        self.assertEqual([Path(path).name for path in runners], ['cold-private-entry.yaml', 'private-entry.yaml'])
        self.assertTrue({'cold-entry.xml', 'report.xml', 'build.log', 'phases.txt', 'app-architectures.txt'} <= set(artifacts))

    def test_cold_assertion_failure_keeps_warm_evidence_and_fails_the_job(self):
        status, _, artifacts = self.run_fixture(ZYX_PRODUCT_FAIL_COLD='1')
        self.assertNotEqual(status, 0)
        self.assertTrue({'cold-entry.xml', 'report.xml'} <= set(artifacts))

    def test_install_and_maestro_require_an_embedded_release_bundle(self):
        status, commands, _ = self.run_fixture(ZYX_PRODUCT_MISSING_BUNDLE='1')
        self.assertNotEqual(status, 0)
        self.assertFalse(any(command[0] == 'maestro' or command[:3] == ['xcrun', 'simctl', 'install'] for command in commands))

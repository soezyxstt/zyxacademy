import json
from pathlib import Path
import subprocess


def expected_relative_cases():
    root = Path(__file__).resolve().parents[5]
    command = ("import { sharedUiRelativeCases } from './packages/native-parity/shared-ui/relative-cases'; "
               "console.log(JSON.stringify(sharedUiRelativeCases.map(c => ({id:c.id,component:c.component,theme:c.theme,"
               "readyId:'open' in c && c.open ? c.id + '-panel' : 'shared-ui-case-' + c.id}))))")
    return json.loads(subprocess.check_output(["bun", "-e", command], cwd=root, text=True))

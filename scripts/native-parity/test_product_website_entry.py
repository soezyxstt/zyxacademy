"""Test the Android activity evidence and egress cleanup without a device."""

import os
from pathlib import Path
import runpy
import shlex
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


MODULE = runpy.run_path(str(Path(__file__).with_name("product-website-entry.py")))
APP = MODULE["APP"]
CHROME = MODULE["CHROME"]
BROWSER = f"{CHROME}/org.chromium.chrome.browser.customtabs.CustomTabActivity"
URL = MODULE["ORIGIN"] + MODULE["CASES"]["blog"]


def activity_dump(url=URL, *, resumed=BROWSER, source=CHROME):
    return f"""ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
Display #0 (activities from top to bottom):
    * Task{{7f00 #81 type=standard}}
      * Hist  #1: ActivityRecord{{abc u0 {BROWSER} t81}}
        packageName={CHROME} processName={CHROME}
        launchedFromUid=10042 launchedFromPackage={source}
        Intent {{ act=android.intent.action.VIEW dat={url} pkg={CHROME} }}
      * Hist  #0: ActivityRecord{{def u0 {APP}/.MainActivity t81}}
        launchedFromUid=2000 launchedFromPackage=com.android.shell
        Intent {{ act=android.intent.action.VIEW dat=zyx-native-parity://en/blog/native-smoke pkg={APP} }}

  Resumed activities in task display areas (from top to bottom):
    Resumed: ActivityRecord{{{"abc" if resumed == BROWSER else "def"} u0 {resumed} t81}}
"""


class ProductWebsiteEntryTest(unittest.TestCase):
    def test_matches_an_exact_view_intent_for_the_resumed_browser(self):
        observe = MODULE["browser_intent"]
        self.assertIn(f"dat={URL}", observe(activity_dump(), URL))
        self.assertIn(f"launchedFromPackage={APP}", observe(activity_dump(source=APP), URL))
        self.assertIsNone(observe(activity_dump(URL + "-extra"), URL))
        self.assertIsNone(observe(activity_dump(URL.replace("%2F", "/")), URL))
        self.assertIsNone(observe(activity_dump(resumed=f"{APP}/.MainActivity"), URL))
        self.assertIsNone(observe(activity_dump(source="com.android.shell"), URL))
        self.assertIsNone(observe(activity_dump().replace("android.intent.action.VIEW", "android.intent.action.MAIN", 1), URL))

    def test_isolates_both_address_families_and_restores_them_after_a_failed_return(self):
        commands = []
        original = MODULE["run"].__globals__
        flags = "chrome --disable-fre --disable-startup-promos-for-testing"

        def runner(command, **options):
            if command[0] == "maestro":
                args = command
                commands.append(args)
                if "blog" in args[args.index("--output") + 1]:
                    raise subprocess.CalledProcessError(1, command)
                return
            args = shlex.split(command[4]) if command[3] == "shell" else command[3:]
            commands.append(args)
            result = ""
            if args[:2] == ["id", "-u"]:
                result = "0"
            if args[0] == "cat":
                result = flags + "\n"
            if args[0] == "dumpsys":
                result = activity_dump()
            if args[0] == "exec-out":
                result = b"png"
            return subprocess.CompletedProcess(command, 0, stdout=result)

        with TemporaryDirectory() as directory, patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted"}), \
                patch.dict(original, CASES={"blog": MODULE["CASES"]["blog"]}), patch.object(subprocess, "run", side_effect=runner):
            output = Path(directory)
            with self.assertRaises(subprocess.CalledProcessError):
                MODULE["run"]("emulator-5554", "maestro", output)
            self.assertIn(f"dat={URL}", (output / "blog/browser-intent.txt").read_text())
            self.assertTrue((output / "blog/browser.png").exists())

        browser_start = next(i for i, command in enumerate(commands) if "zyx-native-parity://en/blog" in " ".join(command))
        self.assertLess(next(i for i, command in enumerate(commands) if command[:2] == ["iptables", "-I"]), browser_start)
        self.assertLess(next(i for i, command in enumerate(commands) if command[:2] == ["ip6tables", "-I"]), browser_start)
        self.assertIn(["input", "keyevent", "KEYCODE_BACK"], commands)
        self.assertEqual([command[:2] for command in commands[-2:]], [["ip6tables", "-D"], ["iptables", "-D"]])


if __name__ == "__main__":
    unittest.main()

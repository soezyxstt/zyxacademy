from contextlib import redirect_stdout
from importlib.util import spec_from_file_location, module_from_spec
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


spec = spec_from_file_location("relative_summary", Path(__file__).with_name("relative-summary.py"))
summary = module_from_spec(spec)
spec.loader.exec_module(summary)


class RelativeSharedUiTest(unittest.TestCase):
    def test_requires_all_three_cases_same_device_and_expected_crop_geometry(self):
        expected = [{"id": case, "component": "grid"} for case in ("one", "two", "three")]
        build, device = "a" * 40, "emulator-5554"
        metrics = {
            "policy": summary.POLICY, "framePixels": [320, 100],
            "fullSsim": 0.999, "foregroundSsim": 0.99,
            "referenceForeground": 50, "nativeForeground": 50,
            "referenceBounds": [10, 30, 20, 35], "nativeBounds": [10, 30, 20, 35],
            "canvasMaxRgbDelta": 0, "flatColorWindow": 0, "unmatchedSalienceWindow": 0,
        }
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def write(group, cases, device_name=device, width=320):
                folder = root / group / "run-fixture"
                folder.mkdir(parents=True, exist_ok=True)
                (folder.parent / "latest-run.json").write_text(json.dumps({"runDirectory": str(folder)}))
                (folder / "ci-summary.json").write_text(json.dumps({
                    "build": build, "device": device_name, "platform": "android", "group": group,
                    "geometry": {"scale": "1", "width": width, "height": 100, "insets": [0, 24, 0, 24]}, "relativeCases": cases,
                }))
                if cases:
                    (folder / "relative").mkdir(exist_ok=True)
                    (folder / "relative/results.json").write_text(json.dumps({
                        "platform": "android", "policy": summary.POLICY, "referenceEngine": "android-webview",
                        "build": build, "device": device_name, "dpr": 1,
                        "cases": [{"id": case, "component": "grid", "status": "pass", "issues": [],
                                   "differentPixels": 1, "relativeVisual": metrics, "referenceBlank": False,
                                   "nativeBlank": False, "cropPixels": [0, 24, width, 124],
                                   "expoRawSha256": "b" * 64, "webviewRawSha256": "c" * 64} for case in cases],
                    }))

            def check():
                with redirect_stdout(StringIO()) as output:
                    status = summary.summarize(root, build, expected)
                return status, output.getvalue()

            write("phone", ["one", "two"])
            write("tablet", ["three"])
            write("wide", [])
            status, text = check()
            self.assertEqual(0, status)
            self.assertIn("1/1 components passed all three cases", text)
            self.assertIn("Interaction, accessibility and product readiness use separate evidence.", text)
            write("tablet", ["three"], width=321)
            self.assertNotEqual(0, check()[0])
            write("tablet", ["three"], "emulator-5556")
            self.assertNotEqual(0, check()[0])
            write("tablet", [])
            self.assertNotEqual(0, check()[0])

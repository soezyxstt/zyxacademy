from contextlib import redirect_stdout
import io
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
import xml.etree.ElementTree as ET


retry = runpy.run_path(Path(__file__).with_name("operations") / "device-reports.py")["retry"]


class OperationsDeviceReportsTest(unittest.TestCase):
    def test_retries_only_device_disconnect_failures(self):
        disconnected = (
            "maestro.android.DeviceServerDiedException: Device server died during 'viewHierarchy' "
            "on emulator-5554 (539ms since last byte, connection age 68469ms): StatusRuntimeException: UNAVAILABLE\n"
            "Caused by: io.grpc.StatusRuntimeException: UNAVAILABLE"
        )
        cases = [
            ("interrupted", disconnected, "Inputting text"),
            ("offline", "Unknown error", "Command failed (host:transport:emulator-5554): device offline"),
            ("assertion", 'Assertion is false: "Success" is visible', "device offline"),
            ("other-grpc-status", disconnected.replace("UNAVAILABLE", "INTERNAL"), ""),
            ("other-view-error", "A command returned StatusRuntimeException: UNAVAILABLE", ""),
            ("passed", None, "device offline"),
        ]
        with TemporaryDirectory() as directory:
            root = Path(directory)
            suite = ET.Element("testsuite")
            for name, failure, log in cases:
                case = ET.SubElement(suite, "testcase", name=name, file=f"{name}.yaml")
                if failure is not None:
                    ET.SubElement(case, "failure").text = failure
                logs = root / "run" / name / "logs"
                logs.mkdir(parents=True)
                (logs / "maestro.log").write_text(log)
            report = root / "report.xml"
            ET.ElementTree(suite).write(report)
            output = io.StringIO()
            with redirect_stdout(output):
                retry(report, root)
        self.assertEqual(output.getvalue().splitlines(), ["interrupted.yaml", "offline.yaml"])

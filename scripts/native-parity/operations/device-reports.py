"""Merge Android Maestro batches and identify flows interrupted by ADB transport."""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def test_cases(report):
    return ET.parse(report).findall(".//testcase") if report.is_file() else []


def retry(report, results):
    offline = {
        log.parents[1].name
        for log in results.glob("*/*/logs/maestro.log")
        if "device offline" in log.read_text(errors="replace")
    }
    for case in test_cases(report):
        if case.get("name") in offline and case.find("failure") is not None:
            print(case.attrib["file"])


def merge(output, flows):
    recorded = {}
    reports = sorted(
        (output / "reports").glob("*.xml"),
        key=lambda path: (path.stem.removesuffix("-retry"), path.stem.endswith("-retry")),
    )
    for report in reports:
        for case in test_cases(report):
            recorded[Path(case.attrib["file"]).name] = case

    tree = ET.Element("testsuites")
    suite = ET.SubElement(tree, "testsuite", name="Operations on Android")
    for flow in sorted(flows.glob("*.yaml")):
        if flow.name in recorded:
            suite.append(recorded[flow.name])
        else:
            missing = ET.SubElement(suite, "testcase", name=flow.stem, file=flow.name, status="ERROR")
            ET.SubElement(missing, "failure", message="No Maestro result was recorded")

    failures = sum(case.find("failure") is not None or case.find("error") is not None for case in suite)
    suite.set("tests", str(len(suite)))
    suite.set("failures", str(failures))
    suite.set("time", str(sum(float(case.get("time", "0")) for case in suite)))
    ET.indent(tree)
    ET.ElementTree(tree).write(output / "report.xml", encoding="UTF-8", xml_declaration=True)
    print(f"{len(suite) - failures}/{len(suite)} Android flows passed")
    return int(failures > 0)


if __name__ == "__main__":
    command, first, second = sys.argv[1:]
    if command == "retry":
        retry(Path(first), Path(second))
    elif command == "merge":
        sys.exit(merge(Path(first), Path(second)))
    else:
        sys.exit(f"Unknown report command: {command}")

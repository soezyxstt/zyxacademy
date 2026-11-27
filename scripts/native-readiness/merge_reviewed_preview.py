"""Resolve independent feature and test hunks for the exact reviewed CI inputs."""

import re
import subprocess
import sys
from pathlib import Path

SUBMIT = "export async function submitTryoutAction("
GRADE = "export async function gradeSubmissionAction("
STUDENT_IMPORT = 'import { submitStudentTryout } from "@/lib/student/tryout-submit";'
OPERATIONS_CHECK = "test('web and native evaluation share disclosures before projecting protected question data'"
INSIGHT_MODEL = "'lib/admin/quiz-insight-read-model.ts'"


def submit_action(source):
    if source.count(SUBMIT) != 1 or source.count(GRADE) != 1:
        raise ValueError("The Student and Academic action boundaries changed")
    start = source.index(SUBMIT)
    end = source.index(GRADE, start)
    return source[start:end]


def replace_once(source, previous, replacement):
    if source.count(previous) != 1:
        raise ValueError(f"Unexpected occurrences of {previous.strip()}")
    return source.replace(previous, replacement, 1)


def combine_tutor_actions(student, academic):
    student_submit = submit_action(student)
    if STUDENT_IMPORT not in student or "await submitStudentTryout(" not in student_submit:
        raise ValueError("Expected the Student tryout service in the reviewed action")
    combined = replace_once(academic, submit_action(academic), student_submit)
    combined = replace_once(combined, 'import { resolveCourseAccess } from "@/lib/student/course-access";', STUDENT_IMPORT)
    combined = replace_once(combined, "  isSqliteBusyError,\n", "")
    return replace_once(combined, "  isUniqueConstraintError,\n", "")


def combine_disclosure_checks(academic, operations):
    if operations.count(OPERATIONS_CHECK) != 1 or OPERATIONS_CHECK in academic:
        raise ValueError("The Operations disclosure check changed")
    combined = academic
    for page in ("questions", "distractors"):
        combined = replace_once(combined, f"'app/(admin)/admin/(eval)/{page}/page.tsx', ", "")
    insight_check = "\n".join((
        " const insight = source('app/api/admin/quiz-insights/[id]/route.ts');",
        " expect(insight).toContain('await readAdminQuizInsight(id, session.user.id)');",
        " expect(insight.indexOf('await readAdminQuizInsight(')).toBeLessThan(insight.indexOf('return NextResponse.json(result)'));",
    ))
    # Keep the route-delegation assertion beside the model's disclosure assertion.
    line = next(line for line in combined.splitlines() if INSIGHT_MODEL in line)
    combined = replace_once(combined, line, insight_check + "\n" + line)
    return combined.rstrip() + "\n\n" + operations[operations.index(OPERATIONS_CHECK):]


def combine_offline_library(offline, student):
    clear_target = "  onClearTarget?: () => void;\n"
    clear_target_action = """          {onClearTarget && (
            <SharedUiActionButton action={{ id: "all-readings", label: copy.allReadings, variant: "outline" }} onAction={onClearTarget} />
          )}
"""
    if clear_target not in student or clear_target_action not in student:
        raise ValueError("The Student offline target control changed")
    combined = replace_once(offline, "  onRefresh?: () => void;\n", clear_target + "  onRefresh?: () => void;\n")
    combined = replace_once(combined, "  onQuery, onRefresh, onPurgeUnavailable,", "  onQuery, onClearTarget, onRefresh, onPurgeUnavailable,")
    return replace_once(combined, "          {onRefresh && (\n", clear_target_action + "          {onRefresh && (\n")


def catalog_blocks(source):
    # Only standalone named Bun tests belong here. Reject new top-level code for review.
    pattern = r'^test\("([^"\n]+)", \(\) => \{\n.*?^\}\);[ \t]*$'
    matches = list(re.finditer(pattern, source, re.MULTILINE | re.DOTALL))
    if not matches:
        raise ValueError("No named catalog tests found")
    prefix = source[:matches[0].start()]
    blocks = {}
    end = len(prefix)
    for match in matches:
        name = match[1]
        if name in blocks or source[end:match.start()].strip() or "\ntest(" in match[0]:
            raise ValueError("Unrecognized catalog test structure")
        blocks[name] = match[0]
        end = match.end()
    if source[end:].strip():
        raise ValueError("Unexpected code following catalog tests")
    return prefix, blocks


def combine_catalog_checks(base, ours, theirs):
    header, original = catalog_blocks(base)
    our_header, current = catalog_blocks(ours)
    their_header, incoming = catalog_blocks(theirs)
    if not header == our_header == their_header or not original.keys() <= current.keys() & incoming.keys():
        raise ValueError("Catalog imports or existing test names changed")
    for name, block in incoming.items():
        previous = original.get(name)
        existing = current.get(name)
        if existing is None or existing == previous:
            current[name] = block
        elif block != previous and block != existing:
            raise ValueError(f"Competing changes to catalog test {name}")
    return header + "\n\n".join(current.values()) + "\n"


REVIEWED = {
    "app/actions/tutor-management.ts": (combine_tutor_actions, (
        "6a120d445b0f1556d1bad1b4bdf726b28e5bf887",
        "fa7dbf5c667cf6c09d6d11605d009fc87836ab7b",
        "cc4f3739af8158d6348c1dc3f91404c1d4d8cad3",
    )),
    "tests/gamification/question-disclosure-calls.test.ts": (combine_disclosure_checks, (
        "3c38389c1281bc19b3547ba77ecc0e4c7348829e",
        "8ee7a56473fa675df632b44a7fe029ea78ea675c",
        "4885627aaf0124bedf92991befcc551bf05fbb58",
    )),
    "apps/mobile-native/offline/library-view.tsx": (combine_offline_library, (
        "4892cdae3d4034e82564f4b47bd9eca06fb2f823",
        "47dfdd0b6de8f41710be89b625f83e96a0918ef0",
        "e5effb595b5d85823a8ac9973d6c1549b9a64b35",
    )),

}


if __name__ == "__main__":
    path = sys.argv[1]
    stages = tuple(f":{stage}:{path}" for stage in (1, 2, 3))
    if path == "tests/contracts/admin-mcp-catalog.test.ts":
        contents = (subprocess.check_output(["git", "show", stage], text=True) for stage in stages)
        Path(path).write_text(combine_catalog_checks(*contents))
        sys.exit(0)
    combine, expected = REVIEWED[path]
    blobs = tuple(subprocess.check_output(["git", "rev-parse", stage], text=True).strip() for stage in stages)
    if blobs == (expected[0], expected[2], expected[1]):
        # The same reviewed inputs can arrive in reverse order once a lane lands.
        stages = (stages[0], stages[2], stages[1])
        blobs = (blobs[0], blobs[2], blobs[1])
    if blobs != expected:
        raise SystemExit(f"{path} needs review for these three input blobs: {', '.join(blobs)}")
    ours, theirs = (subprocess.check_output(["git", "show", stage], text=True) for stage in stages[1:])
    Path(path).write_text(combine(ours, theirs))

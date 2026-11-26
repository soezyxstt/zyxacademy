"""Resolve independent feature and test hunks for the exact reviewed CI inputs."""

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


REVIEWED = {
    "app/actions/tutor-management.ts": (combine_tutor_actions, (
        "6a120d445b0f1556d1bad1b4bdf726b28e5bf887",
        "fa7dbf5c667cf6c09d6d11605d009fc87836ab7b",
        "12f2cf10a8aa9689c4b1cecd00ee789905bb4430",
    )),
    "tests/gamification/question-disclosure-calls.test.ts": (combine_disclosure_checks, (
        "3c38389c1281bc19b3547ba77ecc0e4c7348829e",
        "8ee7a56473fa675df632b44a7fe029ea78ea675c",
        "4885627aaf0124bedf92991befcc551bf05fbb58",
    )),
}


if __name__ == "__main__":
    path = sys.argv[1]
    combine, expected = REVIEWED[path]
    stages = tuple(f":{stage}:{path}" for stage in (1, 2, 3))
    blobs = tuple(subprocess.check_output(["git", "rev-parse", stage], text=True).strip() for stage in stages)
    if blobs != expected:
        raise SystemExit(f"{path} needs review for these three input blobs: {', '.join(blobs)}")
    ours, theirs = (subprocess.check_output(["git", "show", stage], text=True) for stage in stages[1:])
    Path(path).write_text(combine(ours, theirs))

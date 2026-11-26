import unittest

from merge_reviewed_preview import (
    OPERATIONS_CHECK,
    STUDENT_IMPORT,
    combine_catalog_checks,
    combine_disclosure_checks,
    combine_tutor_actions,
)


class ReviewedPreviewTests(unittest.TestCase):
    def test_combine_independent_named_catalog_checks_without_losing_assertions(self):
        def check(name, assertion):
            return f'test("{name}", () => {{\n  expect({assertion}).toBe(true);\n}});\n'
        base = check("shared", "base")
        changed = check("shared", "updated")
        ours = changed + check("student", "learner")
        theirs = base + check("academic", "course")
        combined = combine_catalog_checks(base, ours, theirs)
        for check_body in (changed, check("student", "learner"), check("academic", "course")):
            self.assertIn(check_body, combined)
        with self.assertRaises(ValueError):
            combine_catalog_checks(base, ours, check("shared", "competing"))
        with self.assertRaises(ValueError):
            combine_catalog_checks(base, ours, check("academic", "course"))

    def test_keep_student_submit_and_academic_authoring_and_grading(self):
        student = STUDENT_IMPORT + """
export async function submitTryoutAction(input) {
  return await submitStudentTryout(input);
}

export async function gradeSubmissionAction(input) {
  return gradeLegacySubmission(input);
}
"""
        academic = """
import { resolveCourseAccess } from "@/lib/student/course-access";
import {
  isSqliteBusyError,
  isUniqueConstraintError,
  recordTutorFailureAudit,
} from "@/lib/tutor/assessment-policy";
export async function saveTryoutAction(input) {
  const previous = await lockTryoutExam(input);
  return saveTryoutRecord(input, previous);
}
export async function submitTryoutAction(input) {
  return resolveCourseAccess(input);
}
export async function gradeSubmissionAction(input, expectedRevision) {
  return gradeTryoutSubmission(input, expectedRevision);
}
"""
        result = combine_tutor_actions(student, academic)
        self.assertIn(STUDENT_IMPORT, result)
        self.assertIn("await submitStudentTryout(input);", result)
        self.assertIn("await lockTryoutExam(input);", result)
        self.assertIn("return saveTryoutRecord(input, previous);", result)
        self.assertIn("return gradeTryoutSubmission(input, expectedRevision);", result)
        self.assertIn("recordTutorFailureAudit", result)
        self.assertNotIn("resolveCourseAccess", result)
        self.assertNotIn("isUniqueConstraintError", result)
        self.assertNotIn("gradeLegacySubmission", result)
        with self.assertRaises(ValueError):
            combine_tutor_actions(student.replace("await submitStudentTryout", "submitStudentTryout"), academic)

    def test_keep_disclosure_assertions_at_each_shared_read_boundary(self):
        academic = """
expect(source('lib/tutor/tryout-grading-read-model.ts')).toContain('recordStaffCourseDisclosures(tx');
for (const path of ['app/(admin)/admin/(eval)/questions/page.tsx', 'app/(admin)/admin/(eval)/distractors/page.tsx', 'lib/admin/quiz-insight-read-model.ts']) {
 expect(source(path)).toContain('recordAuthorizedGlobalDisclosures(tx');
}
"""
        operations = OPERATIONS_CHECK + """, () => {
 expect(web.indexOf('await assertTutorOrAdmin()')).toBeLessThan(web.indexOf('await readQuestionBank('));
 expect(model).toContain('await db.transaction(tx => recordAuthorizedGlobalDisclosures(tx');
});
"""
        result = combine_disclosure_checks(academic, operations)
        self.assertIn("lib/tutor/tryout-grading-read-model.ts", result)
        self.assertIn("lib/admin/quiz-insight-read-model.ts", result)
        self.assertIn("await readAdminQuizInsight(id, session.user.id)", result)
        self.assertTrue(result.endswith(operations))
        self.assertNotIn("app/(admin)/admin/(eval)/questions/page.tsx", result)
        self.assertNotIn("app/(admin)/admin/(eval)/distractors/page.tsx", result)


if __name__ == "__main__":
    unittest.main()

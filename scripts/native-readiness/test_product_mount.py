import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent / "product"))
import mount as product_mount


class ProductMountTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.mobile = Path(directory.name) / "apps/mobile-native"
        mobile = patch.object(product_mount, "MOBILE", self.mobile)
        mobile.start()
        self.addCleanup(mobile.stop)
        self.write("app/index.tsx", (product_mount.ROOT / "apps/mobile-native/app/index.tsx").read_text())
        self.write("app/_layout.tsx", 'import { nativeFontSources } from "../typography";\n<NativeAccountContextProvider>\n')
        for feature, anchor in {
            "academic/index.ts": "",
            "operations/index.ts": "",
            "academic/assessment/grading.tsx": 'const [attemptId, setAttemptId] = useState(query.attemptId || "");',
            "academic/tutor/connected.tsx": 'export function ConnectedLive({ data, theme, back, courseTitle, refresh }: Navigation & { data: TutorLiveData; courseTitle?: string; refresh(): void }) {',
            "operations/management/tools.tsx": "const thread = matching?.find(item => item.id === active);",
        }.items():
            self.write("features/" + feature, f"import {{ useState }} from 'react';\n  {anchor}\n")

    def write(self, relative, content):
        path = self.mobile / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def read(self, relative):
        return (self.mobile / relative).read_text()

    def snapshot(self):
        return {path.relative_to(self.mobile): path.read_text() for path in self.mobile.rglob("*") if path.is_file()}

    def mount(self, *, with_student=True):
        with contextlib.redirect_stdout(io.StringIO()):
            product_mount.mount(with_student=with_student)

    def add_student(self):
        for feature, anchor in {
            "VerifiedStudentEntry.tsx": "",
            "assessment-drafts.tsx": '''const { subscribeBeforeLogout } = useNativeSession();
  useEffect(() => subscribeBeforeLogout(cleanup => repository.purgeSession(cleanup.scope)), [subscribeBeforeLogout]);''',
            "learning/flashcards.tsx": "const card = index < batchSize ? queue[position] : undefined;",
            "courses/index.tsx": "const { course, material } = data;",
        }.items():
            self.write("features/student/" + feature, f"import {{ useEffect }} from 'react';\n  {anchor}\n")
        self.write("features/student/assessment/client.ts", '  const response = await request(assessmentApiPath(path), init);\n')
        self.write("features/student/assessment/player.tsx", '''import { useEffect } from "react";
  const props = useAssessment();
  const submit = useCallback(async () => {
    if (!current || pendingRequest.current || uploadInProgress.current) return;
    try {
      let destination = `${course}/my-results`;
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof AssessmentRequestError) return;
    }
  }, [attemptId, base, course, drafts, kind, player.questions, replace, request, stage, storageKey, tx, update]);
  useEffect(() => {
    if (totalLeft !== 0 || !draft || uploading || auto.current || draft.pending) return;
  }, [draft, kind, submit, totalLeft, tryout.timeExpired, tx, uploading]);
  useEffect(() => {
    if (!draft || draft.pending || questionLeft !== 0 || totalLeft === 0 || confirm || uploading) return;
  }, [confirm, draft, messages.quiz.questionTimeEnded, messages.quiz.questionTimeEndedFinal, player.questions.length, questionLeft, totalLeft, update, uploading]);
    <Modal transparent visible={confirm} animationType="none" onRequestClose={() => setConfirm(false)}>
      <Button onPress={() => setConfirm(false)}>{tryout.reviewAgain}</Button>
    </Modal>
''')

    def test_mount_without_student_then_upgrade_and_repeat(self):
        self.mount(with_student=False)
        without_student = self.snapshot()
        self.mount(with_student=False)
        self.assertEqual(self.snapshot(), without_student)
        self.assertIn('productRoute("/courses", "student")', self.read("app/courses.tsx"))
        self.assertIn('productRoute("/dashboard", "student")', self.read("app/dashboard.tsx"))
        self.assertIn('productLocation("/dashboard"', self.read("app/murid.tsx"))
        index = self.read("app/index.tsx")
        self.assertIn('state.status === "signed-out") return <Redirect href="/sign-in" />', index)
        self.assertIn('publicWebRoute("/blog/[slug]")', self.read("app/blog/[slug].tsx"))
        self.assertIn('if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW === "1" || '
                      'process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION === "1") {\n'
                      '    return <Redirect href="/gallery/separator" />;\n  }', index)
        self.assertIn("<AuthSessionStatus", index)
        self.assertNotIn("features/student", self.read("routing/ProductRoute.tsx"))
        self.assertNotIn("features/student", self.read("routing/personal-account-entry.ts"))
        self.assertNotIn("AssessmentDraftCleanup", self.read("app/_layout.tsx"))
        self.assertFalse((self.mobile / "app/dashboard/discussions.tsx").exists())
        self.assertFalse((self.mobile / "routing/StudentProductRoute.tsx").exists())

        self.add_student()
        self.mount()
        with_student = self.snapshot()
        self.mount()
        self.assertEqual(self.snapshot(), with_student)
        changed = {str(path) for path, old in without_student.items() if with_student[path] != old}
        self.assertEqual(changed, {"app/dashboard.tsx", "app/courses.tsx", "app/_layout.tsx", "routing/personal-account-entry.ts"})
        self.assertIn('productRoute("/courses", "student", StudentProductRoute)', self.read("app/courses.tsx"))
        self.assertIn('productRoute("/dashboard", "student", StudentProductRoute)', self.read("app/dashboard.tsx"))
        self.assertIn('productRoute("/dashboard/discussions", "student", StudentProductRoute)',
                      self.read("app/dashboard/discussions.tsx"))
        self.assertIn("<AssessmentDraftCleanup />", self.read("app/_layout.tsx"))
        self.assertIn("features/student/community/StaffAccountScreen", self.read("routing/personal-account-entry.ts"))
        self.assertIn("subscribeBeforeLocalLogout", self.read("features/student/assessment-drafts.tsx"))
        self.assertIn('requiredRole: "murid"', self.read("features/student/assessment/client.ts"))
        player = self.read("features/student/assessment/player.tsx")
        self.assertIn('visible={confirm && !suspended && props.focused !== false}', player)
        self.assertIn('if (suspended || !canInteract() || totalLeft !== 0', player)
        self.assertIn('if (suspended || !canInteract() || !draft || draft.pending || questionLeft !== 0', player)
        self.assertIn('if (!canInteract()) throw new NativeRequestNotDispatched();', player)
        self.assertIn('if (error instanceof NativeRequestNotDispatched) {\n'
                      '        auto.current = false;\n        await update(current);\n        return;\n', player)

    def test_verify_checks_actual_committed_routes_without_rewriting_features(self):
        self.add_student()
        self.mount()
        self.write("features/academic/tutor/connected.tsx", "export function ConnectedLive() { return null; }")
        snapshot = self.snapshot()
        with contextlib.redirect_stdout(io.StringIO()):
            product_mount.verify_product_routes()
        self.assertEqual(self.snapshot(), snapshot)
        self.write("app/dashboard.tsx", 'export default publicWebRoute("/dashboard");')
        with self.assertRaisesRegex(ValueError, "incorrect Expo entry for /dashboard"):
            product_mount.verify_product_routes()
        self.assertIn("publicWebRoute", self.read("app/dashboard.tsx"))

    def test_full_mount_requires_student_before_writing_and_refuses_edited_dashboard(self):
        original = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Missing external lane entry: student/"):
            self.mount()
        self.assertEqual(self.snapshot(), original)

        self.mount(with_student=False)
        self.add_student()
        self.write("app/dashboard.tsx", "// Route owned by the checkout\n")
        with self.assertRaisesRegex(ValueError, "requires review: .*dashboard.tsx"):
            self.mount()
        self.assertEqual(self.read("app/dashboard.tsx"), "// Route owned by the checkout\n")


if __name__ == "__main__":
    unittest.main()

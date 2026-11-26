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
        self.write("app/index.tsx", '''import { Redirect } from "expo-router";
export default function App() {
  const { state, loginIntent } = useNativeSession();
  const network = useNetworkState();
  if (state.status === "signed-in" && loginIntent) return <AuthContinuation />;
  return <Redirect href="/gallery/separator" />;
}
''')
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
            "assessment/player.tsx": "const props = useAssessment();",
            "learning/flashcards.tsx": "const card = index < batchSize ? queue[position] : undefined;",
            "courses/index.tsx": "const { course, material } = data;",
        }.items():
            self.write("features/student/" + feature, f"import {{ useEffect }} from 'react';\n  {anchor}\n")

    def test_mount_without_student_then_upgrade_and_repeat(self):
        self.mount(with_student=False)
        without_student = self.snapshot()
        self.mount(with_student=False)
        self.assertEqual(self.snapshot(), without_student)
        self.assertIn('productRoute("/courses", "student")', self.read("app/courses.tsx"))
        self.assertIn('productRoute("/dashboard", "student")', self.read("app/dashboard.tsx"))
        self.assertIn('productLocation("/dashboard"', self.read("app/murid.tsx"))
        index = self.read("app/index.tsx")
        self.assertIn('productRoute("/", "public")', index)
        self.assertIn('if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW === "1" || '
                      'process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION === "1") {\n'
                      '    return <Redirect href="/gallery/separator" />;\n  }', index)
        self.assertTrue(index.endswith('  return <PublicLanding />;\n}\n'))
        self.assertNotIn("features/student", self.read("routing/ProductRoute.tsx"))
        self.assertNotIn("AssessmentDraftCleanup", self.read("app/_layout.tsx"))
        self.assertFalse((self.mobile / "app/dashboard/discussions.tsx").exists())
        self.assertFalse((self.mobile / "routing/StudentProductRoute.tsx").exists())

        self.add_student()
        self.mount()
        with_student = self.snapshot()
        self.mount()
        self.assertEqual(self.snapshot(), with_student)
        changed = {str(path) for path, old in without_student.items() if with_student[path] != old}
        self.assertEqual(changed, {"app/dashboard.tsx", "app/courses.tsx", "app/_layout.tsx"})
        self.assertIn('productRoute("/courses", "student", StudentProductRoute)', self.read("app/courses.tsx"))
        self.assertIn('productRoute("/dashboard", "student", StudentProductRoute)', self.read("app/dashboard.tsx"))
        self.assertIn('productRoute("/dashboard/discussions", "student", StudentProductRoute)',
                      self.read("app/dashboard/discussions.tsx"))
        self.assertIn("<AssessmentDraftCleanup />", self.read("app/_layout.tsx"))
        self.assertIn("subscribeBeforeLocalLogout", self.read("features/student/assessment-drafts.tsx"))

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

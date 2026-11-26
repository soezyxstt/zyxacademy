"""Install the reviewed lane entry points into the combined checkout for CI or integration."""
import csv
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MOBILE = ROOT / "apps/mobile-native"


def inventory():
    result = {}
    with (ROOT / "plans/native-parallel/routes.tsv").open() as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            owner, source = row["owner"], row["web_source"]
            if owner == "integration":
                continue
            parts = [part for part in Path(source).parts[1:-1] if not part.startswith("(")]
            pattern = "/" + "/".join(parts)
            if pattern in result:
                raise ValueError(f"Two owners of {pattern}")
            result[pattern] = "public" if "/(marketing)/" in source else owner
    return result


def put(path, content):
    if path.exists() and path.read_text() != content:
        raise ValueError(f"Existing route or integration file requires review: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def rewrite_once(path, before, after):
    source = path.read_text()
    if after in source:
        return
    if source.count(before) != 1:
        raise ValueError(f"Review the updated host contract in {path}")
    path.write_text(source.replace(before, after))


def insert_hook(path, hook_import, anchor, hook):
    first_import = path.read_text().splitlines()[0]
    if first_import != hook_import:
        rewrite_once(path, first_import, f"{hook_import}\n{first_import}")
    rewrite_once(path, anchor, f"{anchor}\n  {hook}")


def mount():
    for feature in ["student/VerifiedStudentEntry.tsx", "operations/index.ts", "academic/index.ts"]:
        if not (MOBILE / "features" / feature).is_file():
            raise ValueError(f"Missing external lane entry: {feature}")
    routes = inventory()
    destination = MOBILE / "routing/ProductRoute.tsx"
    put(destination, (HERE / "ProductRoute.tsx.in").read_text())
    # Use a real file per canonical URL. Expo's sitemap can then validate login
    # continuation without admitting unknown dynamic or internal fixture routes.
    for pattern, owner in routes.items():
        if pattern == "/":
            continue
        file = MOBILE / "app" / (pattern[1:] + ".tsx")
        module = os.path.relpath(destination.with_suffix(""), file.parent)
        put(file, f'import {{ productRoute }} from "{module}";\n\nexport default productRoute("{pattern}", "{owner}");\n')

    root = MOBILE / "app/index.tsx"
    rewrite_once(root, 'import { Redirect } from "expo-router";',
                 'import { Redirect } from "expo-router";\nimport { productRoute } from "../routing/ProductRoute";\n\nconst PublicLanding = productRoute("/", "public");')
    rewrite_once(root, 'if (state.status === "signed-in" && loginIntent)', 'if (state.status === "signed-in")')
    rewrite_once(root, 'const { state, loginIntent } = useNativeSession();', 'const { state } = useNativeSession();')
    rewrite_once(root, 'return <Redirect href="/gallery/separator" />;', 'return <PublicLanding />;')
    put(MOBILE / "app/murid.tsx", 'import { Redirect } from "expo-router";\n\nexport default function MuridHome() {\n  return <Redirect href="/dashboard" />;\n}\n')
    # The lane's draft repository runs on a credential-free logout, including
    # cold restarts following expired or revoked sessions.
    drafts = MOBILE / "features/student/assessment-drafts.tsx"
    rewrite_once(drafts, 'const { subscribeBeforeLogout } = useNativeSession();\n  useEffect(() => subscribeBeforeLogout(cleanup => repository.purgeSession(cleanup.scope)), [subscribeBeforeLogout]);',
                 'const { subscribeBeforeLocalLogout } = useNativeSession();\n  useEffect(() => subscribeBeforeLocalLogout(repository.purgeSession), [subscribeBeforeLocalLogout]);')
    chrome_hooks = {
        "assessment/player.tsx": ('const props = useAssessment();', 'useStudentChromeVisibility({ hideBottom: true });'),
        "learning/flashcards.tsx": (
            'const card = index < batchSize ? queue[position] : undefined;',
            'useStudentChromeVisibility({ hideBottom: Boolean(card) });',
        ),
        "courses/index.tsx": (
            'const { course, material } = data;',
            'useStudentChromeVisibility({ hideTop: !material.locked && material.kind === "article" });',
        ),
    }
    for name, (anchor, hook) in chrome_hooks.items():
        insert_hook(MOBILE / "features/student" / name,
                    'import { useStudentChromeVisibility } from "../../../routing/student-chrome";', anchor, hook)
    staff_hooks = {
        "academic/assessment/grading.tsx": (
            'const [attemptId, setAttemptId] = useState(query.attemptId || "");',
            'useStaffChromeVisibility({ hideTop: Boolean(attemptId), hideBottom: Boolean(attemptId) });',
        ),
        "academic/tutor/connected.tsx": (
            'export function ConnectedLive({ data, theme, back, courseTitle, refresh }: Navigation & { data: TutorLiveData; courseTitle?: string; refresh(): void }) {',
            'useStaffChromeVisibility({ hideBottom: Boolean(data.active) });',
        ),
        "operations/management/tools.tsx": (
            'const thread = matching?.find(item => item.id === active);',
            'useStaffChromeVisibility({ hideTop: Boolean(thread), hideBottom: Boolean(thread) });',
        ),
    }
    for name, (anchor, hook) in staff_hooks.items():
        insert_hook(MOBILE / "features" / name,
                    'import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";', anchor, hook)
    layout = MOBILE / "app/_layout.tsx"
    cleanup_import = 'import { AssessmentDraftCleanup } from "../features/student/assessment-drafts";'
    if cleanup_import not in layout.read_text():
        rewrite_once(layout, 'import { nativeFontSources }', f'{cleanup_import}\nimport {{ nativeFontSources }}')
    if '<AssessmentDraftCleanup />' not in layout.read_text():
        rewrite_once(layout, '<NativeAccountContextProvider>', '<NativeAccountContextProvider>\n          <AssessmentDraftCleanup />')
    print(f"Mounted {len(routes)} canonical external routes and the Murid redirect.")


if __name__ == "__main__":
    mount()

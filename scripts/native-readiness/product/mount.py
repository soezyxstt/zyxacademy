"""Install the reviewed lane entry points into the combined checkout for CI or integration."""
import argparse
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


def put(path, content, *, replace=None):
    if path.exists():
        current = path.read_text()
        if current == content:
            return
        if current != replace:
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
    imports = path.read_text().splitlines()
    if hook_import not in imports:
        rewrite_once(path, imports[0], f"{hook_import}\n{imports[0]}")
    rewrite_once(path, anchor, f"{anchor}\n  {hook}")


def route_source(file, pattern, owner, *, student=False):
    routing = MOBILE / "routing"
    if owner == "public":
        module = os.path.relpath(routing / "PublicWebsiteRoute", file.parent)
        return f'import {{ publicWebRoute }} from "{module}";\n\nexport default publicWebRoute("{pattern}");\n'
    product = os.path.relpath(routing / "ProductRoute", file.parent)
    imports = f'import {{ productRoute }} from "{product}";\n'
    entry = ""
    if student:
        module = os.path.relpath(routing / "StudentProductRoute", file.parent)
        imports += f'import {{ StudentProductRoute }} from "{module}";\n'
        entry = ", StudentProductRoute"
    return f'{imports}\nexport default productRoute("{pattern}", "{owner}"{entry});\n'


def verify_product_routes():
    """Check committed Expo entry points against their owners, without rewriting feature code."""
    routes = inventory()
    for pattern, owner in routes.items():
        if pattern == "/":
            continue
        path = MOBILE / "app" / (pattern[1:] + ".tsx")
        expected = route_source(path, pattern, owner, student=owner == "student")
        if not path.is_file() or path.read_text() != expected:
            raise ValueError(f"Missing or incorrect Expo entry for {pattern}: {path}")
    for path in ("routing/ProductRoute.tsx", "routing/StudentProductRoute.tsx", "app/murid.tsx"):
        if not (MOBILE / path).is_file():
            raise ValueError(f"Missing product route host: {path}")
    print(f"Verified {sum(owner != 'public' for owner in routes.values())} committed private routes and their public handoffs.")


def mount(*, with_student=True):
    features = ["operations/index.ts", "academic/index.ts"]
    if with_student:
        features.append("student/VerifiedStudentEntry.tsx")
    for feature in features:
        if not (MOBILE / "features" / feature).is_file():
            raise ValueError(f"Missing external lane entry: {feature}")
    routes = {pattern: owner for pattern, owner in inventory().items() if with_student or owner != "student"}
    put(MOBILE / "routing/ProductRoute.tsx", (HERE / "ProductRoute.tsx.in").read_text())
    if with_student:
        put(MOBILE / "routing/StudentProductRoute.tsx", (HERE / "StudentProductRoute.tsx.in").read_text())
    # Use a real file per canonical URL. Expo's sitemap can then validate login
    # continuation without admitting unknown dynamic or internal fixture routes.
    for pattern, owner in routes.items():
        if pattern == "/":
            continue
        file = MOBILE / "app" / (pattern[1:] + ".tsx")
        fallback = route_source(file, pattern, owner) if pattern in ("/dashboard", "/courses") else None
        put(file, route_source(file, pattern, owner, student=owner == "student"), replace=fallback)

    if not with_student:
        for path in ("/dashboard", "/courses"):
            file = MOBILE / "app" / (path[1:] + ".tsx")
            put(file, route_source(file, path, "student"))

    put(MOBILE / "app/murid.tsx", (HERE / "MuridRoute.tsx.in").read_text())

    mount_staff_chrome()
    if with_student:
        mount_student_integration()

    native_count = sum(owner != "public" for owner in routes.values())
    print(f"Mounted {native_count} private product routes with public browser handoffs and the Murid alias."
          + (" Student dashboard opens in the browser." if not with_student else ""))


def mount_student_integration():
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
    mount_student_assessment_verification()

    layout = MOBILE / "app/_layout.tsx"
    cleanup_import = 'import { AssessmentDraftCleanup } from "../features/student/assessment-drafts";'
    rewrite_once(layout, 'import { nativeFontSources }', f'{cleanup_import}\nimport {{ nativeFontSources }}')
    rewrite_once(layout, '<NativeAccountContextProvider>', '<NativeAccountContextProvider>\n          <AssessmentDraftCleanup />')


def mount_student_assessment_verification():
    assessment = MOBILE / "features/student/assessment"
    client = assessment / "client.ts"
    rewrite_once(client, '  const response = await request(assessmentApiPath(path), init);',
                 '  const scoped = init && { ...init, requiredRole: "murid" as const };\n'
                 '  const response = await request(assessmentApiPath(path), scoped);')
    player = assessment / "player.tsx"
    hooks = '  const props = useAssessment();\n  useStudentChromeVisibility({ hideBottom: true });'
    rewrite_once(player, 'import { useStudentChromeVisibility }',
                 'import { NativeRequestNotDispatched } from "../../../network/transport";\n'
                 'import { useProtectedInteraction } from "../../../routing/protected-interaction";\n'
                 'import { useStudentChromeVisibility }')
    changes = [
        (hooks, hooks + '\n  const { suspended, canInteract } = useProtectedInteraction();'),
        ('if (!current || pendingRequest.current || uploadInProgress.current) return;',
         'if (!canInteract() || !current || pendingRequest.current || uploadInProgress.current) return;'),
        ('      let destination = `${course}/my-results`;',
         '      if (!canInteract()) throw new NativeRequestNotDispatched();\n      let destination = `${course}/my-results`;'),
        ('      if (!alive.current) return;\n      if (error instanceof AssessmentRequestError',
         '      if (!alive.current) return;\n'
         '      if (error instanceof NativeRequestNotDispatched) {\n'
         '        auto.current = false;\n'
         '        await update(current);\n'
         '        return;\n'
         '      }\n'
         '      if (error instanceof AssessmentRequestError'),
        ('[attemptId, base, course, drafts, kind, player.questions, replace, request, stage, storageKey, tx, update]',
         '[attemptId, base, canInteract, course, drafts, kind, player.questions, replace, request, stage, storageKey, tx, update]'),
        ('if (totalLeft !== 0 || !draft || uploading || auto.current || draft.pending) return;',
         'if (suspended || !canInteract() || totalLeft !== 0 || !draft || uploading || auto.current || draft.pending) return;'),
        ('[draft, kind, submit, totalLeft, tryout.timeExpired, tx, uploading]',
         '[canInteract, draft, kind, submit, suspended, totalLeft, tryout.timeExpired, tx, uploading]'),
        ('if (!draft || draft.pending || questionLeft !== 0 || totalLeft === 0 || confirm || uploading) return;',
         'if (suspended || !canInteract() || !draft || draft.pending || questionLeft !== 0 || totalLeft === 0 || confirm || uploading) return;'),
        ('[confirm, draft, messages.quiz.questionTimeEnded, messages.quiz.questionTimeEndedFinal, player.questions.length, questionLeft, totalLeft, update, uploading]',
         '[canInteract, confirm, draft, messages.quiz.questionTimeEnded, messages.quiz.questionTimeEndedFinal, player.questions.length, questionLeft, suspended, totalLeft, update, uploading]'),
        ('    <Modal transparent visible={confirm} animationType="none" onRequestClose={() => setConfirm(false)}>',
         '    <Modal transparent visible={confirm && !suspended && props.focused !== false} animationType="none"\n'
         '      onRequestClose={() => { if (canInteract()) setConfirm(false); }}>'),
        ('onPress={() => setConfirm(false)}>{tryout.reviewAgain}',
         'onPress={() => { if (canInteract()) setConfirm(false); }}>{tryout.reviewAgain}'),
    ]
    for before, after in changes:
        rewrite_once(player, before, after)


def mount_staff_chrome():
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--without-student", action="store_true",
                        help="Mount Academic, Operations and public pages, plus the Student dashboard browser handoff.")
    parser.add_argument("--verify", action="store_true", help="Read and verify the committed four-lane Expo routes.")
    args = parser.parse_args()
    if args.verify:
        verify_product_routes()
    else:
        mount(with_student=not args.without_student)

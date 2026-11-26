import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { matchStudentRoute, studentPatterns, type StudentArea } from "../../../../apps/mobile-native/features/student/routes";

// Generate smoke metadata first, then run this script. Optional platform summary
// files can be passed with --android=... and --ios=...; absent data is not a pass.
const manifestPath = process.argv.find(arg => arg.startsWith("--manifest="))?.slice(11) ?? "artifacts/student-evidence/generated/manifest.json";
const summaries = Object.fromEntries((["android", "ios"] as const).map(platform => {
  const path = process.argv.find(arg => arg.startsWith(`--${platform}=`))?.slice(platform.length + 3)
    ?? `artifacts/student-evidence/${platform}/smoke/smoke-summary.json`;
  return [platform, existsSync(path) ? { path, data: JSON.parse(readFileSync(path, "utf8")) } : null];
}));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const web = JSON.parse(readFileSync("tests/visual/native-parallel/student/product/web/web.json", "utf8"));
const webRoot = "tests/visual/native-parallel/student/product/web";
const base = "packages/native-parity/student/evidence";
const ciHistory = JSON.parse(readFileSync(`${base}/ci-history.json`, "utf8"));
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const c = "/api/native/student/courses";
const l = "/api/native/student/learning";
const a = "/api/native/student/assessment/[courseId]";
const u = "/api/native/student/community";
// Route-specific operation IDs point to existing HTTP contracts or explicit
// handoffs. Full input, authorization and retry details remain in area docs.
const operations: Record<string, string[]> = {
  "/dashboard": [`GET ${c}?view=dashboard`, `GET ${c}?view=dashboard-extras`, `POST ${c} token`, "POST /api/student/today/complete", "POST /api/student/interventions/[id]/dismiss"],
  "/courses": [`GET ${c}?view=catalog`],
  "/courses/[id]": [`GET ${c}?view=course`, `POST ${c} token`],
  "/courses/[id]/material": [`GET ${c}?view=material-list`],
  "/courses/[id]/material/[materialId]": [`GET ${c}?view=material-detail`, `POST ${c} token`],
  "/courses/[id]/quiz": [`GET ${a}/quiz`],
  "/courses/[id]/quiz/[quizId]": [`GET ${a}/quiz/[quizId]`, `POST ${a}/quiz/[quizId]`, `POST ${a}/quiz/[quizId]/attempt/[attemptId]`, `POST ${a}/quiz/[quizId]/attachment`, `DELETE ${a}/quiz/[quizId]/attachment`],
  "/courses/[id]/quiz/[quizId]/summary/[attemptId]": [`GET ${a}/quiz/[quizId]/summary/[attemptId]`, `POST ${a}/quiz/[quizId]/summary/[attemptId]`],
  "/courses/[id]/tryout": [`GET ${a}/tryout`],
  "/courses/[id]/tryout/[tryoutId]": [`GET ${a}/tryout/[tryoutId]`, `POST ${a}/tryout/[tryoutId]`, `POST ${a}/tryout/[tryoutId]/attachment`],
  "/courses/[id]/my-results": [`GET ${a}/my-results`],
  "/courses/[id]/my-results/[submissionId]": [`GET ${a}/my-results/[submissionId]`],
  "/courses/[id]/my-results/[submissionId]/summary": [`GET ${a}/my-results/[submissionId]/summary`, `POST ${a}/my-results/[submissionId]/summary`],
  "/courses/[id]/solutions/[collectionId]": [`GET ${a}/solutions/[collectionId]`, `POST ${a}/solutions/[collectionId]`],
  "/courses/[id]/concept/[slug]": [`GET ${l}?view=concept`],
  "/courses/[id]/flashcard": [`GET ${l}?view=flashcard`, `POST ${l} flashcard-review`],
  "/courses/[id]/mastery": [`GET ${l}?view=mastery`],
  "/courses/[id]/path": [`GET ${l}?view=path`, "GET /api/student/study-path"],
  "/courses/[id]/playground": [`GET ${l}?view=playground`, "Browser handoff: Python playground"],
  "/courses/[id]/progress": [`GET ${l}?view=progress`],
  "/courses/[id]/video": [`GET ${l}?view=video`, "GET /api/videos/[videoId]/playback-url"],
  "/courses/[id]/live": [`GET ${l}?view=live`, `POST ${l}/live`, "Live socket: room-bound participant"],
  "/courses/[id]/live/host": ["Browser handoff: /tutor/[id]/live"],
  "/courses/tutorial-pka": [`GET ${l}?view=pka-home`, `POST ${l} pka-announcement-read`],
  "/courses/tutorial-pka/daftar": [`GET ${l}?view=pka-registration`],
  "/courses/tutorial-pka/jadwal": [`GET ${l}?view=pka-schedule`],
  "/courses/tutorial-pka/laporan": [`GET ${l}?view=pka-report`],
  "/courses/tutorial-pka/material": [`GET ${l}?view=pka-material`, `GET ${c}?view=material-list`],
  "/courses/tutorial-pka/material/[materialId]": [`GET ${l}?view=pka-material`, `GET ${c}?view=material-detail`],
  "/courses/tutorial-pka/simulasi": [`GET ${l}?view=pka-simulation`],
  "/courses/tutorial-pka/simulasi/[subject]/[stage]": [`GET ${l}?view=pka-stage`, `GET/POST ${a}/quiz/[quizId]`],
  "/achievements": [`GET ${u}/achievements`, `POST ${u}/reward`],
  "/calendar": [`GET ${u}/calendar`, `GET ${u}/calendar-status`, `POST ${u}/calendar-sync`, `POST ${u}/calendar-connect`],
  "/courses/[id]/discussions": [`GET ${u}/discussion-scope`, `POST ${u}/discussion`, "GET/POST /api/discussions/workspace", "POST /api/discussions/attachments"],
  "/courses/[id]/leaderboard": [`GET ${u}/course-ranking`],
  "/dashboard/discussions": [`GET ${u}/discussion-scope`, `POST ${u}/discussion`, "GET/POST /api/discussions/workspace", "POST /api/discussions/attachments"],
  "/dashboard/groups": [`GET/POST ${u}/groups`, `GET/POST ${u}/group-rename`],
  "/dashboard/schedule": [`GET/POST ${u}/schedule`, `GET ${u}/calendar-status`, `POST ${u}/calendar-sync`, `POST ${u}/calendar-connect`],
  "/discussions": ["Alias: /dashboard/discussions with query", `GET ${u}/discussion-scope`],
  "/feedback": [`POST ${u}/feedback`],
  "/leaderboard": [`GET ${u}/academic-ranking`, `GET ${u}/participation-ranking`],
  "/leaderboard/academic": ["Alias: /leaderboard?tab=academic with query", `GET ${u}/academic-ranking`],
  "/pet": [`GET ${u}/pet`, `POST ${u}/reward`],
  "/profile": [`GET/POST ${u}/profile`, `GET ${u}/following`, `GET ${u}/people`, `POST ${u}/social`],
  "/profile/edit": [`GET/POST ${u}/profile`, `POST ${u}/social-settings`],
  "/profile/reflections": [`GET ${u}/reflections`],
  "/settings": [`GET ${u}/notifications`, `POST ${u}/locale`, `GET/POST ${u}/profile`, `GET/PUT /api/notifications/quiet-hours`],
  "/settings/notifications": [`GET ${u}/notifications`, `POST ${u}/notification-email`, `POST ${u}/notification-activity`, `POST ${u}/notification-timing`, "GET/PUT /api/notifications/quiet-hours"],
  "/settings/notifications/browser": ["Browser handoff: /settings/notifications/browser"],
  "/students/[publicId]": [`GET ${u}/public-profile`, `POST ${u}/social`],
};
const areaInfo: Record<StudentArea, { ui: string; symbol: string; doc: string; checks: string[] }> = {
  courses: { ui: "apps/mobile-native/features/student/courses/index.tsx", symbol: "CourseScreen", doc: "packages/native-parity/student/courses/README.md", checks: ["tests/contracts/native-student-courses.test.ts", "tests/unit/native-student-course-data.test.ts", "tests/unit/native-student-dashboard-extras.test.ts"] },
  assessment: { ui: "apps/mobile-native/features/student/assessment/index.tsx", symbol: "AssessmentScreen", doc: "packages/native-parity/student/assessment/README.md", checks: ["tests/contracts/native-student-assessment.test.ts", "tests/unit/native-student-assessment-drafts.test.ts", "tests/visual/native-parallel/student/assessment-reference.spec.ts"] },
  learning: { ui: "apps/mobile-native/features/student/learning/index.tsx", symbol: "LearningScreen", doc: "packages/native-parity/student/learning/README.md", checks: ["tests/contracts/native-student-learning.test.ts", "tests/contracts/native-student-learning-postgres.test.ts"] },
  community: { ui: "apps/mobile-native/features/student/community/index.tsx", symbol: "CommunityScreen", doc: "packages/native-parity/student/community/README.md", checks: ["packages/native-parity/student/community/community.test.ts", "tests/visual/native-parallel/student/product/community-http.test.ts"] },
};
const httpCourses = new Set(["/dashboard", "/courses", "/courses/[id]", "/courses/[id]/material", "/courses/[id]/material/[materialId]"]);
const httpCommunity = new Set(["/leaderboard", "/leaderboard/academic", "/courses/[id]/leaderboard", "/calendar", "/dashboard/schedule", "/profile/reflections", "/settings/notifications", "/profile", "/students/[publicId]", "/dashboard/discussions", "/courses/[id]/discussions", "/discussions"]);
const resultFor = (platform: "android" | "ios", source: string, caseId: string) => {
  const summary = summaries[platform];
  if (!summary) return { status: "not_recorded" };
  const item = summary.data.routes?.find((row: any) => row.source === source)?.cases?.find((row: any) => row.id === caseId);
  const provenance = { summary: summary.path, sourceHead: summary.data.sourceHead ?? null, workflowRun: summary.data.workflowRun ?? null };
  return item ? { status: item.result ?? "not_run", artifacts: item.artifacts ?? [], ...provenance } : { status: "not_in_summary", ...provenance };
};
const docs = "docs/native-readiness.md";
const rows = manifest.routes.map((route: any) => {
  const source = route.source as string;
  const pattern = source.replace(/^app\/\(student\)/, "").replace(/\/page\.tsx$/, "");
  const area = (Object.entries(studentPatterns).find(([, values]) => values.includes(pattern))?.[0]) as StudentArea | undefined;
  if (!area || !operations[pattern]) throw new Error(`Missing route mapping: ${source}`);
  const info = areaInfo[area];
  const productCaptures = web.results.filter((entry: any) => matchStudentRoute(entry.path)?.pattern === pattern).map((entry: any) => {
    const file = `${webRoot}/${entry.id}.png`;
    if (!existsSync(file)) throw new Error(`Missing product capture: ${file}`);
    return { id: entry.id, file, path: entry.path, status: entry.status, evidence: "authenticated product web", serverSha: web.serverSha,
      viewport: `${web.width}x${web.height}`, dpr: web.dpr, theme: web.theme, locale: web.locale };
  });
  const componentCaptures = pattern === "/courses" ? ["android", "ios"].flatMap(target => ["all", "tpb", "pka"].map(state => ({
    id: `catalog-${target}-${state}`, file: `${base}/web-reference/${target}/catalog-${state}.png`, evidence: "web fixture; target label is viewport only",
  }))) : pattern === "/courses/[id]/flashcard" ? ["question", "review-pending", "review-failed"].map(state => ({
    id: `flashcard-${state}`, file: `tests/visual/native-parallel/student/learning/web/${state}.png`, evidence: "web component fixture",
  })) : [];
  const ciCase = pattern === "/courses" ? "Catalog populated, filtered and loading; three catalog reference captures" :
    pattern === "/calendar" ? "Calendar all, tutorial filter and empty filter" :
    pattern === "/courses/[id]/quiz/[quizId]" ? "Quiz player states and gateway reference in light/dark" :
    pattern === "/courses/[id]/my-results" ? "Populated and empty results reference in light/dark" : null;
  const webRun = ciHistory.runs.find((run: any) => run.runId === 45803927675);
  const cases = route.cases.map((entry: any) => ({
    id: entry.id, scenario: entry.scenario, theme: entry.theme, path: entry.path, fixture_status: entry.flow ? "generated_not_executed" : "blocked",
    marker: entry.marker ?? null, steps: entry.steps ?? [], assertion_count: entry.marker ? 1 + (entry.steps ?? []).filter((step: any) => step.assert || step.absent || step.scroll).length : 0,
    flow: entry.flow ?? null, blocked_reason: entry.reason ?? null, limitation: entry.limitation ?? null,
    android: resultFor("android", source, entry.id), ios: resultFor("ios", source, entry.id),
  }));
  return { source, pattern, area, implementation: { status: "module_present_fixture_hosted", ui: info.ui, symbol: info.symbol,
      entry: "apps/mobile-native/features/student/StudentEntry.tsx", verified_entry: "apps/mobile-native/features/student/VerifiedStudentEntry.tsx",
      limitation: "Screen and adapter exist in source. Product router mounting, device behavior and parity require separate evidence." },
    operations: operations[pattern], contract_doc: info.doc, checks: [...info.checks, "tests/visual/native-parallel/student/expanded-fixtures.test.ts"],
    http_evidence: httpCourses.has(pattern) ? { source: "tests/visual/native-parallel/student/product/README.md", scope: "Local synthetic HTTP reads for dashboard, extras, catalog, course and material; see per-view assertions." } :
      httpCommunity.has(pattern) ? { source: "packages/native-parity/student/community/README.md", scope: "Local synthetic HTTP tests cover selected guard and community operations; inspect linked test for exact scope." } : null,
    web_evidence: [...productCaptures, ...componentCaptures],
    web_ci_evidence: ciCase && webRun ? { case: ciCase, status: webRun.web.status, sourceHead: webRun.sourceHead,
      run: webRun.url, artifact: webRun.web.artifact, kind: "synthetic web component fixture" } : null,
    fixture_cases: cases,
    device_status: { android: summaries.android ? `see ${summaries.android.path}` : "not_recorded", ios: summaries.ios ? `see ${summaries.ios.path}` : "not_recorded" },
    interaction_status: "Generated fixture interactions are not device results unless a matching summary records them.",
    parity_status: "not_established", known_differences: pattern === "/courses/[id]/flashcard" ?
      "Web uses rounded-2xl cards, distinct grade colors and an upper toast; Expo uses 10 dp cards, shared buttons and inline error. Device pixel diff is not measured. See tests/visual/native-parallel/student/learning/README.md." :
      pattern.endsWith("/material/[materialId]") ? "Fixture shows a reader-unavailable state when the shared renderer is absent; it does not render the web document. Device pixel diff is not measured." :
      pattern === "/pet" ? "Expo uses catalog posters; GLB animation and equipped visuals require the shared renderer. Device pixel diff is not measured." :
      pattern === "/settings" ? "Some web display settings are not mapped to native. Device pixel diff is not measured." :
      "Per-case pixel diff has not been established by this report.",
    pending: ["Verified product router mounting and signed-in product flow", "Android and iOS captures, interactions, accessibility and matching pixel comparison", ...(cases.some((x: any) => x.blocked_reason) ? ["Resolve named fixture or device blockers in fixture_cases"] : []),
      ...(pattern.includes("/material/[materialId]") ? ["Integrate and test authorized article, diktat and PDF renderers"] : []),
      ...(["/courses/[id]/live/host", "/settings/notifications/browser", "/courses/[id]/playground", "/courses/[id]/video"].includes(pattern) ? ["Exercise system browser handoff and return on devices"] : [])],
    readiness_reference: docs };
});
if (rows.length !== 50 || new Set(rows.map((row: any) => row.source)).size !== 50 || Object.keys(operations).length !== 50) throw new Error("Expected exactly 50 uniquely mapped Student routes");
const report = { generated_from_head: sha, note: "HEAD identifies the checkout at generation time; an uncommitted working tree may differ. Evidence retains its own provenance. No platform pass or parity is inferred from fixtures.",
  smoke_manifest: manifestPath, smoke_generated_from_head: manifest.sourceHead ?? null,
  product_capture_manifest: `${webRoot}/web.json`, ci_history: `${base}/ci-history.json`, routes: rows };
writeFileSync(`${base}/routes.json`, JSON.stringify(report, null, 2) + "\n");
const link = (path: string, title: string) => `[${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](../../../../${path.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("[", "%5B").replaceAll("]", "%5D")})`;
const lines = ["# Laporan rute Student", "", `Dihasilkan dari HEAD \`${sha}\`; working tree dapat memiliki perubahan. Detail setiap fixture, jumlah assertion, status run dan blocker tersedia di [routes.json](routes.json). Hasil fixture bukan bukti perangkat atau kelulusan paritas.`, "",
  `Referensi web produk dan SHA server: ${link(`${webRoot}/web.json`, "web.json")}; cakupan HTTP lokal dibatasi oleh ${link("tests/visual/native-parallel/student/product/README.md", "laporan kursus")} dan ${link("packages/native-parity/student/community/README.md", "laporan komunitas")}. [Riwayat CI](ci-history.json) mencatat SHA dan waktu pengamatan; status lama bukan status run terbaru.`, "",
  "| Rute dan sumber web | Implementasi dan operasi | Fixture runnable / blocked; assertion | Bukti web | Android / iOS |", "|---|---|---|---|---|"];
for (const row of rows) {
  const cases = row.fixture_cases;
  const available = cases.filter((x: any) => x.fixture_status !== "blocked");
  const blocked = cases.length - available.length;
  const assertions = available.reduce((n: number, x: any) => n + x.assertion_count, 0);
  const captures = row.web_evidence.map((x: any) => link(x.file, x.id));
  if (row.web_ci_evidence) captures.push(`[CI web fixture](${row.web_ci_evidence.artifact})`);
  const screenshots = captures.join(", ") || "Belum ada capture tercatat";
  const platform = (["android", "ios"] as const).map(p => !summaries[p] ? `${p}: belum tercatat` :
    summaries[p]!.data.workflowRun ? `[${p} run](${summaries[p]!.data.workflowRun})` : `${p}: summary lokal tersedia`).join("; ");
  lines.push(`| ${link(row.source, row.pattern)} | ${link(row.implementation.ui, row.implementation.symbol)}; ${row.operations.map((op: string) => `\`${op}\``).join("<br>")}<br>${link(row.contract_doc, "kontrak dan izin")} | ${available.length} / ${blocked}; ${assertions} assertion yang direncanakan | ${screenshots} | ${platform} |`);
}
lines.push("", "Status pada tabel menunjukkan kode dan skenario yang ada. Periksa hasil tiap ID pada JSON: `generated_not_executed` belum dijalankan, `blocked` memuat alasan, dan artefak web tidak membuktikan state yang identik di native. Perbedaan, aksesibilitas, permission, dan pembuktian nol piksel tetap memerlukan evaluasi platform.", "");
writeFileSync(`${base}/routes.md`, lines.join("\n"));
console.log(JSON.stringify({ routes: rows.length, webProductCaptures: rows.reduce((n: number, row: any) => n + row.web_evidence.filter((e: any) => e.evidence === "authenticated product web").length, 0), fixtureCases: rows.reduce((n: number, row: any) => n + row.fixture_cases.length, 0), android: !!summaries.android, ios: !!summaries.ios }));

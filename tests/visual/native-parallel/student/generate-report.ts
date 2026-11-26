import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { matchStudentRoute, studentPatterns, type StudentArea } from "../../../../apps/mobile-native/features/student/routes";

// Generate smoke metadata first, then run this script. Optional platform summary
// files can be passed with --android=... and --ios=...; absent data is not a pass.
const manifestPath = process.argv.find(arg => arg.startsWith("--manifest="))?.slice(11) ?? "artifacts/student-evidence/generated/manifest.json";
const deviceIndexPath = "packages/native-parity/student/evidence/device-runs/index.json";
const deviceIndex = existsSync(deviceIndexPath) ? JSON.parse(readFileSync(deviceIndexPath, "utf8")) : {};
const summaries = Object.fromEntries((["android", "ios"] as const).map(platform => {
  const path = process.argv.find(arg => arg.startsWith(`--${platform}=`))?.slice(platform.length + 3)
    ?? deviceIndex[platform] ?? `artifacts/student-evidence/${platform}/smoke/smoke-summary.json`;
  if (!existsSync(path)) return [platform, null];
  const provenancePath = join(dirname(path), "provenance.json");
  const provenance = existsSync(provenancePath) ? JSON.parse(readFileSync(provenancePath, "utf8")) : {};
  const captureIndexPath = join(dirname(path), "smoke-captures.json");
  const captureIndex = existsSync(captureIndexPath) ? JSON.parse(readFileSync(captureIndexPath, "utf8")) : null;
  const archivePath = captureIndex ? join(dirname(path), "smoke-captures.zip") : null;
  if (archivePath && (captureIndex.archive !== basename(archivePath) ||
    captureIndex.sourceHead !== provenance.sourceHead || captureIndex.workflowRun !== provenance.workflowRun ||
    captureIndex.sourceArtifact !== provenance.artifact ||
    createHash("sha256").update(readFileSync(archivePath)).digest("hex") !== captureIndex.archiveSha256)) {
    throw new Error(`Device capture archive failed provenance or checksum validation: ${archivePath}`);
  }
  return [platform, { path, data: JSON.parse(readFileSync(path, "utf8")), provenance, captureIndexPath, captureIndex, archivePath }];
}));
const manifest: { sourceHead?: string; routes: { source: string; cases: any[] }[] } =
  JSON.parse(readFileSync(manifestPath, "utf8"));
const web = JSON.parse(readFileSync("tests/visual/native-parallel/student/product/web/web.json", "utf8"));
const webRoot = "tests/visual/native-parallel/student/product/web";
const base = "packages/native-parity/student/evidence";
const ciHistory = JSON.parse(readFileSync(`${base}/ci-history.json`, "utf8"));
const webRun = ciHistory.runs.findLast((run: any) => run.web?.status === "passed" && run.web.artifact);
const flashcardReferences = ["android", "ios"].flatMap(target => {
  const directory = `tests/visual/native-parallel/student/learning/web/${target}`;
  const manifest = `${directory}/flashcard-reference.json`;
  const reference = JSON.parse(readFileSync(manifest, "utf8"));
  return Object.entries(reference.captures).map(([name, sha256]) => {
    const file = `${directory}/${name}`;
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== sha256) {
      throw new Error(`Flashcard reference checksum does not match: ${file}`);
    }
    return { id: `${target}-${name.replace(/\.png$/, "")}`, file, sha256, manifest,
      evidence: "web component fixture; target label is viewport only", viewport: reference.viewport,
      dpr: reference.deviceScaleFactor, theme: reference.theme, locale: reference.locale };
  });
});
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const optionalManifests = ["tests/visual/native-parallel/student/product/assessment-web/web.json",
  "tests/visual/native-parallel/student/learning/product/web.json"];
const communityDirectory = "tests/visual/native-parallel/student/references/community";
if (existsSync(communityDirectory)) optionalManifests.push(...readdirSync(communityDirectory)
  .filter(name => /^manifest-.*\.json$/.test(name)).sort().map(name => `${communityDirectory}/${name}`));
const optionalAttempts: any[] = [];
for (const manifestFile of optionalManifests.filter(existsSync)) {
  const input = JSON.parse(readFileSync(manifestFile, "utf8"));
  for (const entry of input.results ?? input.entries ?? []) {
    const pattern = entry.pattern ?? matchStudentRoute(entry.path ?? "")?.pattern;
    if (!pattern) continue;
    const error = entry.error ?? null;
    const passed = !error && (entry.status === "passed" || entry.status === 200);
    const names = Array.isArray(entry.screenshots) ? entry.screenshots :
      entry.screenshot ? [{ file: entry.screenshot }] : passed ? [{ file: `${entry.id}.png` }] : [];
    const files = names.map((item: any) => typeof item === "string" ? { file: item } : item).map((item: any) => {
      if (typeof item.file !== "string" || basename(item.file) !== item.file) return { status: "invalid_path", name: item.file };
      const file = join(dirname(manifestFile), item.file);
      if (!existsSync(file)) return { status: "missing", file };
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      return { status: item.sha256 && item.sha256 !== digest ? "sha256_mismatch" : "available", file, sha256: digest };
    });
    const status = error || !passed ? "failed" : files.length && files.every((file: any) => file.status === "available") ? "passed" : "capture_missing_or_invalid";
    optionalAttempts.push({ pattern, id: entry.id, path: entry.path, status, error, files, manifest: manifestFile,
      sourceHead: input.serverSha ?? null, project: input.project ?? null, viewport: entry.viewport ?? (input.width && input.height ? { width: input.width, height: input.height } : null),
      dpr: entry.deviceScale ?? input.dpr ?? null, theme: entry.theme ?? input.theme ?? null, locale: input.locale ?? null,
      browser: entry.browser ?? input.browser ?? null, terminal: entry.terminal ?? entry.actualPath ?? null,
      coursePickerLoading: entry.coursePickerLoading ?? null, runtimeErrors: entry.runtimeErrors ?? [], failedRequests: entry.failedRequests ?? [] });
  }
}

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
  const provenance = { summary: summary.path, sourceHead: summary.provenance.sourceHead ?? summary.data.sourceHead ?? null,
    checkoutSha: summary.provenance.checkoutSha ?? null,
    workflowRun: summary.data.workflowRun ?? summary.provenance.workflowRun ?? null, artifact: summary.provenance.artifact ?? null,
    job_status: summary.provenance.status ?? summary.data.status ?? null };
  if (!item) return { status: "not_in_summary", ...provenance };
  const capture = summary.captureIndex?.captures.find((entry: any) =>
    entry.route === source && entry.caseId === caseId && entry.theme === item.theme &&
    entry.fixturePath === item.path && entry.status === "passed" && item.result === "passed" &&
    item.artifacts?.some((member: string) => `smoke/${member}` === entry.artifactMember));
  return { status: item.result ?? "not_run", artifacts: item.artifacts ?? [],
    ...(item.attempts ? { attempts: item.attempts } : {}),
    ...(capture ? { retained_capture: { archive: summary.archivePath, file: capture.file, sha256: capture.sha256, index: summary.captureIndexPath } } : {}),
    ...provenance };
};
const docs = "docs/native-readiness.md";
const rows = manifest.routes.map(route => {
  const source = route.source;
  const pattern = source.replace(/^app\/\(student\)/, "").replace(/\/page\.tsx$/, "");
  const area = (Object.entries(studentPatterns).find(([, values]) => values.includes(pattern))?.[0]) as StudentArea | undefined;
  if (!area || !operations[pattern]) throw new Error(`Missing route mapping: ${source}`);
  const info = areaInfo[area];
  const productCaptures = web.results.filter((entry: any) => matchStudentRoute(entry.path)?.pattern === pattern).map((entry: any) => {
    const file = `${webRoot}/${entry.id}.png`;
    if (!existsSync(file)) throw new Error(`Missing product capture: ${file}`);
    return { id: entry.id, file, path: entry.path, status: entry.status, evidence: "authenticated product web", serverSha: web.serverSha,
      viewport: `${web.width}x${web.height}`, dpr: web.dpr, theme: web.theme, locale: web.locale,
      visibleContent: entry.visibleContent ?? [], hydrationWarnings: entry.hydrationWarnings ?? [] };
  });
  const componentCaptures = pattern === "/courses" ? ["android", "ios"].flatMap(target => ["all", "tpb", "pka"].map(state => ({
    id: `catalog-${target}-${state}`, file: `${base}/web-reference/${target}/catalog-${state}.png`, evidence: "web fixture; target label is viewport only",
  }))) : pattern === "/courses/[id]/flashcard" ? flashcardReferences : [];
  const attempts = optionalAttempts.filter(item => item.pattern === pattern);
  const optionalCaptures = attempts.filter(item => item.status === "passed").flatMap(item => item.files.map((file: any) => ({
    id: `${item.id}-${basename(file.file)}`, file: file.file, evidence: "authenticated product web", sourceHead: item.sourceHead,
    manifest: item.manifest, viewport: item.viewport, dpr: item.dpr, theme: item.theme, locale: item.locale, sha256: file.sha256,
  })));
  const ciCase = pattern === "/courses" ? "Catalog populated, filtered and loading; three catalog reference captures" :
    pattern === "/calendar" ? "Calendar all, tutorial filter and empty filter" :
    pattern === "/courses/[id]/quiz/[quizId]" ? "Quiz player states and gateway reference in light/dark" :
    pattern === "/courses/[id]/my-results" ? "Populated and empty results reference in light/dark" : null;
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
    web_evidence: [...productCaptures, ...componentCaptures, ...optionalCaptures], web_attempts: attempts,
    web_ci_evidence: ciCase && webRun ? { case: ciCase, status: webRun.web.status, sourceHead: webRun.sourceHead,
      run: webRun.url, artifact: webRun.web.artifact, kind: "synthetic web component fixture" } : null,
    fixture_cases: cases,
    device_status: { android: summaries.android ? `see ${summaries.android.path}` : "not_recorded", ios: summaries.ios ? `see ${summaries.ios.path}` : "not_recorded" },
    interaction_status: "Generated fixture interactions are not device results unless a matching summary records them.",
    parity_status: "not_established", known_differences: pattern === "/courses/[id]/flashcard" ?
      "Web fixture references match the target dimensions and input for the question, pending review and explicit rejection. Expo renders distinct grade colors and the upper notice. System safe area, font rasterization, math layout and device pixel comparison remain unverified. See tests/visual/native-parallel/student/learning/README.md." :
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
  `Referensi web produk dan SHA server tersedia di ${link(`${webRoot}/web.json`, "web.json")}. Cakupan HTTP lokal tercatat di ${link("tests/visual/native-parallel/student/product/README.md", "laporan kursus")} dan ${link("packages/native-parity/student/community/README.md", "laporan komunitas")}. [Riwayat CI](ci-history.json) mencatat SHA dan waktu pengamatan.`, ""];
const webCoverage = rows.filter(row => row.web_evidence.some(item => item.evidence === "authenticated product web")).length;
const hydrationWarnings = web.results.filter((entry: any) => entry.hydrationWarnings?.length).length;
lines.push(`Referensi web produk tersedia untuk ${webCoverage} dari ${rows.length} pola rute. ${hydrationWarnings} capture kursus mencatat peringatan hidrasi. Tujuan redirect dan detail peringatan tersimpan di [routes.json](routes.json).`, "");
for (const [platform, label] of [["android", "Android"], ["ios", "iOS"]] as const) {
  const summary = summaries[platform];
  if (!summary) {
    lines.push(`- **${label}** belum memiliki ringkasan perangkat.`);
    continue;
  }
  const counts = Object.entries(summary.data.counts ?? {}).map(([status, count]) => `${count} \`${status}\``).join(", ");
  const run = summary.data.workflowRun ?? summary.provenance.workflowRun;
  const detail = [counts, summary.provenance.reason, link(summary.path, "Ringkasan kasus"),
    summary.archivePath ? link(summary.archivePath, "ZIP PNG smoke") : null,
    summary.captureIndex ? link(summary.captureIndexPath, "Indeks PNG dan SHA-256") : null,
    run ? `[Run GitHub](${run})` : null].filter(Boolean);
  lines.push(`- **${label}** ${detail.join(" · ")}`);
}
lines.push("", "| Rute dan sumber web | Implementasi dan operasi | Fixture runnable / blocked; assertion | Bukti web | Android / iOS |", "|---|---|---|---|---|");
for (const row of rows) {
  const cases = row.fixture_cases;
  const available = cases.filter((x: any) => x.fixture_status !== "blocked");
  const blocked = cases.length - available.length;
  const assertions = available.reduce((n: number, x: any) => n + x.assertion_count, 0);
  const captures = row.web_evidence.map((x: any) => link(x.file, x.id));
  if (row.web_ci_evidence) captures.push(`[CI web fixture](${row.web_ci_evidence.artifact})`);
  for (const attempt of row.web_attempts.filter((item: any) => item.status !== "passed"))
    captures.push(`${link(attempt.manifest, `${attempt.id}: ${attempt.status}`)} (tanpa kredit capture)`);
  const screenshots = captures.join(", ") || "Belum ada capture tercatat";
  const platform = (["android", "ios"] as const).map(p => !summaries[p] ? `${p}: belum tercatat` :
    summaries[p]!.data.workflowRun || summaries[p]!.provenance.workflowRun ? `[${p} run](${summaries[p]!.data.workflowRun ?? summaries[p]!.provenance.workflowRun})` : `${p}: summary lokal tersedia`).join("; ");
  lines.push(`| ${link(row.source, row.pattern)} | ${link(row.implementation.ui, row.implementation.symbol)}; ${row.operations.map((op: string) => `\`${op}\``).join("<br>")}<br>${link(row.contract_doc, "kontrak dan izin")} | ${available.length} / ${blocked}; ${assertions} assertion yang direncanakan | ${screenshots} | ${platform} |`);
}
lines.push("", "Status pada tabel menunjukkan kode dan skenario yang ada. Periksa hasil tiap ID pada JSON: `generated_not_executed` belum dijalankan, `blocked` memuat alasan, dan artefak web tidak membuktikan state yang identik di native. Perbedaan, aksesibilitas, permission, dan pembuktian nol piksel tetap memerlukan evaluasi platform.", "");
writeFileSync(`${base}/routes.md`, lines.join("\n"));
console.log(JSON.stringify({ routes: rows.length, webProductCaptures: rows.reduce((n: number, row: any) => n + row.web_evidence.filter((e: any) => e.evidence === "authenticated product web").length, 0), fixtureCases: rows.reduce((n: number, row: any) => n + row.fixture_cases.length, 0), android: !!summaries.android, ios: !!summaries.ios }));

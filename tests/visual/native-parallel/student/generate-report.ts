import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { verifyWebCaptures } from "./verify-web-captures";
import { matchStudentRoute, studentPatterns, type StudentArea } from "../../../../apps/mobile-native/features/student/routes";

// Generate smoke metadata first, then run this script. Optional platform summary
// files can be passed with --android=... and --ios=...; absent data is not a pass.
// Use --output=... to inspect an alternate report without touching the ledger.
const manifestPath = process.argv.find(arg => arg.startsWith("--manifest="))?.slice(11) ?? "artifacts/student-evidence/generated/manifest.json";
const base = "packages/native-parity/student/evidence";
const deviceRuns = `${base}/device-runs`;
const platforms = ["android", "ios"] as const;
type Platform = typeof platforms[number];
type ScenarioResult = { name: string; status: string };
type ImageComparison = { id: string; platform?: Platform; status: string; differing_pixels?: number; comparison_scope?: string; native_scenario?: ScenarioResult };
type ComparisonSource = {
  rows: ImageComparison[];
  report: string;
  provenance: {
    sourceHead?: string;
    checkoutSha?: string;
    workflowRun?: string;
    artifact?: string;
    matchedScenarioResults?: Record<string, ScenarioResult>;
  };
  primary: boolean;
};

function readComparisons(path: string): ImageComparison[] {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}

function isMeasurement(status: string, pixels: unknown): pixels is number {
  return (status === "pass" || status === "different") && typeof pixels === "number" &&
    Number.isSafeInteger(pixels) && pixels >= 0;
}

const deviceIndexPath = `${deviceRuns}/index.json`;
const deviceIndex = existsSync(deviceIndexPath) ? JSON.parse(readFileSync(deviceIndexPath, "utf8")) : {};
const summaries = Object.fromEntries(platforms.map(platform => {
  const path = process.argv.find(arg => arg.startsWith(`--${platform}=`))?.slice(platform.length + 3)
    ?? deviceIndex[platform] ?? `artifacts/student-evidence/${platform}/smoke/smoke-summary.json`;
  if (!existsSync(path)) return [platform, null];
  const provenancePath = join(dirname(path), "provenance.json");
  const provenance = existsSync(provenancePath) ? JSON.parse(readFileSync(provenancePath, "utf8")) : {};
  const captureIndexPath = join(dirname(path), "smoke-captures.json");
  const captureIndex = existsSync(captureIndexPath) ? JSON.parse(readFileSync(captureIndexPath, "utf8")) : null;
  const comparisonPath = join(dirname(path), "comparison.json");
  const comparison = readComparisons(comparisonPath);
  const archivePath = captureIndex ? join(dirname(path), "smoke-captures.zip") : null;
  if (archivePath && (captureIndex.archive !== basename(archivePath) ||
    captureIndex.sourceHead !== provenance.sourceHead || captureIndex.workflowRun !== provenance.workflowRun ||
    captureIndex.sourceArtifact !== provenance.artifact ||
    createHash("sha256").update(readFileSync(archivePath)).digest("hex") !== captureIndex.archiveSha256)) {
    throw new Error(`Device capture archive failed provenance or checksum validation: ${archivePath}`);
  }
  return [platform, { path, data: JSON.parse(readFileSync(path, "utf8")), provenance, captureIndexPath, captureIndex, archivePath, comparison, comparisonPath }];
}));
const manifest: { sourceHead?: string; routes: { source: string; cases: any[] }[] } =
  JSON.parse(readFileSync(manifestPath, "utf8"));
const web = JSON.parse(readFileSync("tests/visual/native-parallel/student/product/web/web.json", "utf8"));
const webRoot = "tests/visual/native-parallel/student/product/web";
const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9) ?? base;
const ciHistory = JSON.parse(readFileSync(`${base}/ci-history.json`, "utf8"));
const webRun = ciHistory.runs.findLast((run: any) => run.web?.status === "passed" && run.web.artifact);
const matchedGroups: Record<string, { route: string; productFixture?: string; scope?: string; states: string[]; testcase: string }> =
  JSON.parse(readFileSync("tests/visual/native-parallel/student/matched-reference-groups.json", "utf8"));
const signedAndroidReview: { group: string; route: string; platform: "android"; states: Record<string, unknown> } =
  JSON.parse(readFileSync("tests/visual/native-parallel/student/signed-assessment-review.json", "utf8"));
const referenceGroups = [
  { route: "/courses", directory: "", prefix: "catalog", scope: undefined, product: false, states: ["all", "tpb", "pka"] },
  { route: "/courses/[id]/flashcard", directory: "learning", prefix: "flashcard", scope: undefined, product: false, states: ["question", "review-pending", "review-failed"] },
  ...Object.entries(matchedGroups).map(([prefix, config]) => ({
    route: config.route, directory: prefix, prefix, scope: config.scope, product: Boolean(config.productFixture), states: config.states,
  })),
];
const retainedRuns = readdirSync(deviceRuns).filter(run => /^\d+$/.test(run)).sort((a, b) => Number(b) - Number(a));
// The selected summary owns the case counts and may report attempted but unmeasured comparisons.
function comparisonSourcesFor(platform: Platform): ComparisonSource[] {
  const selected = summaries[platform];
  const archive = retainedRuns.flatMap(run => {
    const directory = `${deviceRuns}/${run}/${platform}`;
    const report = `${directory}/comparison.json`;
    if (selected && resolve(report) === resolve(selected.comparisonPath)) return [];
    const rows = readComparisons(report).filter(row => isMeasurement(row.status, row.differing_pixels));
    if (!rows.length) return [];
    const provenance = JSON.parse(readFileSync(`${directory}/provenance.json`, "utf8"));
    if (!provenance.sourceHead || !provenance.checkoutSha || !provenance.workflowRun) {
      throw new Error(`Incomplete measured device evidence: ${report}`);
    }
    return [{ rows, report, provenance, primary: false }];
  });
  return selected ? [{
    rows: selected.comparison, report: selected.comparisonPath,
    provenance: { ...selected.provenance, sourceHead: selected.provenance.sourceHead ?? selected.data.sourceHead,
      workflowRun: selected.provenance.workflowRun ?? selected.data.workflowRun },
    primary: true,
  }, ...archive] : archive;
}
const comparisonSources = { android: comparisonSourcesFor("android"), ios: comparisonSourcesFor("ios") };

// Some older workflows retained a successful device flow before the web job
// knew its reference group. Keep independently verified pairs at their own SHA.
const additionalComparisons = retainedRuns.flatMap(run =>
  platforms.flatMap(platform => Object.entries(matchedGroups).flatMap(([group, config]) => {
    const report = `${base}/device-runs/${run}/${platform}/${group}/comparison.json`;
    if (!existsSync(report)) return [];
    const evidence = JSON.parse(readFileSync(report, "utf8"));
    if (evidence.route !== config.route || !evidence.checkoutSha || !evidence.pullRequestHead) throw new Error(`Wrong supplemental evidence: ${report}`);
    return (evidence.pairs as { state: string; status: string; differingPixels: number }[])
      .filter(pair => config.states.includes(pair.state) && evidence.maestro?.testcase === config.testcase.replace("{state}", pair.state) && isMeasurement(pair.status, pair.differingPixels)).map(pair => ({
        pattern: config.route, platform, id: `${group}-${pair.state}`, status: pair.status, differingPixels: pair.differingPixels,
        comparisonScope: evidence.comparison_scope as string | undefined,
        standaloneScenario: { name: evidence.maestro.testcase, status: evidence.maestro.status }, report,
        sourceHead: evidence.pullRequestHead as string, checkoutSha: evidence.checkoutSha as string,
        workflowRun: evidence.workflowRun as string, artifact: evidence.androidArtifact?.url ?? null, primary: false,
      }));
  })));
function deviceSizedWebReferences(group: typeof referenceGroups[number]) {
  return ["android", "ios"].flatMap(target => {
    const directory = `tests/visual/native-parallel/student/${group.directory}/web/${target}`;
    const manifest = `${directory}/${group.prefix}-reference.json`;
    const reference = JSON.parse(readFileSync(manifest, "utf8"));
    const referenceCommit = execFileSync("git", ["log", "-1", "--format=%H", "--", manifest], { encoding: "utf8" }).trim();
    return Object.entries(reference.captures).map(([name, sha256]) => {
      const file = `${directory}/${name}`;
      if (createHash("sha256").update(readFileSync(file)).digest("hex") !== sha256) {
        throw new Error(`Device-sized web reference checksum does not match: ${file}`);
      }
      const state = reference.states?.[name.slice(group.prefix.length + 1, -4)];
      return { id: `${target}-${name.replace(/\.png$/, "")}`, file, sha256, manifest, referenceCommit, comparisonScope: group.scope,
        serverSha: reference.serverSha ?? null,
        evidence: group.product ? "authenticated product web" : "web component fixture; target label is viewport only", viewport: reference.viewport,
        dpr: reference.deviceScaleFactor,
        theme: state?.web?.theme ?? state?.theme ?? reference.theme,
        locale: state?.web?.locale ?? state?.locale ?? reference.locale };
    });
  });
}
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const optionalManifests = ["tests/visual/native-parallel/student/product/assessment-web/web.json",
  "tests/visual/native-parallel/student/learning/product/web.json"];
const assessmentResultCaptures = "tests/visual/native-parallel/student/product/assessment-results-web/android/manifest.json";
optionalManifests.push(assessmentResultCaptures);
const communityDirectory = "tests/visual/native-parallel/student/references/community";
if (existsSync(communityDirectory)) optionalManifests.push(...readdirSync(communityDirectory)
  .filter(name => /^manifest-.*\.json$/.test(name)).sort().map(name => `${communityDirectory}/${name}`));
const optionalAttempts: any[] = [];
for (const manifestFile of optionalManifests.filter(existsSync)) {
  const input = JSON.parse(readFileSync(manifestFile, "utf8"));
  const entries = manifestFile === assessmentResultCaptures
    ? Object.entries(input.captures).map(([file, capture]) => {
      const result = capture as { path: string; status: number; serverSha: string; sha256: string };
      return { ...result, id: basename(file, ".png"), screenshot: file, screenshotSha256: result.sha256,
        viewport: input.viewport, deviceScale: input.deviceScaleFactor };
    }) : input.results ?? input.entries ?? [];
  for (const entry of entries) {
    const pattern = entry.pattern ?? matchStudentRoute(entry.path ?? "")?.pattern;
    if (!pattern) continue;
    const error = entry.error ?? null;
    const passed = !error && (entry.status === "passed" || entry.status === 200);
    const files = verifyWebCaptures(entry, dirname(manifestFile), passed);
    const status = error || !passed ? "failed" : files.length && files.every((file: any) => file.status === "available") ? "passed" : "capture_missing_or_invalid";
    optionalAttempts.push({ pattern, id: entry.id, path: entry.path, status, error, files, manifest: manifestFile,
      sourceHead: entry.serverSha ?? input.serverSha ?? null, project: input.project ?? null, viewport: entry.viewport ?? (input.width && input.height ? { width: input.width, height: input.height } : null),
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
  community: { ui: "apps/mobile-native/features/student/community/index.tsx", symbol: "CommunityScreen", doc: "packages/native-parity/student/community/README.md", checks: ["packages/native-parity/student/community/community.test.ts", "tests/contracts/native-student-community-http.test.ts"] },
};
const httpCourses = new Set(["/dashboard", "/courses", "/courses/[id]", "/courses/[id]/material", "/courses/[id]/material/[materialId]"]);
const httpLearning = new Set(["/courses/[id]/mastery", "/courses/[id]/path", "/courses/[id]/concept/[slug]", "/courses/[id]/video", "/courses/[id]/flashcard", "/courses/tutorial-pka", "/courses/tutorial-pka/jadwal", "/courses/tutorial-pka/laporan", "/courses/tutorial-pka/simulasi/[subject]/[stage]"]);
const httpCommunity = new Set(["/leaderboard", "/leaderboard/academic", "/courses/[id]/leaderboard", "/calendar", "/dashboard/schedule", "/profile/reflections", "/settings/notifications", "/profile", "/students/[publicId]", "/dashboard/discussions", "/courses/[id]/discussions", "/discussions"]);
type CaseInputs = {
  id: string;
  path?: string;
  scenario?: string;
  theme?: string;
  marker?: unknown;
  steps?: unknown[];
};

function fixtureDefinition(entry: CaseInputs) {
  return {
    path: entry.path ?? null, scenario: entry.scenario ?? null, theme: entry.theme ?? null,
    marker: entry.marker ?? null, steps: entry.steps ?? [],
  };
}

const resultFor = (platform: Platform, source: string, current: CaseInputs, assertions: number) => {
  const summary = summaries[platform];
  if (!summary) return { status: "not_recorded" };
  const item = summary.data.routes?.find((row: any) => row.source === source)?.cases?.find((row: any) => row.id === current.id);
  const provenance = { summary: summary.path, sourceHead: summary.provenance.sourceHead ?? summary.data.sourceHead ?? null,
    checkoutSha: summary.provenance.checkoutSha ?? null,
    workflowRun: summary.data.workflowRun ?? summary.provenance.workflowRun ?? null, artifact: summary.provenance.artifact ?? null,
    job_status: summary.provenance.status ?? summary.data.status ?? null };
  if (!item) return { status: "not_in_summary", ...provenance };
  const previous = fixtureDefinition(item);
  const expected = fixtureDefinition(current);
  const changedFields = (Object.keys(previous) as (keyof typeof previous)[])
    .filter(key => !isDeepStrictEqual(previous[key], expected[key]));
  const statusAtRun = item.result ?? "not_run";
  const status = changedFields.length ? "historical_changed" : statusAtRun;
  const capture = summary.captureIndex?.captures.find((entry: any) =>
    entry.route === source && entry.caseId === current.id && entry.theme === item.theme &&
    entry.fixturePath === item.path && entry.status === "passed" && item.result === "passed" &&
    item.artifacts?.some((member: string) => `smoke/${member}` === entry.artifactMember));
  return { status, status_at_run: statusAtRun, assertions_verified: status === "passed" ? assertions : 0,
    marker_at_run: previous.marker, artifacts: item.artifacts ?? [],
    ...(changedFields.length ? { changed_fields: changedFields, definition_at_run: previous } : {}),
    ...(item.attempts ? { attempts: item.attempts } : {}),
    ...(capture ? { [changedFields.length ? "retained_capture_at_run" : "retained_capture"]: {
      archive: summary.archivePath, file: capture.file, sha256: capture.sha256, index: summary.captureIndexPath,
    } } : {}),
    ...provenance };
};
type DeviceCase = Record<Platform, { status: string; assertions_verified?: number }>;
function countDeviceCases(cases: DeviceCase[], platform: Platform) {
  const counts: Record<string, number> = {};
  let assertions = 0;
  for (const item of cases) {
    const result = item[platform];
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    assertions += result.assertions_verified ?? 0;
  }
  return { case_counts: counts, assertions_verified: assertions };
}

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
  const groups = referenceGroups.filter(group => group.route === pattern);
  const componentCaptures = pattern === "/courses" ? ["android", "ios"].flatMap(target => ["all", "tpb", "pka"].map(state => ({
    id: `catalog-${target}-${state}`, file: `${base}/web-reference/${target}/catalog-${state}.png`, evidence: "web fixture; target label is viewport only",
  }))) : groups.flatMap(deviceSizedWebReferences);
  const routeGroups = groups.map(({ prefix, states }) => ({ id: prefix, states, platforms: [...platforms] }));
  if (pattern === signedAndroidReview.route) {
    const states = Object.keys(signedAndroidReview.states);
    routeGroups.push({ id: signedAndroidReview.group, states, platforms: [signedAndroidReview.platform] });
  }
  const groupForId = new Map<string, typeof routeGroups[number]>(routeGroups.flatMap(group => group.states.map(state => [`${group.id}-${state}`, group] as const)));
  const deviceComparisons = platforms.flatMap(platform => comparisonSources[platform].flatMap(source =>
    source.rows.filter(row => (!row.platform || row.platform === platform) && groupForId.get(row.id)?.platforms.includes(platform)).map(row => ({
      platform, id: row.id, status: row.status, differingPixels: row.differing_pixels ?? null, comparisonScope: row.comparison_scope,
      standaloneScenario: row.native_scenario ?? source.provenance.matchedScenarioResults?.[groupForId.get(row.id)!.id] ?? null,
      report: source.report, sourceHead: source.provenance.sourceHead ?? null, checkoutSha: source.provenance.checkoutSha ?? null,
      workflowRun: source.provenance.workflowRun ?? null, artifact: source.provenance.artifact ?? null, primary: source.primary,
    }))));
  const attempts = optionalAttempts.filter(item => item.pattern === pattern);
  const optionalCaptures = attempts.filter(item => item.status === "passed").flatMap(item => item.files.map((file: any) => ({
    id: `${item.id}-${basename(file.file)}`, file: file.file, evidence: "authenticated product web", sourceHead: item.sourceHead,
    manifest: item.manifest, viewport: item.viewport, dpr: item.dpr, theme: item.theme, locale: item.locale, sha256: file.sha256,
  })));
  const ciCase = pattern === "/courses" ? "Catalog populated, filtered and loading; three catalog reference captures" :
    pattern === "/calendar" ? "Calendar all, tutorial filter and empty filter" :
    pattern === "/courses/[id]/quiz/[quizId]" ? "Quiz player states and gateway reference in light/dark" :
    pattern === "/courses/[id]/my-results" ? "Populated and empty results reference in light/dark" : null;
  const cases = route.cases.map((entry: any) => {
    const assertionCount = entry.marker ? 1 + (entry.steps ?? []).filter((step: any) => step.assert || step.absent || step.scroll).length : 0;
    return { id: entry.id, scenario: entry.scenario, theme: entry.theme, path: entry.path, fixture_status: entry.flow ? "runnable" : "blocked",
      marker: entry.marker ?? null, steps: entry.steps ?? [], assertion_count: assertionCount,
      flow: entry.flow ?? null, blocked_reason: entry.reason ?? null, limitation: entry.limitation ?? null,
      android: resultFor("android", source, entry, assertionCount), ios: resultFor("ios", source, entry, assertionCount) };
  });
  const comparisonByRun = new Map<string, (typeof deviceComparisons)[number]>();
  for (const item of [...deviceComparisons, ...additionalComparisons.filter(item => item.pattern === pattern)]) {
    const key = JSON.stringify([item.platform, item.id, item.workflowRun ?? resolve(item.report)]);
    const existing = comparisonByRun.get(key);
    if (!existing || (!isMeasurement(existing.status, existing.differingPixels) && isMeasurement(item.status, item.differingPixels))) {
      comparisonByRun.set(key, { ...item, primary: existing?.primary ?? item.primary });
    }
  }
  const comparisons = Array.from(comparisonByRun.values());
  return { source, pattern, area, implementation: { status: "module_present_fixture_hosted", ui: info.ui, symbol: info.symbol,
      entry: "apps/mobile-native/features/student/StudentEntry.tsx", verified_entry: "apps/mobile-native/features/student/VerifiedStudentEntry.tsx",
      limitation: "The integration preview mounts the verified entry. A signed-in product run and fixture device results have separate provenance." },
    operations: operations[pattern], contract_doc: info.doc, checks: [...info.checks, "tests/unit/native-student-expanded-fixtures.test.ts"],
    http_evidence: httpCourses.has(pattern) ? { source: "tests/visual/native-parallel/student/product/README.md", scope: "Local synthetic HTTP reads for dashboard, extras, catalog, course and material; see per-view assertions." } :
      ["/courses/[id]/quiz/[quizId]", "/courses/[id]/tryout/[tryoutId]", "/courses/[id]/my-results", "/courses/[id]/my-results/[submissionId]", "/courses/[id]/my-results/[submissionId]/summary", "/courses/[id]/quiz/[quizId]/summary/[attemptId]"].includes(pattern) ?
      { source: "tests/visual/native-parallel/student/product/assessment-http.ts", scope: "Signed HTTP with a local PostgreSQL database. Checks retries, attempt ownership, release and score for quiz and tryout, plus analytics redaction and owner-only regeneration on both summary paths." } :
      httpLearning.has(pattern) ? { source: "tests/visual/native-parallel/student/product/learning-http.ts", scope: "Signed HTTP to local Next and PostgreSQL. See per-view assertions for entitlement, previews, and flashcard review persistence." } :
      httpCommunity.has(pattern) ? { source: "packages/native-parity/student/community/README.md", scope: "Local synthetic HTTP tests cover selected guard and community operations; inspect linked test for exact scope." } : null,
    web_evidence: [...productCaptures, ...componentCaptures, ...optionalCaptures], web_attempts: attempts,
    web_ci_evidence: ciCase && webRun ? { case: ciCase, status: webRun.web.status, sourceHead: webRun.sourceHead,
      run: webRun.url, artifact: webRun.web.artifact, kind: "synthetic web component fixture" } : null,
    fixture_cases: cases,
    matched_reference_groups: routeGroups,
    device_comparisons: comparisons,
    fixture_device_summary: { android: countDeviceCases(cases, "android"), ios: countDeviceCases(cases, "ios") },
    device_status: { android: summaries.android ? `see ${summaries.android.path}` : "not_recorded", ios: summaries.ios ? `see ${summaries.ios.path}` : "not_recorded" },
    interaction_status: "Current fixture credit requires a device run with the same path, scenario, theme, marker and ordered steps.",
    parity_status: "not_established", known_differences: pattern === "/courses/[id]/flashcard" ?
      "See device_comparisons for measured runs of the question, pending review and explicit rejection. The web component composition, native title, system safe area and math rendering differ. See tests/visual/native-parallel/student/learning/README.md for the reference version." :
      pattern.endsWith("/material/[materialId]") ? "The enrolled fixture shows the authorized fallback until the host supplies the shared reader. For preview and revoked states, see device_comparisons for measured pairs at their own source commits." :
      pattern === "/pet" ? "Expo uses catalog posters; GLB animation and equipped visuals require the shared renderer. Device pixel diff is not measured." :
      pattern === "/settings" ? "The language controls can be compared within settings. Other web display settings and the surrounding chrome have separate platform behavior." :
      comparisons.some(item => Number.isFinite(item.differingPixels)) ? "Per-platform outcomes are recorded in device_comparisons at their own source commits." : "Per-case pixel diff has not been established by this report.",
    pending: ["Signed-in end-to-end product flow on the integrated host", "Remaining Android and iOS captures, interactions, accessibility and matching pixel comparisons", ...(cases.some((x: any) => x.blocked_reason) ? ["Resolve named fixture or device blockers in fixture_cases"] : []),
      ...(pattern.includes("/material/[materialId]") ? ["Integrate and test authorized article, diktat and PDF renderers"] : []),
      ...(["/courses/[id]/live/host", "/settings/notifications/browser", "/courses/[id]/playground", "/courses/[id]/video"].includes(pattern) ? ["Exercise system browser handoff and return on devices"] : [])],
    readiness_reference: docs };
});
if (rows.length !== 50 || new Set(rows.map((row: any) => row.source)).size !== 50 || Object.keys(operations).length !== 50) throw new Error("Expected exactly 50 uniquely mapped Student routes");
const fixtureCases = rows.flatMap(row => row.fixture_cases);
const deviceEvidence = Object.fromEntries(platforms.map(platform => {
  const summary = summaries[platform];
  return [platform, {
    summary: summary?.path ?? null,
    run_counts: summary?.data.counts ?? {},
    current: countDeviceCases(fixtureCases, platform),
  }];
}));
mkdirSync(output, { recursive: true });
const report = { generated_from_head: sha, note: "HEAD identifies the checkout at generation time; an uncommitted working tree may differ. Evidence retains its own provenance. No platform pass or parity is inferred from fixtures.",
  smoke_manifest: manifestPath, smoke_generated_from_head: manifest.sourceHead ?? null,
  product_capture_manifest: `${webRoot}/web.json`, ci_history: `${base}/ci-history.json`, device_evidence_summary: deviceEvidence, routes: rows };
writeFileSync(join(output, "routes.json"), JSON.stringify(report, null, 2) + "\n");
const link = (path: string, title: string) => `[${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${relative(output, path).replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("[", "%5B").replaceAll("]", "%5D")})`;
const lines = ["# Laporan rute Student", "", `Dihasilkan dari HEAD \`${sha}\`; working tree dapat memiliki perubahan. Detail setiap fixture, jumlah assertion, status run dan blocker tersedia di [routes.json](routes.json). Hasil fixture bukan bukti perangkat atau kelulusan paritas.`, "",
  `Referensi web produk dan SHA server tersedia di ${link(`${webRoot}/web.json`, "web.json")}. Cakupan HTTP lokal tercatat di ${link("tests/visual/native-parallel/student/product/README.md", "laporan kursus")} dan ${link("packages/native-parity/student/community/README.md", "laporan komunitas")}. ${link(`${base}/ci-history.json`, "Riwayat CI")} mencatat SHA dan waktu pengamatan.`, ""];
const webCoverage = rows.filter(row => row.web_evidence.some(item => item.evidence === "authenticated product web")).length;
const hydrationWarnings = web.results.filter((entry: any) => entry.hydrationWarnings?.length).length;
lines.push(`Referensi web produk tersedia untuk ${webCoverage} dari ${rows.length} pola rute. ${hydrationWarnings} capture kursus mencatat peringatan hidrasi. Tujuan redirect dan detail peringatan tersimpan di [routes.json](routes.json).`, "");
lines.push(`Tersedia ${referenceGroups.length} kelompok dengan tiga keadaan sepadan pada ${new Set(referenceGroups.map(group => group.route)).size} pola rute di kedua ukuran perangkat. Satu kelompok tambahan mencakup tiga keadaan review hasil pada ukuran Android. Hasil perbandingan perangkat tercatat per run.`, "");
for (const [platform, label] of [["android", "Android"], ["ios", "iOS"]] as const) {
  const summary = summaries[platform];
  if (!summary) {
    lines.push(`- **${label}** belum memiliki ringkasan perangkat.`);
    continue;
  }

  const totals = deviceEvidence[platform];
  const listCounts = (counts: object) => Object.entries(counts).map(([status, count]) => `${count} \`${status}\``).join(", ");
  const run = summary.data.workflowRun ?? summary.provenance.workflowRun;
  const detail = [`Run asli mencatat ${listCounts(totals.run_counts)}. Manifest saat ini mencatat ${listCounts(totals.current.case_counts)} dengan ${totals.current.assertions_verified} assertion terverifikasi.`,
    summary.provenance.reason, link(summary.path, "Ringkasan kasus"),
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
  const platform = platforms.map(p => {
    const summary = summaries[p];
    if (!summary) return `${p} belum tercatat`;
    const { case_counts, assertions_verified } = row.fixture_device_summary[p];
    const label = `${Object.entries(case_counts).map(([status, n]) => `${n} ${status}`).join(", ")} · ${assertions_verified} assertion terverifikasi`;
    const run = summary.provenance.workflowRun ?? summary.data.workflowRun;
    return run ? `[${p}](${run}) ${label}` : `${p} ${label}`;
  }).join("<br>");
  const compared = row.device_comparisons.map(item =>
    link(item.report, `${item.platform} ${item.id} · ${item.primary ? "run utama" : item.workflowRun?.split("/").at(-1) ?? "run historis"} · ${item.differingPixels === null ? item.status : item.status + " · " + item.differingPixels + " px berbeda"}${item.comparisonScope ? " · " + item.comparisonScope : ""} · flow ${item.standaloneScenario?.status ?? "belum tercatat"}`));
  lines.push(`| ${link(row.source, row.pattern)} | ${link(row.implementation.ui, row.implementation.symbol)}; ${row.operations.map((op: string) => `\`${op}\``).join("<br>")}<br>${link(row.contract_doc, "kontrak dan izin")} | ${available.length} / ${blocked}; ${assertions} assertion yang direncanakan | ${screenshots} | ${[platform, ...compared].join("<br>")} |`);
}
lines.push("", "Jumlah run asli dipertahankan. `historical_changed` menandai kasus lama yang berubah dan tidak menambah assertion terverifikasi. Setiap kasus di JSON mencatat hasil, marker saat run dan SHA perangkat. `runnable` menandai fixture yang dapat dijalankan, sedangkan `blocked` menyertakan alasannya. Perbandingan visual tiga keadaan per item dan bukti aksesibilitas masih memerlukan evaluasi perangkat.", "");
writeFileSync(join(output, "routes.md"), lines.join("\n"));
console.log(JSON.stringify({ routes: rows.length, webProductCaptures: rows.reduce((n: number, row: any) => n + row.web_evidence.filter((e: any) => e.evidence === "authenticated product web").length, 0), fixtureCases: fixtureCases.length, android: !!summaries.android, ios: !!summaries.ios }));

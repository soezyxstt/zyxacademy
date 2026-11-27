import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { verifyWebCaptures } from "../visual/native-parallel/student/verify-web-captures";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scripts = "tests/visual/native-parallel/student";
const evidence = "packages/native-parity/student/evidence/device-runs";
const android = `${evidence}/45824831032/android/smoke-summary.json`;
const ios = `${evidence}/45803927675/ios/smoke-summary.json`;
const empty = "student.community.leaderboard.empty";
let workspace: string;

function run(script: string, args: string[]) {
  execFileSync(process.execPath, [`${scripts}/${script}.ts`, ...args]);
}

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "student-evidence-report-"));
  run("generate-smoke", [workspace]);
});

afterAll(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

function readReport(manifest = join(workspace, "manifest.json"), androidSummary = android, iosSummary = ios) {
  const output = join(workspace, "reports");
  run("generate-report", [`--manifest=${manifest}`, `--android=${androidSummary}`, `--ios=${iosSummary}`, `--output=${output}`]);
  return {
    report: JSON.parse(readFileSync(join(output, "routes.json"), "utf8")),
    markdown: readFileSync(join(output, "routes.md"), "utf8"),
  };
}

test("retained runs keep their original counts and changed assertions receive zero current credit", () => {
  const { report, markdown } = readReport();
  const leaderboard = report.routes.find((route: { pattern: string }) => route.pattern === "/leaderboard");
  const changed = leaderboard.fixture_cases.find((item: { id: string }) => item.id === empty);
  expect(changed.marker).toEqual({ text: "Belum ada peringkat" });
  expect(changed.android).toMatchObject({
    status: "historical_changed", status_at_run: "passed", changed_fields: ["marker"],
    assertions_verified: 0, marker_at_run: { text: "Belum ada siswa dalam peringkat ini." },
    definition_at_run: { path: "/leaderboard", scenario: "empty", theme: "dark", steps: [] },
    retained_capture_at_run: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    sourceHead: expect.any(String), workflowRun: expect.stringContaining("/45824831032"),
  });
  expect(changed.android.retained_capture).toBeUndefined();
  expect(changed.ios).toMatchObject({
    status: "historical_changed", status_at_run: "not_run", changed_fields: ["marker"],
    assertions_verified: 0, summary: ios, job_status: "build_failed_before_device_flows",
  });
  expect(leaderboard.fixture_device_summary.android.case_counts.historical_changed).toBeGreaterThanOrEqual(1);

  const platform = report.device_evidence_summary;
  expect(platform.android.run_counts).toEqual(JSON.parse(readFileSync(android, "utf8")).counts);
  expect(platform.ios.run_counts).toEqual({ not_run: 125, blocked: 66 });
  expect(platform.ios.current.case_counts.historical_changed).toBeGreaterThan(0);
  expect(platform.ios.current.assertions_verified).toBe(0);
  expect(platform.android.current.case_counts.passed).toBeLessThan(platform.android.run_counts.passed);
  expect(markdown).toContain("Run asli mencatat 125 `not_run`, 66 `blocked`.");
  expect(markdown).toContain("historical_changed");

  const calendar = report.routes.find((route: { pattern: string }) => route.pattern === "/calendar");
  expect(calendar.device_comparisons).toEqual(expect.arrayContaining(
    ["calendar-all", "calendar-tutorial", "calendar-empty-filter"].map(id => expect.objectContaining({
      id, platform: "android", differingPixels: expect.any(Number),
    })),
  ));
  expect(calendar.known_differences).toContain("Per-platform outcomes");
});

test("path, scenario, theme and ordered actions form part of the evidence definition", () => {
  const manifest = JSON.parse(readFileSync(join(workspace, "manifest.json"), "utf8"));
  const caseId = "student.community.pet.empty";
  const route = manifest.routes.find((entry: { source: string }) => entry.source === "app/(student)/pet/page.tsx");
  const entry = route.cases.find((row: { id: string }) => row.id === caseId);
  const original = readReport().report.routes.find((row: { pattern: string }) => row.pattern === "/pet");
  const baseline = original.fixture_cases.find((row: { id: string }) => row.id === caseId);
  expect(baseline.android).toMatchObject({ status: "passed", status_at_run: "passed", assertions_verified: 2 });
  expect(baseline.android.changed_fields).toBeUndefined();
  expect(entry.steps).toHaveLength(2);

  entry.path += "?view=equipment";
  entry.scenario = "synthetic-revision";
  entry.theme = entry.theme === "light" ? "dark" : "light";
  entry.steps.reverse();
  const changedManifest = join(workspace, "changed-manifest.json");
  writeFileSync(changedManifest, JSON.stringify(manifest));
  const { report } = readReport(changedManifest);
  const revised = report.routes.find((row: { pattern: string }) => row.pattern === "/pet");
  const outcome = revised.fixture_cases.find((row: { id: string }) => row.id === caseId).android;
  expect(outcome).toMatchObject({ status: "historical_changed", changed_fields: ["path", "scenario", "theme", "steps"],
    status_at_run: baseline.android.status_at_run, assertions_verified: 0 });
});


test("a newer partial run retains the older measured comparisons without changing current case credit", () => {
  const newer = `${evidence}/45834308919/android`;
  const earlier = `${evidence}/45829658265/android`;
  const { report, markdown } = readReport(undefined, `${newer}/smoke-summary.json`);
  const selected = report.device_evidence_summary.android;
  expect(selected.summary).toBe(`${newer}/smoke-summary.json`);
  expect(selected.run_counts).toEqual({ passed: 175, failed: 25, blocked: 3 });
  expect(selected.current.case_counts.failed).toBe(23);

  type Comparison = { report: string; id: string; status: string; differingPixels: number | null; primary: boolean };
  const comparisons = report.routes.flatMap((row: { device_comparisons: Comparison[] }) => row.device_comparisons) as Comparison[];
  const measured = (directory: string) => comparisons.filter(row =>
    row.report === `${directory}/comparison.json` && row.differingPixels !== null);
  const earlierPairs = measured(earlier);
  expect(earlierPairs).toHaveLength(26);
  expect(new Set(earlierPairs.map(row => row.id)).size).toBe(26);
  const earlierProvenance = JSON.parse(readFileSync(`${earlier}/provenance.json`, "utf8"));
  for (const item of earlierPairs) expect(item).toMatchObject({
    primary: false, sourceHead: earlierProvenance.sourceHead, checkoutSha: earlierProvenance.checkoutSha,
    workflowRun: earlierProvenance.workflowRun, artifact: earlierProvenance.artifact,
  });
  expect(measured(newer)).toHaveLength(3);
  const newerProvenance = JSON.parse(readFileSync(`${newer}/provenance.json`, "utf8"));
  for (const item of measured(newer)) expect(item).toMatchObject({
    primary: true, sourceHead: newerProvenance.sourceHead, checkoutSha: newerProvenance.checkoutSha,
  });
  expect(comparisons.filter(row => row.id === "results-mixed" && row.report === `${newer}/comparison.json`)).toEqual([
    expect.objectContaining({ primary: true, status: "missing", differingPixels: null }),
  ]);
  expect(comparisons.filter(row => !row.primary).every(row => row.differingPixels !== null)).toBe(true);
  expect(markdown).toContain("results-mixed · 45829658265");
});

test("a changed Playwright screenshot loses evidence credit in both product manifest formats", () => {
  const file = "student-capture.png";
  writeFileSync(join(workspace, file), "first snapshot");
  const digest = createHash("sha256").update("first snapshot").digest("hex");
  const flat = { id: "settings", screenshot: file, screenshotSha256: digest };
  const multiple = { id: "material", screenshots: [{ file, sha256: digest }] };
  for (const entry of [flat, multiple]) expect(verifyWebCaptures(entry, workspace, true)[0].status).toBe("available");
  writeFileSync(join(workspace, file), "changed snapshot");
  for (const entry of [flat, multiple]) expect(verifyWebCaptures(entry, workspace, true)[0].status).toBe("sha256_mismatch");
});

test("quiz gateway and player share one route and retain their own three-state references", () => {
  const { report } = readReport();
  const quiz = report.routes.find((row: { pattern: string }) => row.pattern === "/courses/[id]/quiz/[quizId]");
  const images = quiz.web_evidence.map((entry: { id: string }) => entry.id) as string[];
  for (const platform of ["android", "ios"]) {
    expect(images).toEqual(expect.arrayContaining(["new", "resumable", "exhausted"].map(state => `${platform}-quiz-gateway-${state}`)));
    expect(images).toEqual(expect.arrayContaining(["unanswered", "answered", "flagged-restored"].map(state => `${platform}-quiz-player-${state}`)));
  }
  const settings = report.routes.find((row: { pattern: string }) => row.pattern === "/settings");
  expect(settings.web_evidence).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "android-settings-en-light", locale: "en", theme: "light" }),
    expect.objectContaining({ id: "ios-settings-id-dark", locale: "id", theme: "dark" }),
  ]));
});

test("signed Android review ignores mislabelled iOS comparisons", () => {
  const summary = join(workspace, "smoke-summary.json");
  const id = "assessment-result-review-released-quiz";
  writeFileSync(summary, JSON.stringify({ counts: {}, routes: [] }));
  writeFileSync(join(workspace, "comparison.json"), JSON.stringify([{ id, status: "pass", differing_pixels: 0 }]));
  const { report } = readReport(undefined, summary, summary);
  const review = report.routes.find((row: { pattern: string }) => row.pattern === "/courses/[id]/my-results/[submissionId]");
  expect(review.device_comparisons.filter((row: { id: string }) => row.id === id))
    .toEqual([expect.objectContaining({ platform: "android", id, differingPixels: 0 })]);
});

import { afterAll, beforeAll, expect, test } from "bun:test";
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

function readReport(manifest = join(workspace, "manifest.json")) {
  const output = join(workspace, "reports");
  run("generate-report", [`--manifest=${manifest}`, `--android=${android}`, `--ios=${ios}`, `--output=${output}`]);
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

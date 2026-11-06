import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  EXPECTED_ORIGINAL_BUILD_ID,
  verifyOriginalPreOptimizationBuild,
  type BuildProvenanceVerification,
  type SanitizedTargetVerification,
} from "./staging-env-loader";

export type BuildKind = "baseline" | "candidate";
export function parseBuildKind(value = "baseline"): BuildKind {
  if (value !== "baseline" && value !== "candidate") throw new Error("INVALID_BUILD_KIND");
  return value;
}

export function sourceHash(root = process.cwd()): string {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
    .toString().split("\0").filter((path) => path && !path.startsWith(".env") &&
      !path.startsWith("artifacts/") && !path.startsWith("docs/") && !path.startsWith("plans/"))
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path).update("\0");
    hash.update(existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : "<deleted>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function targetIdentity(target: SanitizedTargetVerification): string {
  if (!target.verified || !target.readOnlyEnforced || !target.distinctFromProduction) {
    throw new Error("UNVERIFIED_STAGING_TARGET");
  }
  return JSON.stringify(target);
}

export function preserveOriginalBaseline(root = process.cwd()): void {
  const archive = resolve(root, "artifacts/performance/original-baseline");
  const manifestPath = resolve(archive, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.provenance?.buildId !== EXPECTED_ORIGINAL_BUILD_ID || manifest.provenance?.isOriginalPreOptimizationBuild !== true) throw new Error("BASELINE_ARCHIVE_MISMATCH");
    for (const name of ["baseline-summary.json", "baseline-report.md"]) {
      const digest = createHash("sha256").update(readFileSync(resolve(archive, name))).digest("hex");
      if (digest !== manifest.files[name]) throw new Error("BASELINE_ARCHIVE_MISMATCH");
    }
    return;
  }
  const provenance = verifyOriginalPreOptimizationBuild(root);
  const summary = JSON.parse(readFileSync(resolve(root, "artifacts/performance/baseline/baseline-summary.json"), "utf8"));
  if (summary.buildProvenance?.buildId !== provenance.buildId) throw new Error("BASELINE_REPORT_BUILD_MISMATCH");
  const evidence = { warmSamplesPerRoute: summary.warmSamplesPerRoute,
    interpretation: "Smoke only when N < 40. Original report percentiles are not acceptance evidence.",
    routes: summary.routes.map((route: { routeId: string; status: string; warmValidSampleCount: number; warmFailedSampleCount: number }) => ({
      routeId: route.routeId, status: route.status, warmValidSampleCount: route.warmValidSampleCount,
      warmFailedSampleCount: route.warmFailedSampleCount,
    })),
  };
  const files: Record<string, string> = {};
  mkdirSync(archive, { recursive: true });
  for (const name of ["baseline-summary.json", "baseline-report.md"]) {
    const content = readFileSync(resolve(root, "artifacts/performance/baseline", name));
    files[name] = createHash("sha256").update(content).digest("hex");
    writeFileSync(resolve(archive, name), content, { flag: "wx", mode: 0o444 });
  }
  writeFileSync(manifestPath, JSON.stringify({ provenance, evidence, files }, null, 2), { flag: "wx", mode: 0o444 });
}

export function recordCandidateBuild(target: SanitizedTargetVerification, expectedSourceHash: string, root = process.cwd()): void {
  if (sourceHash(root) !== expectedSourceHash) throw new Error("SOURCE_CHANGED_DURING_BUILD");
  const buildId = readFileSync(resolve(root, ".next/BUILD_ID"), "utf8").trim();
  if (!buildId) throw new Error("MISSING_CANDIDATE_BUILD_ID");
  writeFileSync(resolve(root, ".next/zyx-candidate-identity.json"), JSON.stringify({
    buildKind: "candidate", buildId, sourceHash: expectedSourceHash,
    target: targetIdentity(target), builtAtIso: new Date().toISOString(),
  }, null, 2));
}

export function verifyBuild(kind: BuildKind, target: SanitizedTargetVerification, root = process.cwd()): BuildProvenanceVerification {
  targetIdentity(target);
  if (kind === "baseline") return verifyOriginalPreOptimizationBuild(root);
  const path = resolve(root, ".next/zyx-candidate-identity.json");
  if (!existsSync(path)) throw new Error("MISSING_CANDIDATE_IDENTITY");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const idPath = resolve(root, ".next/BUILD_ID");
  if (!existsSync(idPath)) throw new Error("MISSING_CANDIDATE_BUILD_ID");
  const buildId = readFileSync(idPath, "utf8").trim();
  if (!buildId || manifest.buildKind !== "candidate" || manifest.buildId !== buildId ||
      manifest.sourceHash !== sourceHash(root) || manifest.target !== targetIdentity(target)) {
    throw new Error("CANDIDATE_IDENTITY_MISMATCH");
  }
  return { buildId, buildTimestampIso: manifest.builtAtIso, isOriginalPreOptimizationBuild: false,
    containsPostOptimizationSymbol: null, verificationReason: "Candidate identity verified against source, build ID, and read-only staging target",
    buildKind: "candidate", sourceHash: manifest.sourceHash };
}

export function writeServerRecord(path: string, record: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
}

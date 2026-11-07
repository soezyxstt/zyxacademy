import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseBuildKind, recordCandidateBuild, sourceHash, verifyBuild } from "../../scripts/performance/build-provenance";
import type { SanitizedTargetVerification } from "../../scripts/performance/staging-env-loader";

const target: SanitizedTargetVerification = {
  verified: true, environment: "staging", readOnlyEnforced: true, distinctFromProduction: true,
  projectId: "test-project", branchId: "test-stage", productionBranchId: "test-production",
  databaseName: "test", hostHash: "stage-hash", productionHostHash: "production-hash", storageBucket: "test-stage",
};

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(resolve(tmpdir(), "zyx-candidate-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(resolve(root, ".gitignore"), ".next/\n");
    writeFileSync(resolve(root, "source.ts"), "export const value = 1;\n");
    mkdirSync(resolve(root, ".next"));
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("candidate build identity", () => {
  test("defaults to baseline and rejects bypass modes", () => {
    expect(parseBuildKind()).toBe("baseline");
    expect(() => parseBuildKind("skip")).toThrow("INVALID_BUILD_KIND");
  });
  test("fails closed without a candidate manifest or build ID", () => fixture((root) => {
    expect(() => verifyBuild("candidate", target, root)).toThrow("MISSING_CANDIDATE_IDENTITY");
    writeFileSync(resolve(root, ".next/BUILD_ID"), "candidate-one");
    recordCandidateBuild(target, sourceHash(root), root);
    unlinkSync(resolve(root, ".next/BUILD_ID"));
    expect(() => verifyBuild("candidate", target, root)).toThrow("MISSING_CANDIDATE_BUILD_ID");
  }));
  test("binds the candidate to source, build ID, and verified staging target", () => fixture((root) => {
    writeFileSync(resolve(root, ".next/BUILD_ID"), "candidate-one");
    recordCandidateBuild(target, sourceHash(root), root);
    expect(verifyBuild("candidate", target, root).buildKind).toBe("candidate");
    expect(() => verifyBuild("candidate", { ...target, branchId: "different" }, root)).toThrow("CANDIDATE_IDENTITY_MISMATCH");
    expect(() => verifyBuild("candidate", { ...target, readOnlyEnforced: false }, root)).toThrow("UNVERIFIED_STAGING_TARGET");
    writeFileSync(resolve(root, ".next/BUILD_ID"), "different");
    expect(() => verifyBuild("candidate", target, root)).toThrow("CANDIDATE_IDENTITY_MISMATCH");
    writeFileSync(resolve(root, ".next/BUILD_ID"), "candidate-one");
    writeFileSync(resolve(root, "source.ts"), "changed");
    expect(() => verifyBuild("candidate", target, root)).toThrow("CANDIDATE_IDENTITY_MISMATCH");
  }));
});

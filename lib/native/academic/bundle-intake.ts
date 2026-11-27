import "server-only";
import { createHash } from "node:crypto";
import { matchesCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { env } from "@/lib/env";
import type { BundleIntakeKind } from "@/packages/native-parity/academic/courses/intake";
import { issueIntakeProof, verifyIntakeProof } from "./intake-proof";
import { intakeError, intakeJson } from "./intake-scope";

type Target = {
  scope: { accountId: string; sessionId: string; courseId: string };
  identity: ResolvedCourseIdentity;
};
type Manifest = { courseId: string; bundleId: string; bundleChecksum: string; schemaVersion: string };

export function readNativeBundleIntake(target: Target, kind: BundleIntakeKind, form: FormData,
  bytes: Uint8Array, manifest: Manifest, summarize: () => { total: number; titles: string[] }) {
  if (!matchesCourseIdentity(manifest.courseId, target.identity)) return intakeError(409, "BUNDLE_COURSE_MISMATCH");

  const revision = createHash("sha256").update(bytes).digest("hex");
  const intent = form.get("intent");
  if (intent === "preview") {
    return intakeJson({ persisted: false, bundleId: manifest.bundleId, schemaVersion: manifest.schemaVersion,
      checksum: manifest.bundleChecksum, ...summarize(),
      proof: issueIntakeProof(env.BETTER_AUTH_SECRET, target.scope, kind, revision) });
  }
  if (intent !== "stage") return intakeError(400, "INVALID_INPUT");
  const proof = form.get("proof");
  if (typeof proof !== "string" || !verifyIntakeProof(env.BETTER_AUTH_SECRET, target.scope, kind, revision, proof)) {
    return intakeError(409, "BUNDLE_PREVIEW_CHANGED");
  }
  return null;
}

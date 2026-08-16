import { createHash } from "node:crypto";

export const STAGING_PINECONE_NOT_PROVISIONED = "not-provisioned" as const;

export function stagingPineconeFingerprint(indexName: string): string {
  const normalized = indexName.trim().toLowerCase();
  return createHash("sha256").update(`pinecone-staging-index:${normalized}`, "utf8").digest("hex").slice(0, 16);
}

export function assertExactStagingPineconeTarget(indexName: string): void {
  const normalized = indexName.trim();
  if (!normalized || normalized.includes("*") || normalized.includes("?") || normalized.includes(",")) {
    throw new Error("PINECONE_TARGET_MUST_BE_EXACT");
  }
  if (/(^|[-_.:/])(prod|production|live)([-_.:/]|$)/i.test(normalized)) {
    throw new Error("PINECONE_PRODUCTION_TARGET_REJECTED");
  }
  if (!/staging/i.test(normalized)) throw new Error("PINECONE_TARGET_MUST_BE_STAGING");
}

export type CallerClassification = "controlled-decommission" | "legacy-preservation" | "runtime";

export function classifyPineconeCaller(filePath: string, _line: string): CallerClassification {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  if (normalized.endsWith("package.json") && /decommission-pinecone/i.test(_line)) return "controlled-decommission";
  if (
    normalized.endsWith("scripts/staging/decommission-pinecone.ts") ||
    normalized.endsWith("scripts/staging/legacy-caller-inventory.ts") ||
    normalized.endsWith("scripts/staging/finalize-cutover.ts") ||
    normalized.endsWith("lib/staging/cutover-contract.ts")
  ) return "controlled-decommission";
  if (
    normalized.includes("docs/") ||
    normalized.endsWith("agents.md") ||
    normalized.includes("tests/") ||
    normalized.endsWith("db/schema.ts") ||
    normalized.endsWith("scripts/test-onboarding-blockers.ts") ||
    normalized.endsWith("lib/vectorize/contracts.ts") ||
    normalized.includes("app/(admin)/admin/ai/(content)/materials") ||
    normalized.includes("app/api/admin/material-instances") ||
    normalized.endsWith("app/actions/tutor-management.ts") ||
    normalized.endsWith("lib/ko-extractor.ts") ||
    normalized.endsWith("components/admin/bundle-importer-tab.tsx") ||
    normalized.endsWith("components/admin/assessment-bundle-importer-tab.tsx")
  ) return "legacy-preservation";
  return "runtime";
}

export function isLegacyWriteCaller(line: string): boolean {
  return /(?:upsert|delete|update|mirror|new\s+pinecone|pinecone\s+api)/i.test(line);
}

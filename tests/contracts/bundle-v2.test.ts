import { describe, expect, it } from "bun:test";
import { auditMutasiSchema, imporBundleSchema, itemImporBundleSchema, publikasiBundleSchema, reviewBundleSchema, uniqueBundleImportIdentitySchema } from "@/lib/bundle/contracts";

const now = "2026-08-02T00:00:00.000Z";
const checksum = "b".repeat(64);
const baseImport = { id: "import-1", bundleId: "bundle-1", version: 1, checksum, status: "approved" as const, importedAt: now, approvedAt: now };

describe("Plan 004 bundle lifecycle contracts", () => {
  it("accepts a unique approved import and atomic publication", () => {
    expect(imporBundleSchema.parse(baseImport).status).toBe("approved");
    expect(uniqueBundleImportIdentitySchema.parse([baseImport])).toHaveLength(1);
    expect(itemImporBundleSchema.parse({ id: "item-1", importId: "import-1", entityType: "artikel", entityId: "artikel-1", entityChecksum: checksum })).toBeTruthy();
    expect(reviewBundleSchema.parse({ id: "review-1", importId: "import-1", reviewerId: "reviewer-1", decision: "approved", reviewedAt: now })).toBeTruthy();
    expect(auditMutasiSchema.parse({ id: "audit-1", bundleId: "bundle-1", actorId: "reviewer-1", action: "published", entityIds: ["artikel-1"], occurredAt: now })).toBeTruthy();
    expect(publikasiBundleSchema.parse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1", "soal-1"], atomic: true, publishedAt: now })).toBeTruthy();
  });

  it("rejects duplicate bundle checksum and non-atomic or unapproved publication", () => {
    expect(uniqueBundleImportIdentitySchema.safeParse([baseImport, { ...baseImport, id: "import-2" }]).success).toBe(false);
    expect(imporBundleSchema.safeParse({ ...baseImport, status: "approved", approvedAt: null }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "review", publishedEntityIds: ["artikel-1"], atomic: true, publishedAt: now }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1"], atomic: false, publishedAt: now }).success).toBe(false);
  });

  it("rejects unknown fields in import and publication records", () => {
    expect(imporBundleSchema.safeParse({ ...baseImport, extra: true }).success).toBe(false);
    expect(itemImporBundleSchema.safeParse({ id: "item-1", importId: "import-1", entityType: "unknown", entityId: "artikel-1", entityChecksum: checksum }).success).toBe(false);
    expect(reviewBundleSchema.safeParse({ id: "review-1", importId: "import-1", reviewerId: "reviewer-1", decision: "approved", reviewedAt: now, extra: true }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1"], atomic: true, publishedAt: now, extra: true }).success).toBe(false);
  });
});

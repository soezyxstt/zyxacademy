import { describe, expect, it } from "bun:test";
import {
  assertExactStagingPineconeTarget,
  classifyPineconeCaller,
  isLegacyWriteCaller,
  stagingPineconeFingerprint,
  STAGING_PINECONE_NOT_PROVISIONED,
} from "@/lib/staging/cutover-contract";

describe("Plan 016 cutover contracts", () => {
  it("accepts only exact staging Pinecone targets", () => {
    expect(() => assertExactStagingPineconeTarget("zyx-staging-index")).not.toThrow();
    expect(stagingPineconeFingerprint("zyx-staging-index")).toHaveLength(16);
    expect(() => assertExactStagingPineconeTarget("zyx-production-index")).toThrow("PRODUCTION");
    expect(() => assertExactStagingPineconeTarget("zyx-staging-*")).toThrow("EXACT");
  });

  it("has a deterministic fingerprint for a staging index that was never provisioned", () => {
    expect(stagingPineconeFingerprint(STAGING_PINECONE_NOT_PROVISIONED)).toHaveLength(16);
    expect(STAGING_PINECONE_NOT_PROVISIONED).toBe("not-provisioned");
  });

  it("classifies preservation and controlled decommission matches", () => {
    expect(classifyPineconeCaller("db/schema.ts", "pineconeVectorId: text() ")).toBe("legacy-preservation");
    expect(classifyPineconeCaller("scripts/staging/decommission-pinecone.ts", "Pinecone delete")).toBe("controlled-decommission");
    expect(classifyPineconeCaller("lib/vector-store.ts", "new Pinecone()")).toBe("runtime");
    expect(isLegacyWriteCaller("await namespace.upsert(records)")).toBe(true);
  });
});

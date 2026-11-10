import { expect, test } from "bun:test";
import { adminKnowledgeSmokeArguments, assertAdminKnowledgeVector, verifyObsoleteAdminVectors } from "../../scripts/neon/smoke-admin-knowledge";
import { chunkAdminKnowledgeSource } from "../../lib/admin-ops-ai/admin-knowledge-chunker";
import { CANONICAL_VECTOR_PROFILE, parseVersionedVectorId } from "../../lib/vectorize/contracts";

test("admin knowledge acceptance requires the pinned production target and explicit dry-run mode", () => {
  expect(adminKnowledgeSmokeArguments(["production"]).dryRunOnly).toBe(false);
  expect(adminKnowledgeSmokeArguments(["production", "--dry-run"]).dryRunOnly).toBe(true);
  expect(() => adminKnowledgeSmokeArguments(["staging"])).toThrow("ADMIN_KNOWLEDGE_SMOKE_PRODUCTION_REQUIRED");
  expect(() => adminKnowledgeSmokeArguments(["production", "--delete"])).toThrow("ADMIN_KNOWLEDGE_SMOKE_ARGUMENTS_INVALID");
});

test("obsolete admin vectors require observed absence without unsupported binding enumeration", async () => {
  let reads = 0;
  await verifyObsoleteAdminVectors(async ids => ++reads === 1 ? ids.map(id => ({ id })) : [], ["old"], async () => {});
  expect(reads).toBe(2);
  await expect(verifyObsoleteAdminVectors(async () => [{ id: "foreign" }], ["old"], async () => {})).rejects.toThrow("FOREIGN_VECTOR");
  await expect(verifyObsoleteAdminVectors(async () => [{ id: "old" }], ["old"], async () => {})).rejects.toThrow("OBSOLETE_VECTOR_RETAINED");
  await expect(verifyObsoleteAdminVectors(async () => { throw new Error("HTTP_FAILURE"); }, ["old"])).rejects.toThrow("HTTP_FAILURE");
  const batches: number[] = [];
  await verifyObsoleteAdminVectors(async ids => { batches.push(ids.length); return []; }, Array.from({ length: 41 }, (_, i) => String(i)));
  expect(batches).toEqual([20, 20, 1]);
});

test("admin knowledge acceptance verifies exact identity, hash, dimensions and admin isolation", () => {
  const chunk = chunkAdminKnowledgeSource({
    id: "doc:acceptance", sourcePath: "docs/acceptance.md", sourceType: "doc", title: "Acceptance",
    normalizedContent: "# Acceptance\n\nCurated operations knowledge.", rawContent: "", contentHash: "a1".repeat(32), isVirtual: false,
  }).chunks[0];
  const vector = {
    id: chunk.vectorId, values: new Array(768).fill(0.2), metadata: {
      namespace: "admin_ops_knowledge" as const, entityType: "admin_document" as const,
      entityId: parseVersionedVectorId(chunk.vectorId).entityId, version: chunk.version,
      status: "active" as const, accessClass: "admin" as const, language: "id",
      profileId: CANONICAL_VECTOR_PROFILE.id, contentHash: chunk.contentHash,
    },
  };
  expect(() => assertAdminKnowledgeVector(chunk, vector)).not.toThrow();
  expect(() => assertAdminKnowledgeVector(chunk)).toThrow("ADMIN_KNOWLEDGE_VECTOR_MISSING");
  expect(() => assertAdminKnowledgeVector(chunk, { ...vector, values: vector.values.slice(1) })).toThrow("DIMENSION_MISMATCH");
  for (const metadata of [
    { ...vector.metadata, contentHash: "wrong" },
    { ...vector.metadata, accessClass: "enrolled" as const },
    { ...vector.metadata, namespace: "canonical_ideas" as const },
  ]) expect(() => assertAdminKnowledgeVector(chunk, { ...vector, metadata })).toThrow("ADMIN_KNOWLEDGE_VECTOR_METADATA_MISMATCH");
});

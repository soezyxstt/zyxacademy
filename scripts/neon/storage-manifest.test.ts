import { expect, test } from "bun:test";
import { canReuseStorageProof, signStorageManifest, verifyStorageManifest, type StorageManifest } from "./storage-manifest";

const context = { sourceEndpoint: "https://source.example/", sourceBucket: "source", targetEndpoint: "https://target.example/", targetBucket: "target" };
const version = { size: 6, etag: '"version-1"', lastModified: "2026-11-02T00:00:00.000Z" };
const proof = { source: version, destination: version, sha256: "a".repeat(64) };

test("signed storage proofs reject tampering, wrong credentials and a different migration target", () => {
  const manifest: StorageManifest = { version: 1, context, objects: { objectHash: proof } };
  const signed = signStorageManifest(manifest, "k".repeat(32));
  expect(verifyStorageManifest(signed, context, "k".repeat(32))).toEqual(manifest);
  expect(() => verifyStorageManifest(signed, context, "x".repeat(32))).toThrow("STORAGE_MANIFEST_SIGNATURE_MISMATCH");
  expect(() => verifyStorageManifest(signed, { ...context, targetBucket: "other" }, "k".repeat(32))).toThrow("STORAGE_MANIFEST_CONTEXT_MISMATCH");
  const changed = structuredClone(signed); changed.manifest.objects.objectHash.sha256 = "b".repeat(64);
  expect(() => verifyStorageManifest(changed, context, "k".repeat(32))).toThrow("STORAGE_MANIFEST_SIGNATURE_MISMATCH");
});

test("reuse requires the exact source version and unchanged destination bytes and version", () => {
  expect(canReuseStorageProof(proof, version, version)).toBe(true);
  for (const changed of [{...version,size:7},{...version,etag:'"changed"'},{...version,lastModified:"2026-11-03T00:00:00.000Z"}]) {
    expect(canReuseStorageProof(proof, changed, version)).toBe(false);
    expect(canReuseStorageProof(proof, version, changed)).toBe(false);
  }
  expect(canReuseStorageProof(proof, version, undefined)).toBe(false);
  expect(canReuseStorageProof(undefined, version, version)).toBe(false);
});

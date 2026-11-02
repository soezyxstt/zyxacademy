import { createHmac, timingSafeEqual } from "node:crypto";

export type ObjectVersion = { size: number; etag: string; lastModified: string };
export type StorageProof = { source: ObjectVersion; destination: ObjectVersion; sha256: string };
export type StorageContext = { sourceEndpoint: string; sourceBucket: string; targetEndpoint: string; targetBucket: string };
export type StorageManifest = { version: 1; context: StorageContext; objects: Record<string, StorageProof> };
type Signed = { manifest: StorageManifest; mac: string };

export function signStorageManifest(manifest: StorageManifest, key: string): Signed {
  if (key.length < 32) throw new Error("MANIFEST_KEY_TOO_SHORT");
  return { manifest, mac: createHmac("sha256", key).update("neon-storage-manifest-v1\0" + JSON.stringify(manifest)).digest("hex") };
}

export function verifyStorageManifest(signed: Signed, context: StorageContext, key: string): StorageManifest {
  const expected = signStorageManifest(signed.manifest, key).mac;
  if (!/^[a-f0-9]{64}$/.test(signed.mac) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signed.mac, "hex"))) throw new Error("STORAGE_MANIFEST_SIGNATURE_MISMATCH");
  if (signed.manifest.version !== 1 || JSON.stringify(signed.manifest.context) !== JSON.stringify(context)) throw new Error("STORAGE_MANIFEST_CONTEXT_MISMATCH");
  return signed.manifest;
}

export function canReuseStorageProof(proof: StorageProof | undefined, source: ObjectVersion, destination: ObjectVersion | undefined): boolean {
  return Boolean(proof && destination && /^[a-f0-9]{64}$/.test(proof.sha256) &&
    proof.source.size === source.size && proof.source.etag === source.etag && proof.source.lastModified === source.lastModified &&
    proof.destination.size === destination.size && proof.destination.etag === destination.etag &&
    Math.floor(Date.parse(proof.destination.lastModified) / 1000) === Math.floor(Date.parse(destination.lastModified) / 1000));
}

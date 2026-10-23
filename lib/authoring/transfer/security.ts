import { CompactEncrypt, compactDecrypt, decodeProtectedHeader, importJWK, jwtVerify, SignJWT, type JWK } from "jose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, sha256, stableJson, TRANSFER_PROTOCOL } from "./contracts";
import { retryAfterSeconds } from "@/lib/date-utils";
import { authoringValidationSnapshot } from "@/lib/authoring/mcp-contract-revision";

export class PeerUnavailableError extends Error {
  constructor(readonly retryAfter = 0) { super("PEER_TEMPORARILY_UNAVAILABLE"); }
}

const publicSigning = z.object({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string(), d: z.never().optional() }).passthrough();
const publicEncryption = z.object({ kty: z.literal("EC"), crv: z.literal("P-256"), x: z.string(), y: z.string(), d: z.never().optional() }).passthrough();
const origin = z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; });
const retiredPublicKey = z.object({ keyId: z.string().min(1), signingKey: publicSigning, acceptUntil: z.number().int().positive() }).strict();
const privateSigning = z.object({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string(), d: z.string() }).passthrough();
const privateEncryption = z.object({ kty: z.literal("EC"), crv: z.literal("P-256"), x: z.string(), y: z.string(), d: z.string() }).passthrough();
const retiredPrivateKey = z.object({ keyId: z.string().min(1), signingKey: privateSigning, encryptionKey: privateEncryption, acceptUntil: z.number().int().positive() }).strict();
const peerSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), origin, keyId: z.string().min(1),
  signingKey: publicSigning, encryptionKey: publicEncryption, allowSource: z.boolean(), allowDestination: z.boolean(),
  databaseFingerprint: z.string().length(64), storageFingerprint: z.string().length(64),
  previousKeys: z.array(retiredPublicKey).max(2).optional(),
}).strict().refine(value => new Set([value.keyId, ...(value.previousKeys ?? []).map(key => key.keyId)]).size === 1 + (value.previousKeys?.length ?? 0));
const identitySchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), origin, keyId: z.string().min(1),
  signingKey: privateSigning, encryptionKey: privateEncryption,
  previousKeys: z.array(retiredPrivateKey).max(2).optional(),
}).strict().refine(value => new Set([value.keyId, ...(value.previousKeys ?? []).map(key => key.keyId)]).size === 1 + (value.previousKeys?.length ?? 0));
export type TransferPeer = z.infer<typeof peerSchema>;
export type TransferConfig = { identity: z.infer<typeof identitySchema>; peers: TransferPeer[]; databaseFingerprint: string; storageFingerprint: string };

export function transferConfig(): TransferConfig {
  if (!process.env.AUTHORING_TRANSFER_IDENTITY) fail("TRANSFER_CONFIGURATION_REQUIRED");
  try {
    const identity = identitySchema.parse(JSON.parse(process.env.AUTHORING_TRANSFER_IDENTITY || "null"));
    const peers = z.array(peerSchema).max(8).parse(JSON.parse(process.env.AUTHORING_TRANSFER_PEERS || "[]"));
    const database = process.env.TURSO_DATABASE_URL || process.env.TURSO_CONNECTION_URL || process.env.DATABASE_URL;
    if (!database || !process.env.R2_ENDPOINT || !process.env.R2_BUCKET) fail("TRANSFER_CONFIGURATION_REQUIRED");
    const databaseFingerprint = sha256(database.replace(/\/$/, "").replace(/^libsql:/, "https:"));
    const storageFingerprint = sha256(`${process.env.R2_ENDPOINT.replace(/\/$/, "")}/${process.env.R2_BUCKET}`);
    if (new Set(peers.map(p => p.id)).size !== peers.length || new Set(peers.map(p => p.origin)).size !== peers.length) fail("TRANSFER_CONFIGURATION_INVALID");
    if (peers.some(p => p.id === identity.id || p.origin === identity.origin || p.databaseFingerprint === databaseFingerprint || p.storageFingerprint === storageFingerprint)) fail("PEER_RESOURCE_COLLISION");
    return { identity, peers, databaseFingerprint, storageFingerprint };
  } catch (error) {
    if (error instanceof Error && /^(TRANSFER_|PEER_)/.test(error.message)) throw error;
    fail("TRANSFER_CONFIGURATION_INVALID");
  }
}
export function peerFor(config: TransferConfig, id: string, direction: "source" | "destination"): TransferPeer {
  const peer = config.peers.find(p => p.id === id);
  if (!peer || !(direction === "source" ? peer.allowSource : peer.allowDestination)) fail("PEER_DIRECTION_FORBIDDEN");
  return peer;
}
export async function signToken(config: TransferConfig, kind: string, audience: string, data: object, seconds: number): Promise<string> {
  return new SignJWT({ kind, ...data }).setProtectedHeader({ alg: "EdDSA", kid: config.identity.keyId, typ: "JWT" })
    .setIssuer(config.identity.id).setAudience(audience).setJti(randomUUID()).setIssuedAt().setExpirationTime(`${seconds}s`)
    .sign(await importJWK(config.identity.signingKey as JWK, "EdDSA"));
}
export async function verifyToken(config: TransferConfig, peer: TransferPeer | null, token: string, kind: string, audience = config.identity.id) {
  try {
    const issuer = peer ?? config.identity;
    const kid = decodeProtectedHeader(token).kid;
    const selected = kid === issuer.keyId ? issuer : issuer.previousKeys?.find(key => key.keyId === kid && key.acceptUntil > Date.now());
    if (!selected) fail("GRANT_INVALID");
    const { d: _private, ...key } = selected.signingKey as JWK;
    const { payload, protectedHeader } = await jwtVerify(token, await importJWK(key as JWK, "EdDSA"), {
      algorithms: ["EdDSA"], issuer: peer?.id ?? config.identity.id, audience, requiredClaims: ["exp", "iat", "jti"],
    });
    if (payload.kind !== kind || protectedHeader.kid !== selected.keyId) fail("GRANT_INVALID");
    return payload;
  } catch { fail("GRANT_INVALID"); }
}
export async function sealFor(peer: Pick<TransferPeer, "encryptionKey" | "keyId">, plaintext: string): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(plaintext)).setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM", kid: peer.keyId })
    .encrypt(await importJWK(peer.encryptionKey as JWK, "ECDH-ES"));
}
export async function sealLocal(config: TransferConfig, plaintext: string): Promise<string> {
  const { d: _private, ...key } = config.identity.encryptionKey;
  return sealFor({ encryptionKey: key, keyId: config.identity.keyId }, plaintext);
}
export async function openLocal(config: TransferConfig, value: string): Promise<string> {
  try {
    const kid = decodeProtectedHeader(value).kid;
    const selected = kid === config.identity.keyId ? config.identity : config.identity.previousKeys?.find(key => key.keyId === kid && key.acceptUntil > Date.now());
    if (!selected) fail("GRANT_INVALID");
    const { plaintext, protectedHeader } = await compactDecrypt(value, await importJWK(selected.encryptionKey as JWK, "ECDH-ES"), {
      keyManagementAlgorithms: ["ECDH-ES"], contentEncryptionAlgorithms: ["A256GCM"],
    });
    if (protectedHeader.kid !== selected.keyId) fail("GRANT_INVALID");
    return new TextDecoder().decode(plaintext);
  } catch { fail("GRANT_INVALID"); }
}
export function capabilities(config: TransferConfig) {
  return { protocol: TRANSFER_PROTOCOL, environmentId: config.identity.id, databaseFingerprint: config.databaseFingerprint,
    storageFingerprint: config.storageFingerprint, schemas: ["idea-bundle.v3", "product-bundle.v3", "product-bundle.v4"],
    contractHash: sha256(stableJson(authoringValidationSnapshot())),
    mapping: "exact_identity", sourceFigures: false, mode: "draft_only", overwrite: false };
}
/** Signed body binding and fixed relative paths prevent bearer replay to another operation or origin. */
export async function peerRequest(config: TransferConfig, peer: TransferPeer, operation: string, body: object, fetcher = fetch): Promise<Response> {
  if (!["inspect", "snapshots", "artifact"].includes(operation)) fail("TRANSFER_OPERATION_UNSUPPORTED");
  const serialized = stableJson(body);
  const proof = await signToken(config, "peer-request", peer.id, { operation, bodyHash: sha256(serialized) }, 60);
  try {
    const response = await fetcher(`${peer.origin}/api/internal/transfers/${operation}`, { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(60000), headers: { "content-type": "application/json", authorization: `Bearer ${proof}`, "x-transfer-peer": config.identity.id }, body: serialized });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) fail("GRANT_REVOKED");
      if (response.status === 409 || response.status === 422) fail("SOURCE_REVISION_CHANGED");
      if (response.status === 429 || response.status >= 500) throw new PeerUnavailableError(retryAfterSeconds(response.headers.get("retry-after")));
      fail("PEER_RESPONSE_INVALID");
    }
    return response;
  } catch (error) {
    if (error instanceof Error && /^(PEER_|GRANT_|SOURCE_)/.test(error.message)) throw error;
    throw new PeerUnavailableError();
  }
}

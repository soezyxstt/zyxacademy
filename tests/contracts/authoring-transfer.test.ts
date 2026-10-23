import { describe, expect, test } from "bun:test";
import { generateKeyPair, exportJWK } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describeBundle, resolveClosure } from "@/lib/authoring/transfer/bundles";
import { sha256, stableJson, validateInventory } from "@/lib/authoring/transfer/contracts";
import { capabilities, openLocal, peerFor, peerRequest, sealFor, sealLocal, signToken, verifyToken, type TransferConfig } from "@/lib/authoring/transfer/security";
import { ideaTransferFixture, productTransferFixture } from "../fixtures/transfer-bundles";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

async function configuration(id: string): Promise<TransferConfig> {
  const signing = await generateKeyPair("EdDSA", { extractable: true });
  const encryption = await generateKeyPair("ECDH-ES", { crv: "P-256", extractable: true });
  return { identity: { id, origin: `https://${id}.test`, keyId: "key-1", signingKey: await exportJWK(signing.privateKey) as TransferConfig["identity"]["signingKey"], encryptionKey: await exportJWK(encryption.privateKey) as TransferConfig["identity"]["encryptionKey"] },
    peers: [], databaseFingerprint: sha256(`db-${id}`), storageFingerprint: sha256(`storage-${id}`) };
}
function addPeer(source: TransferConfig, target: TransferConfig) {
  const { d: _s, ...signingKey } = target.identity.signingKey;
  const { d: _e, ...encryptionKey } = target.identity.encryptionKey;
  source.peers.push({ id: target.identity.id, origin: target.identity.origin, keyId: target.identity.keyId, signingKey, encryptionKey,
    allowSource: true, allowDestination: true, databaseFingerprint: target.databaseFingerprint, storageFingerprint: target.storageFingerprint });
}

describe("transfer protocol and exact dependency graph", () => {
  test("accepts real Idea V3 and learning Product V3/V4 archives", () => {
    expect(describeBundle("idea", "idea", ideaTransferFixture()).schemaVersion).toBe("idea-bundle.v3");
    expect(describeBundle("product", "product", productTransferFixture()).schemaVersion).toBe("product-bundle.v3");
    expect(describeBundle("product", "product", buildLocalVerificationFixture().bytes).schemaVersion).toBe("product-bundle.v4");
  });
  test("resolves the exact producer and validates the closure hash", async () => {
    const idea = describeBundle("idea", "idea", ideaTransferFixture());
    const product = describeBundle("product", "product", productTransferFixture());
    const result = await resolveClosure(product, async () => idea);
    expect(result.artifacts.map(a => a.id)).toEqual(["idea", "product"]);
    expect(validateInventory(result)).toEqual(result);
    expect(() => validateInventory({ ...result, closureHash: "f".repeat(64) })).toThrow("CHECKSUM_MISMATCH");
  });
  test("rejects a newer dependency, cross-course graph and cycles", async () => {
    const idea = describeBundle("idea", "idea", ideaTransferFixture());
    const product = describeBundle("product", "product", productTransferFixture());
    await expect(resolveClosure(product, async () => ({ ...idea, entities: idea.entities.map(e => ({ ...e, version: 2 })) }))).rejects.toThrow("DEPENDENCY_REVISION_UNAVAILABLE");
    await expect(resolveClosure(product, async () => ({ ...idea, courseId: "other" }))).rejects.toThrow("TRANSFER_SCOPE_MISMATCH");
    await expect(resolveClosure({ ...product, requirements: [idea.entities[0]] }, async () => ({ ...idea, requirements: [product.entities[0]] }))).rejects.toThrow("DEPENDENCY_REVISION_UNAVAILABLE");
  });
  test("duplicate identity and tampered bytes fail closed", async () => {
    const idea = describeBundle("idea", "idea", ideaTransferFixture());
    const other = { ...idea, id: "other", entities: idea.entities.map(e => ({ ...e, hash: "f".repeat(64) })) };
    const artifacts = [idea, other];
    expect(() => validateInventory({ protocol: "authoring-transfer.v1", rootId: "idea", artifacts, closureHash: sha256(stableJson(artifacts)) })).toThrow("IDENTITY_CONFLICT");
    expect(() => describeBundle("bad", "idea", new Uint8Array([1, 2]))).toThrow();
  });
});

describe("peer cryptography and capability isolation", () => {
  test("rotation accepts retained keys only until the configured deadline", async () => {
    const old = await configuration("a"), next = await configuration("a"), b = await configuration("b");
    next.identity.keyId = "key-2";
    addPeer(b, old);
    const oldToken = await signToken(old, "plan", "a", { value: 1 }, 60);
    const peerToken = await signToken(old, "source-grant", "b", {}, 60);
    const oldCiphertext = await sealLocal(old, "retained grant");
    const until = Date.now() + 60000;
    next.identity.previousKeys = [{ keyId: old.identity.keyId, signingKey: old.identity.signingKey, encryptionKey: old.identity.encryptionKey, acceptUntil: until }];
    const oldPeer = b.peers[0];
    addPeer(b, next);
    b.peers[1].previousKeys = [{ keyId: oldPeer.keyId, signingKey: oldPeer.signingKey, acceptUntil: until }];
    expect((await verifyToken(next, null, oldToken, "plan")).value).toBe(1);
    expect(await openLocal(next, oldCiphertext)).toBe("retained grant");
    await verifyToken(b, b.peers[1], peerToken, "source-grant");
    const newToken = await signToken(next, "plan", "a", {}, 60);
    await expect(verifyToken(old, null, newToken, "plan")).rejects.toThrow("GRANT_INVALID");
    next.identity.previousKeys[0].acceptUntil = Date.now() - 1;
    b.peers[1].previousKeys![0].acceptUntil = Date.now() - 1;
    await expect(verifyToken(next, null, oldToken, "plan")).rejects.toThrow("GRANT_INVALID");
    await expect(openLocal(next, oldCiphertext)).rejects.toThrow("GRANT_INVALID");
    await expect(verifyToken(b, b.peers[1], peerToken, "source-grant")).rejects.toThrow("GRANT_INVALID");
    await verifyToken(next, null, newToken, "plan");
  });
  test("handoff is readable only by the intended destination", async () => {
    const a = await configuration("a"), b = await configuration("b"), c = await configuration("c");
    addPeer(a, b); addPeer(b, a);
    const token = await signToken(a, "source-grant", "b", { grantId: "grant-one" }, 60);
    const sealed = await sealFor(a.peers[0], token);
    expect(await openLocal(b, sealed)).toBe(token);
    await expect(openLocal(c, sealed)).rejects.toThrow("GRANT_INVALID");
    expect((await verifyToken(b, b.peers[0], token, "source-grant")).grantId).toBe("grant-one");
    await expect(verifyToken(a, null, token, "source-grant")).rejects.toThrow("GRANT_INVALID");
    expect((await verifyToken(a, null, token, "source-grant", "b")).grantId).toBe("grant-one");
  });
  test("wrong kind, audience, key, expiry and ciphertext are rejected", async () => {
    const a = await configuration("a");
    const token = await signToken(a, "plan", "a", { value: 1 }, 60);
    await expect(verifyToken(a, null, token, "other")).rejects.toThrow("GRANT_INVALID");
    await expect(verifyToken(a, null, await signToken(a, "plan", "a", {}, -1), "plan")).rejects.toThrow("GRANT_INVALID");
    await expect(verifyToken(await configuration("a"), null, token, "plan")).rejects.toThrow("GRANT_INVALID");
    const sealed = await sealLocal(a, "private grant");
    expect(sealed).not.toContain("private grant");
    expect(await openLocal(a, sealed)).toBe("private grant");
    await expect(openLocal(a, sealed.slice(0, -4) + "abcd")).rejects.toThrow("GRANT_INVALID");
  });
  test("direction policy and request proof constrain destination and body", async () => {
    const a = await configuration("a"), b = await configuration("b"); addPeer(a, b); addPeer(b, a);
    a.peers[0].allowDestination = false;
    expect(() => peerFor(a, "b", "destination")).toThrow("PEER_DIRECTION_FORBIDDEN");
    expect(() => peerFor(a, "https://127.0.0.1", "source")).toThrow("PEER_DIRECTION_FORBIDDEN");
    let url = "";
    await peerRequest(a, a.peers[0], "inspect", { grantToken: "scoped" }, async (input, init) => {
      url = String(input);
      const proof = await verifyToken(b, b.peers[0], new Headers(init?.headers).get("authorization")!.slice(7), "peer-request");
      expect(proof.operation).toBe("inspect"); expect(proof.bodyHash).toBe(sha256(String(init?.body)));
      expect(init?.redirect).toBe("error"); return Response.json({ ok: true });
    });
    expect(url).toBe("https://b.test/api/internal/transfers/inspect");
    expect(capabilities(a)).toMatchObject({ sourceFigures: false, overwrite: false, mapping: "exact_identity" });
  });
});

test("MCP transfer scopes are opt-in and typed; old scopes cannot execute", async () => {
  const { registerTransferTools } = await import("@/lib/authoring/transfer/mcp");
  const { MCP_AUTHORING_DEFAULT_SCOPES, MCP_AUTHORING_SCOPES } = await import("@/lib/authoring/mcp-workflows");
  expect(MCP_AUTHORING_DEFAULT_SCOPES).not.toContain("authoring:transfer:execute");
  expect(MCP_AUTHORING_SCOPES).toContain("authoring:transfer:execute");
  const server = new McpServer({ name: "transfer-test", version: "1" });
  registerTransferTools(server, { actorId: "actor", userId: "actor", sessionId: "session", authMethod: "session", scopes: [...MCP_AUTHORING_DEFAULT_SCOPES] });
  const client = new Client({ name: "test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(8);
    expect(tools.find(t => t.name === "transfer.plan")!.annotations?.readOnlyHint).toBe(true);
    const response = await client.callTool({ name: "transfer.execute", arguments: { planToken: "opaque", idempotencyKey: "same-request" } });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response.content)).toContain("TRANSFER_SCOPE_REQUIRED");
    expect((await client.listResources()).resources.some(resource => resource.uri === "zyx://authoring/transfer/v1")).toBe(true);
    await expect(client.readResource({ uri: "zyx://authoring/transfer/v1" })).rejects.toThrow();
  } finally { await client.close(); await server.close(); }
});

test("authorized MCP clients can read the current transfer procedure without moving artifact bytes", async () => {
  const { registerTransferTools } = await import("@/lib/authoring/transfer/mcp");
  const server = new McpServer({ name: "transfer-guide", version: "1" });
  registerTransferTools(server, { actorId: "actor", userId: "actor", sessionId: "session", authMethod: "session", scopes: ["authoring:transfer:read"] });
  const client = new Client({ name: "test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const guide = await client.readResource({ uri: "zyx://authoring/transfer/v1" });
    expect(guide.contents[0].mimeType).toBe("application/json");
    const text = guide.contents[0].text;
    expect(typeof text).toBe("string");
    const value = JSON.parse(text as string);
    expect(value).toMatchObject({ protocol: "authoring-transfer.v1", mode: "draft_only" });
    expect(value.steps.join(" ")).toContain("idempotencyKey");
    expect(value.recovery.ASSET_BINDING_UNSUPPORTED).toContain("Stop");
  } finally { await client.close(); await server.close(); }
});

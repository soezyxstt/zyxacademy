import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair } from "jose";
import { sha256 } from "@/lib/authoring/transfer/contracts";

const folder = mkdtempSync(join(tmpdir(), "zyx-transfer-http-"));
const children: ReturnType<typeof Bun.spawn>[] = [];
let source = "", target = "";
let root: { id: string; checksum: string };
type JsonResult = { status: number; body: Record<string, any> };
async function post(origin: string, path: string, data: object): Promise<JsonResult> {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  return { status: response.status, body: await response.json() as JsonResult["body"] };
}
async function identity(id: string) {
  const signing = await generateKeyPair("EdDSA", { extractable: true }), encryption = await generateKeyPair("ECDH-ES", { crv: "P-256", extractable: true });
  return { id, origin: `https://${id}.fixture`, keyId: "fixture-key", signingKey: await exportJWK(signing.privateKey), encryptionKey: await exportJWK(encryption.privateKey) };
}
function peer(value: Awaited<ReturnType<typeof identity>>) {
  const { d: _s, ...signingKey } = value.signingKey, { d: _e, ...encryptionKey } = value.encryptionKey;
  return { ...value, signingKey, encryptionKey, allowSource: true, allowDestination: true,
    databaseFingerprint: sha256(`file:${join(folder, `${value.id}.db`)}`), storageFingerprint: sha256(`https://storage.fixture/${value.id}`) };
}
async function start(id: string, local: Awaited<ReturnType<typeof identity>>, remote: ReturnType<typeof peer>, sourceUrl?: string) {
  const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: `file:${join(folder, `${id}.db`)}`, TURSO_DATABASE_URL: "", TURSO_CONNECTION_URL: "", TURSO_AUTH_TOKEN: "",
    R2_ENDPOINT: "https://storage.fixture", R2_BUCKET: id, R2_ACCESS_KEY_ID: "fixture", R2_SECRET_ACCESS_KEY: "fixture", SKIP_ENV_VALIDATION: "1" };
  const migration = Bun.spawn([process.execPath, "db/migrate.ts"], { env, stdout: "pipe", stderr: "pipe" });
  const migrationStatus = await migration.exited;
  if (migrationStatus) throw new Error(`Fixture migration ${migrationStatus}: ${await new Response(migration.stderr).text()}`);
  const readyFile = join(folder, `${id}-ready.json`), configFile = join(folder, `${id}-config.json`);
  await Bun.write(configFile, JSON.stringify({ identity: local, peers: [remote], readyFile, sourceUrl, seed: id === "source" }));
  const child = Bun.spawn([process.execPath, "tests/fixtures/transfer-peer-server.ts"], { env: { ...env, TRANSFER_TEST_CONFIG: configFile }, stdout: "pipe", stderr: "pipe" });
  children.push(child);
  for (let n = 0; n < 300; n++) {
    if (existsSync(readyFile)) return JSON.parse(readFileSync(readyFile, "utf8")) as { port: number; root: typeof root };
    if (child.exitCode !== null) throw new Error(`Fixture peer exited: ${await new Response(child.stderr).text()}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Fixture startup timed out");
}
beforeAll(async () => {
  const a = await identity("source"), b = await identity("target");
  const first = await start("source", a, peer(b)); source = `http://127.0.0.1:${first.port}`; root = first.root;
  const second = await start("target", b, peer(a), source); target = `http://127.0.0.1:${second.port}`;
}, 120000);
afterAll(() => { for (const child of children) child.kill(); });

let grant: Record<string, any>, plan: Record<string, any>, transferId: string;
test("actual HTTP peers plan and copy dependency closure into an intake, without publishing Ideas", async () => {
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  expect(issued.status).toBe(200); grant = issued.body;
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: grant.sourceGrant });
  expect(preview.status).toBe(200); plan = preview.body; expect(plan.compatible).toBe(true); expect(plan.artifacts).toHaveLength(2);
  const accepted = await post(target, "/execute", { planToken: plan.planToken, idempotencyKey: "http-transfer-one" });
  expect(accepted.status).toBe(200); transferId = accepted.body.transferId; expect(accepted.body.state).toBe("queued");
  await post(target, "/fault", { fault: "checkpoint-write" });
  const interrupted = await post(target, "/process", { transferId });
  expect(interrupted.body.state).toBe("blocked");
  expect((await post(target, "/counts", {})).body.imports).toBe(0);
  expect(interrupted.body.items.every((i: { targetImportId: string | null }) => !i.targetImportId)).toBe(true);
  await post(target, "/fault", { fault: "clear-checkpoint" });
  await post(target, "/resume", { transferId });
  const processed = await post(target, "/process", { transferId });
  expect(processed.body).toMatchObject({ state: "waiting_prerequisites", reasonCode: "DEPENDENCY_NOT_PUBLISHED", transportComplete: true, draftMaterialized: false });
  expect(processed.body.items.filter((i: { state: string }) => i.state === "materialized")).toHaveLength(1);
}, 30000);
test("retry returns the same transfer and duplicate workers do not replace content", async () => {
  const retried = await post(target, "/execute", { planToken: plan.planToken, idempotencyKey: "http-transfer-one" });
  expect(retried.body.transferId).toBe(transferId);
  const duplicate = await post(target, "/process", { transferId }); expect(duplicate.body.state).toBe("waiting_prerequisites");
  const wrong = await post(target, "/execute", { planToken: plan.planToken + "tamper", idempotencyKey: "http-transfer-one" });
  expect(wrong.status).toBe(409); expect(wrong.body.error).toBe("TRANSFER_IDEMPOTENCY_CONFLICT");
});
test("resume after canonical prerequisite publication materializes Product draft and yields receipt", async () => {
  expect((await post(target, "/publish-prerequisites", {})).status).toBe(200);
  expect((await post(target, "/resume", { transferId })).body.state).toBe("queued");
  const completed = await post(target, "/process", { transferId });
  expect(completed.body).toMatchObject({ state: "completed", draftMaterialized: true, transportComplete: true });
  expect(completed.body.receipt.items).toHaveLength(2);
  expect(completed.body.items.every((i: { targetImportId: string }) => Boolean(i.targetImportId))).toBe(true);
  expect(completed.body.items.every((i: { owned: boolean }) => i.owned)).toBe(true);
}, 30000);
test("new grant uses exact existing content and rejects destination conflict before execute", async () => {
  const next = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: next.body.sourceGrant });
  expect(preview.body.artifacts.every((a: { action: string }) => a.action === "reuse")).toBe(true);
  await post(target, "/conflict", {});
  const stale = await post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "stale-plan" });
  expect(stale.status).toBe(409); expect(stale.body.error).toBe("PLAN_STALE");
});
test("revocation prevents further peer reads", async () => {
  expect((await post(source, "/revoke", { grantId: grant.grantId })).status).toBe(200);
  const attempted = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: grant.sourceGrant });
  expect(attempted.status).toBe(403); expect(attempted.body.error).toBe("GRANT_REVOKED");
});
test("transient peer failure checkpoints, then resumes without losing copied content", async () => {
  await post(target, "/restore-conflict", {});
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant });
  const accepted = await post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "transient-copy" });
  const id = accepted.body.transferId;
  await post(target, "/fault", { fault: "unavailable-once" });
  const paused = await post(target, "/process", { transferId: id });
  expect(paused.body).toMatchObject({ state: "retry_wait", reasonCode: "PEER_TEMPORARILY_UNAVAILABLE" });
  expect((await post(target, "/process", { transferId: id })).body.state).toBe("retry_wait");
  await post(target, "/resume", { transferId: id });
  expect((await post(target, "/process", { transferId: id })).body.state).toBe("completed");
}, 30000);
test("corrupt bytes block before materialization, and cancellation is durable", async () => {
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant });
  const accepted = await post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "integrity-copy" });
  const id = accepted.body.transferId;
  await post(target, "/fault", { fault: "corrupt-once" });
  expect((await post(target, "/process", { transferId: id })).body).toMatchObject({ state: "blocked", reasonCode: "CHECKSUM_MISMATCH" });
  expect((await post(target, "/cancel", { transferId: id })).body.state).toBe("cancelled");
  expect((await post(target, "/process", { transferId: id })).body.state).toBe("cancelled");
});
test("two concurrent execute requests use one durable transfer", async () => {
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant });
  const results = await Promise.all([1, 2].map(() => post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "concurrent-copy" })));
  expect(results.map(r => r.status)).toEqual([200, 200]);
  expect(results[0].body.transferId).toBe(results[1].body.transferId);
  await post(target, "/cancel", { transferId: results[0].body.transferId });
});
test("reverse transfer uses the same protocol and reuses matching source content", async () => {
  await post(source, "/peer-url", { url: target });
  const completed = await post(target, "/status", { transferId });
  const localRoot = completed.body.items.find((i: { artifactId: string }) => i.artifactId === root.id).targetImportId;
  const issued = await post(target, "/grant", { targetPeerId: "source", selector: { kind: "product", importId: localRoot, expectedChecksum: root.checksum } });
  expect(issued.status).toBe(200);
  const preview = await post(source, "/plan", { sourcePeerId: "target", sourceGrant: issued.body.sourceGrant });
  expect(preview.status).toBe(200);
  expect(preview.body.artifacts.every((a: { action: string }) => a.action === "reuse")).toBe(true);
  const accepted = await post(source, "/execute", { planToken: preview.body.planToken, idempotencyKey: "reverse-copy" });
  const done = await post(source, "/process", { transferId: accepted.body.transferId });
  expect(done.body.state).toBe("completed");
  expect(done.body.items.every((i: { owned: boolean }) => !i.owned)).toBe(true);
}, 30000);
test("source mutation before artifact pin blocks instead of copying the latest revision", async () => {
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant });
  const accepted = await post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "source-changed" });
  await post(source, "/conflict", {});
  const processed = await post(target, "/process", { transferId: accepted.body.transferId });
  expect(processed.body).toMatchObject({ state: "blocked", reasonCode: "SOURCE_REVISION_CHANGED", draftMaterialized: false });
  await post(source, "/restore-conflict", {});
});
test("expired delegation requires a fresh source grant for the identical closure before resume", async () => {
  const input = { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } };
  const issued = await post(source, "/grant", input);
  const preview = await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant });
  const accepted = await post(target, "/execute", { planToken: preview.body.planToken, idempotencyKey: "renew-delegation" });
  const id = accepted.body.transferId;
  await post(target, "/expire-one", { transferId: id });
  expect((await post(target, "/resume", { transferId: id })).body.error).toBe("GRANT_EXPIRED");
  const renewed = await post(source, "/grant", input);
  expect((await post(target, "/resume", { transferId: id, sourceGrant: renewed.body.sourceGrant })).body.state).toBe("queued");
  expect((await post(target, "/process", { transferId: id })).body.state).toBe("completed");
});
test("source logout stops grant use and destination logout stops status access", async () => {
  const issued = await post(source, "/grant", { targetPeerId: "target", selector: { kind: "product", importId: root.id, expectedChecksum: root.checksum } });
  await post(source, "/session", { active: false });
  expect((await post(target, "/plan", { sourcePeerId: "source", sourceGrant: issued.body.sourceGrant })).body.error).toBe("GRANT_REVOKED");
  await post(source, "/session", { active: true });
  await post(target, "/session", { active: false });
  expect((await post(target, "/status", { transferId })).body.error).toBe("GRANT_REVOKED");
  await post(target, "/session", { active: true });
});
test("expired transfer cleanup prunes metadata and private snapshots while preserving normal imports", async () => {
  for (const origin of [source, target]) {
    await post(origin, "/expire-ledger", {});
    const cleaned = await post(origin, "/cleanup", {});
    expect(cleaned.status).toBe(200);
    expect(cleaned.body.transferObjects).toBe(0);
    expect(cleaned.body.bundleObjects).toBe(2);
    expect(cleaned.body.imports).toBe(2);
    expect(cleaned.body.prunedTransfers).toBeGreaterThan(0);
    expect(cleaned.body.prunedGrants).toBeGreaterThan(0);
    const repeated = await post(origin, "/cleanup", {});
    expect(repeated.body).toMatchObject({ grants: 0, transfers: 0, prunedTransfers: 0, prunedGrants: 0, bundleObjects: 2 });
  }
  expect((await post(target, "/status", { transferId })).body.error).toBe("TRANSFER_NOT_FOUND");
});

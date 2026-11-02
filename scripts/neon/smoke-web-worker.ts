import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import * as schema from "../../db/schema";
import { daysFrom } from "../../lib/date-utils";
import { storage } from "../../lib/storage";
import { joinKey, buildSourceReadJobKey, buildSourceFileMetadataKey, buildPdfPageCacheKey } from "../../lib/storage/keys";
import { issueMcpConnectionToken, issueMcpSourceFileKey } from "../../lib/authoring/mcp-workflows";
import { PDF_PAGE_RENDERER_VERSION } from "../../lib/compute/pdf-page-cache";
import { requestPdfPagesFromCompute } from "../../lib/compute-client/pdf";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL ?? "", process.env.NEON_EXPECTED_HOST ?? "", process.env.NEON_EXPECTED_DATABASE ?? "");
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
assert.equal(process.env.INNGEST_ENV, "neon-migration");
assert.equal(process.env.COMPUTE_SERVICE_URL, "https://zyx-background-neon-migration.soezyxst.deno.net");
const share = new URL(process.env.NEON_HTTP_SHARE_URL!);
assert.equal(share.origin, "https://zyx-neon-migration.vercel.app");
const id = `neon-worker-${randomUUID()}`, canonicalId = `${id}-canonical`;
const key = joinKey("courses", id, "materials", "integration.pdf");
const message = `Neon worker integration ${id}`;
const stream = `BT /F1 12 Tf 72 720 Td (${message}) Tj ET`;
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const bytes = Buffer.from(pdf), checksum = createHash("sha256").update(bytes).digest("hex"), updatedAt = new Date();
const ownedKeys = new Set([key]);
let jobId: string | undefined, terminal = false;
const client = new Client({ name: "neon-migration-verification", version: "1.0.0" });
try {
  await db.transaction(async tx => {
    await tx.insert(schema.user).values({ id, name: "Worker integration fixture", email: `${id}@example.invalid`, role: "admin" });
    await tx.insert(schema.pengguna).values({ id, status: "active" });
    await tx.insert(schema.session).values({ id, token: randomUUID(), userId: id, expiresAt: daysFrom(1) });
    await tx.insert(schema.courses).values({ id, title: "Worker integration fixture", category: "Test" });
    await tx.insert(schema.mataKuliah).values({ id: canonicalId, code: id, title: "Worker integration fixture", legacyCourseId: id });
    await tx.insert(schema.courseMaterials).values({ id, courseId: id, title: "Worker integration fixture", type: "materi", fileUrl: key, checksum, chapterIds: [], updatedAt });
  });
  await storage.upload(bytes, "integration.pdf", "application/pdf", { key });
  const cookies = new Map<string, string>();
  let bootstrapUrl = new URL("/api/auth/get-session", share.origin);
  bootstrapUrl.search = share.search;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(bootstrapUrl, { redirect: "manual", headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } });
    for (const header of response.headers.getSetCookie()) { const value = header.split(";", 1)[0], position = value.indexOf("="); cookies.set(value.slice(0, position), value.slice(position + 1)); }
    if (response.status >= 300 && response.status < 400) { bootstrapUrl = new URL(response.headers.get("location")!, bootstrapUrl); assert.equal(bootstrapUrl.origin, share.origin); continue; }
    assert.equal(response.status, 200, "Vercel protection bootstrap failed"); break;
  }
  const token = issueMcpConnectionToken({ userId: id, sessionId: id, clientId: id, resource: `${share.origin}/api/mcp/authoring`, scopes: ["authoring:read", "authoring:stage"] });
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp/authoring", share.origin), { requestInit: { headers: { authorization: `Bearer ${token}`, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } } });
  await client.connect(transport);
  const fileKey = issueMcpSourceFileKey({ materialId: id, storageKey: key, courseId: canonicalId, legacyCourseId: id, updatedAtMs: updatedAt.getTime(), checksum });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const payload = result.structuredContent as any;
    assert.ok(!result.isError, `Hosted MCP tool failed: ${payload?.error ?? "unknown"}`);
    return payload;
  };
  let result = await call("source.read_file", { fileKey, mode: "pages", pages: [1], representation: "text" });
  jobId = result.jobId;
  assert.ok(jobId, "Hosted tool must enqueue a source-read job");
  ownedKeys.add(buildSourceReadJobKey(jobId)); ownedKeys.add(buildSourceReadJobKey(jobId, 1));
  const fingerprint = createHash("sha256").update(JSON.stringify([key, updatedAt.getTime(), checksum])).digest("hex");
  ownedKeys.add(buildSourceFileMetadataKey(fingerprint));
  ownedKeys.add(`${buildPdfPageCacheKey({ checksum, pageNumber: 1, rendererVersion: `${PDF_PAGE_RENDERER_VERSION}-text`, width: 1 })}.json`);
  writeFileSync("artifacts/neon-migration/web-worker-pending.json", JSON.stringify({ id, key, checksum, jobId, ownedKeys: [...ownedKeys] }));
  for (let attempt = 0; attempt < 40 && result.status !== "failed" && !result.pages?.[0]?.text; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    result = await call("source.get_read_job", { fileKey, jobId });
  }
  terminal = result.status === "failed" || Boolean(result.pages?.[0]?.text);
  assert.notEqual(result.status, "failed", `Source-read job failed: ${JSON.stringify(result.pages)}`);
  assert.ok(result.pages?.[0]?.text?.includes(message), "Hosted worker must return the synthetic PDF text");
  assert.equal(result.checksum, checksum);
  const rpc = await requestPdfPagesFromCompute({ storageKey: key, pages: [1], representation: "text" });
  assert.ok(rpc.pages[0].text.includes(message));
  const denied = await fetch(`${process.env.COMPUTE_SERVICE_URL}/internal/pdf/pages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storageKey: key, pages: [1], representation: "text" }) });
  assert.equal(denied.status, 401);
  const evidence = { status: "passed", deployment: share.origin, worker: process.env.COMPUTE_SERVICE_URL, jobId, checksum, hostedEventDelivery: true, workerS3ReadWrite: true, pdfTextExtraction: true, authenticatedRpc: true, unauthenticatedRpcDenied: true };
  writeFileSync("artifacts/neon-migration/web-worker-integration.json", JSON.stringify(evidence));
  console.log(JSON.stringify(evidence));
} finally {
  await client.close().catch(() => {});
  if (!jobId || terminal) {
    for (const owned of ownedKeys) await storage.delete(owned);
    await db.transaction(async tx => {
      await tx.delete(schema.courseMaterials).where(eq(schema.courseMaterials.id, id));
      await tx.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, canonicalId));
      await tx.delete(schema.courses).where(eq(schema.courses.id, id));
      await tx.delete(schema.session).where(eq(schema.session.id, id));
      await tx.delete(schema.pengguna).where(eq(schema.pengguna.id, id));
      await tx.delete(schema.user).where(eq(schema.user.id, id));
    });
    console.log(JSON.stringify({ fixtureCleanup: "passed" }));
  }
  await db.$client.end();
}

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sourcePdf, sourceJpeg2000Pdf } from "../../tests/helpers/source-pdf";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

const target = workerTarget(process.argv[2]);
const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
assertWorkerEnvironment(target, config);
assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
Object.assign(process.env, config);
const [{ storage }, { joinKey, buildSourceReadJobKey }] = await Promise.all([import("../../lib/storage"), import("../../lib/storage/keys")]);
const checks: Array<{ name: string; status: "PASS"; durationMs: number }> = [];
const objects: string[] = [];
const pendingSources = new Set<string>();
async function check(name: string, run: () => Promise<void>) {
  const started = performance.now();
  await run();
  checks.push({ name, status: "PASS", durationMs: Math.round(performance.now() - started) });
  console.log(JSON.stringify(checks.at(-1)));
}
async function rpc(key: string, representation: "text" | "image" | "both", imageWidth = 640, pages = [1]) {
  for (let attempt = 0; attempt < 6; attempt++) {
  const response = await fetch(`${config.INNGEST_SERVE_ORIGIN}/internal/pdf/pages`, { method: "POST", headers: { Authorization: `Bearer ${config.COMPUTE_SERVICE_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storageKey: key, pages, representation, imageWidth }), signal: AbortSignal.timeout(180_000) });
  if (response.status === 429) {
    const seconds = Math.min(60, Math.max(1, Number(response.headers.get("Retry-After")) || 30));
    console.log(JSON.stringify({ event: "browser.rate_limit", retryInSeconds: seconds }));
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    continue;
  }
  const result = await response.json();
  if (!response.ok && !(response.status === 400 && result.error === "PAGE_OUT_OF_BOUNDS")) throw new Error(`PDF_RPC_FAILED:${response.status}`);
  return result;
  }
  throw new Error("PDF_RPC_RATE_LIMIT_RETRIES_EXHAUSTED");
}
try {
  await check("health and all function registration", async () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const response = await fetch(`${config.INNGEST_SERVE_ORIGIN}/health?probe=${crypto.randomUUID()}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.functions, 22);
      if (health.version === config.ZYX_COMPUTE_REVISION) return;
      if (attempt === 14) assert.equal(health.version, config.ZYX_COMPUTE_REVISION);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });
  await check("internal and Inngest authentication", async () => {
    for (const path of ["/internal/pdf/pages", "/internal/authoring/source-pack/resolve", "/api/inngest"]) {
      const response = await fetch(`${config.INNGEST_SERVE_ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 401, path);
    }
  });
  const key = joinKey("overhaul", "neon-worker-smoke", `${crypto.randomUUID()}.pdf`);
  objects.push(key);
  await storage.upload(sourcePdf(595.28, 841.89), "synthetic.pdf", "application/pdf", { key });
  if (!process.argv.includes("--preflight")) await check("durable Inngest PDF page job on Neon", async () => {
    const { inngest } = await import("../../jobs/client");
    const jobId = createHash("sha256").update(crypto.randomUUID()).digest("hex");
    const stateKey = buildSourceReadJobKey(jobId, 1);
    pendingSources.add(key);
    const sent = await inngest.send({ id: jobId, name: "source.pdf.page.requested", data: {
      jobId, requestId: crypto.randomUUID(), storageKey: key, materialId: jobId, courseId: "neon-worker-smoke",
      checksum: null, pages: [1], pageNumber: 1, representation: "text", imageWidth: 640,
    } });
    assert.equal(sent.ids.length, 1);
    await writeFile(`${target.output}/inngest-pending.json`, JSON.stringify({ eventId: sent.ids[0], jobId, sourceKey: key, stateKey }));
    let terminal = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await fetch(`https://api.inngest.com/v2/events/${encodeURIComponent(sent.ids[0])}/runs?include=output`, {
        headers: { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV }, signal: AbortSignal.timeout(20_000),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      const run = result.data?.find((item: { function?: { id: string } }) => item.function?.id === "source-read-page");
      if (run && ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status.toUpperCase())) {
        terminal = true;
        pendingSources.delete(key);
        objects.push(stateKey);
        await writeFile(`${target.output}/inngest-smoke.json`, JSON.stringify({ eventId: sent.ids[0], runId: run.id, status: run.status }));
        assert.equal(run.status.toUpperCase(), "COMPLETED");
        const state = JSON.parse(Buffer.from(await storage.download!(stateKey)).toString("utf8"));
        assert.equal(state.status, "complete");
        assert.match(state.page.text, /Hello PDF/);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!terminal) {
      throw new Error(`INNGEST_SMOKE_PENDING:${sent.ids[0]}`);
    }
  });
  await check("Cloudflare PDF text extraction", async () => {
    const result = await rpc(key, "text"); assert.equal(result.totalPages, 1); assert.match(result.pages[0].text, /Hello PDF/);
  });
  await check("Cloudflare PDF page rasterization", async () => {
    const result = await rpc(key, "image"); const png = Buffer.from(result.pages[0].imageBase64, "base64");
    assert.equal(png.readUInt32BE(0), 0x89504e47); assert.equal(png.readUInt32BE(16), 640); assert.equal(result.pages[0].width, 640);
  });
  await check("out-of-range PDF page remains a client error", async () => {
    assert.equal((await rpc(key, "text", 640, [2])).error, "PAGE_OUT_OF_BOUNDS");
  });
  await check("JPEG2000 image survives Cloudflare rasterization", async () => {
    const imageKey = joinKey("overhaul", "neon-worker-smoke", `${crypto.randomUUID()}.pdf`);
    objects.push(imageKey);
    await storage.upload(sourceJpeg2000Pdf(), "jpeg2000.pdf", "application/pdf", { key: imageKey });
    const result = await rpc(imageKey, "image");
    const image = await loadImage(Buffer.from(result.pages[0].imageBase64, "base64"));
    const context = createCanvas(1, 1).getContext("2d");
    context.drawImage(image, Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1, 0, 0, 1, 1);
    assert.deepEqual([...context.getImageData(0, 0, 1, 1).data], [255, 0, 0, 255]);
  });
  await check("Cloudflare PDF combined read and persistent cache", async () => {
    const first = await rpc(key, "both", 1280), cached = await rpc(key, "both", 1280);
    assert.equal(first.checksum, cached.checksum); assert.equal(first.pages[0].imageBase64, cached.pages[0].imageBase64); assert.match(first.pages[0].text, /Hello PDF/);
  });
  let rendered: Uint8Array;
  await check("existing Cloudflare HTML to PDF renderer", async () => {
    const response = await fetch(`${config.DIKTAT_RENDERER_URL}/render`, { method: "POST", headers: { Authorization: `Bearer ${config.DIKTAT_RENDERER_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<!doctype html><html><body><h1>Neon worker PDF smoke</h1><p>Synthetic fixture.</p></body></html>", printProfile: "legacy-a4" }), signal: AbortSignal.timeout(60_000) });
    assert.equal(response.status, 200); rendered = new Uint8Array(await response.arrayBuffer()); assert.equal(Buffer.from(rendered.subarray(0, 5)).toString(), "%PDF-");
  });
  await check("read back generated PDF through Neon", async () => {
    const renderedKey = joinKey("overhaul", "neon-worker-smoke", `${crypto.randomUUID()}.pdf`); objects.push(renderedKey);
    await storage.upload(rendered!, "rendered.pdf", "application/pdf", { key: renderedKey });
    const result = await rpc(renderedKey, "text"); assert.match(result.pages[0].text, /Neon worker PDF smoke/);
  });
  await writeFile(`${target.output}/http-smoke.json`, JSON.stringify({ status: "PASS", checks }, null, 2));
} catch (error) {
  await writeFile(`${target.output}/http-smoke.json`, JSON.stringify({ status: "FAIL", checks, error: error instanceof Error ? error.message : "unknown" }, null, 2));
  throw error;
} finally {
  for (const key of objects) if (!pendingSources.has(key)) await storage.delete(key);
}

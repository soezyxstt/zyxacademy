import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { closeProductV4BrowserRunner, executeBrowserProductV4Check, validateVerificationBaseUrl } from "../../lib/compute/product-v4-browser-runner";
import type { ProductV4VerificationPlan, ProductV4VerificationRequirement } from "../../lib/bundle/product-v4-verification";
import type { ProductEntity } from "../../lib/bundle/product-validator";

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const baseUrl = validateVerificationBaseUrl(value("--base-url", "http://127.0.0.1:3100"));
const port = z.coerce.number().int().min(1024).max(65535).parse(value("--port", "3101"));
const secret = process.env.AUTHORING_VERIFICATION_RENDERER_SECRET;
if (!secret || secret.length < 16) throw new Error("AUTHORING_VERIFICATION_RENDERER_SECRET_REQUIRED");
let active = false;
const wireSchema = z.object({
  plan: z.custom<ProductV4VerificationPlan>((value) => Boolean(value && typeof value === "object")),
  bundle: z.object({ manifest: z.unknown(), products: z.array(z.custom<ProductEntity>()).max(500), dependencies: z.array(z.unknown()).max(5000) }),
  requirement: z.custom<ProductV4VerificationRequirement>((value) => Boolean(value && typeof value === "object")),
  staticFigureAssets: z.record(z.string(), z.object({ base64: z.string().max(30_000_000), mimeType: z.enum(["image/png", "image/jpeg"]), sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/), attribution: z.string().max(2000).optional() }).strict()).optional(),
}).strict();

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  const authorized = Buffer.from(request.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (authorized.length !== expected.length || !timingSafeEqual(authorized, expected)) { response.writeHead(401).end('{"error":"Unauthorized"}'); return; }
  if (request.method !== "POST" || request.url !== "/verify") { response.writeHead(404).end('{"error":"Not found"}'); return; }
  if (active) { response.writeHead(429).end('{"error":"Verification runner busy"}'); return; }
  active = true;
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 40 * 1024 * 1024) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    const body = wireSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const staticFigureAssets = Object.fromEntries(Object.entries(body.staticFigureAssets ?? {}).map(([id, asset]) => [id, { bytes: Buffer.from(asset.base64, "base64"), mimeType: asset.mimeType, sourceChecksum: asset.sourceChecksum, attribution: asset.attribution }]));
    const result = await executeBrowserProductV4Check({ ...body, baseUrl, staticFigureAssets });
    response.end(JSON.stringify({ ...result, artifacts: result.artifacts.map(({ bytes, ...artifact }) => ({ ...artifact, base64: Buffer.from(bytes).toString("base64") })) }));
  } catch {
    response.writeHead(400).end('{"error":"Verification request invalid or execution unavailable"}');
  } finally { active = false; }
});
server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.listen(port, "127.0.0.1");
const close = () => server.close(() => { void closeProductV4BrowserRunner().finally(() => process.exit(0)); });
process.on("SIGTERM", close);
process.on("SIGINT", close);

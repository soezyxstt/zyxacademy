import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertProductV4LocalTarget } from "../../lib/compute/product-v4-local-operator";
import { assertProductV4LocalSource, loadProductV4LocalSettings } from "./verify-product-v4-local";

const root = "artifacts/legacy-local-evidence";
type LocalInput = { privateFile: string; sourceRevision: string; importId: string; runId: string; expectedChecksum: string; actorId: string; diktatId?: string; articleId?: string };

export function validateProductLegacyLocalInput(value: unknown): LocalInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PRODUCT_LEGACY_LOCAL_EXACT_INPUT_REQUIRED");
  const input = value as Record<string, unknown>;
  const invalidId = (value: unknown) => value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 256 || value.includes("\0"));
  if (Object.keys(input).some(key => !["privateFile", "sourceRevision", "importId", "runId", "expectedChecksum", "actorId", "diktatId", "articleId"].includes(key)) || typeof input.privateFile !== "string" || !path.isAbsolute(input.privateFile) || input.privateFile.includes("\0") || typeof input.sourceRevision !== "string" || !/^[a-f0-9]{40}$/.test(input.sourceRevision) || typeof input.importId !== "string" || !/^impor-product-[a-f0-9]{32}$/.test(input.importId) || typeof input.runId !== "string" || !/^mcp-run-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.runId) || typeof input.expectedChecksum !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedChecksum) || typeof input.actorId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(input.actorId) || invalidId(input.diktatId) || invalidId(input.articleId) || (input.diktatId !== undefined && input.articleId !== undefined)) throw new Error("PRODUCT_LEGACY_LOCAL_EXACT_INPUT_REQUIRED");
  return input as LocalInput;
}

async function readJson(file: string, limit: number) {
  try {
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > limit) throw new Error();
    return JSON.parse(await readFile(file, "utf8"));
  } catch { throw new Error("PRODUCT_LEGACY_LOCAL_INPUT_FILE_INVALID"); }
}

export function productLegacyLocalFailure(error: unknown) {
  const allowed = /^(?:PRODUCT_LEGACY_LOCAL_|PRODUCT_DIKTAT_|PRODUCT_V4_LOCAL_|PRODUCT_V4_BROWSER_)[A-Z0-9_]+$/;
  const code = error instanceof Error && allowed.test(error.message) ? error.message : "PRODUCT_LEGACY_LOCAL_EXECUTION_FAILED";
  const recovery: Record<string, string> = {
    PRODUCT_DIKTAT_RENDER_FORBIDDEN: "Use the explicitly authorized active admin identity.",
    PRODUCT_DIKTAT_EXACT_DRAFT_REQUIRED: "Refresh the checksum and original staging run; do not substitute a later run.",
    PRODUCT_DIKTAT_SNAPSHOT_CONFLICT: "The draft or attempt changed. Refresh its context and make a new exact-revision decision.",
    PRODUCT_DIKTAT_LEGACY_LEARNING_ONLY_REQUIRED: "Use an exact V2 or V3 learning-only draft containing an Article. Assessment and later profiles are excluded.",
    PRODUCT_DIKTAT_EXACT_PRODUCT_REQUIRED: "Provide exactly one diktatId or unlinked articleId when the draft has multiple export targets.",
    PRODUCT_DIKTAT_SOURCE_MISSING: "Select an existing Diktat or an Article without a linked Diktat from the current draft.",
    PRODUCT_DIKTAT_LOCAL_RENDERER_REQUIRED: "Use the private local operator with storage readback for an Article-only export.",
    PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED: "Use a current V2 or V3 product draft. V4 requires its trusted verifier.",
    PRODUCT_LEGACY_LOCAL_NOT_READY: "Inspect the failure and local artifacts, correct the content or environment, and retry.",
    PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH: "Inspect the current draft and evidence, then retry the exact revision after storage is healthy.",
    PRODUCT_LEGACY_LOCAL_CHROMIUM_PIN_MISMATCH: "Install the exact pinned Playwright Chromium reported by --capabilities.",
    PRODUCT_V4_LOCAL_SOURCE_REQUIRED: "Use the clean checkout of the deployed revision from the authorized deployment record.",
    PRODUCT_LEGACY_LOCAL_PRIVATE_FILE_REQUIRED: "Use an absolute settings path outside the checkout or ignored by Git.",
  };
  return { status: "error", code, recovery: recovery[code] ?? "Check the documented local prerequisites and exact target, then retry without exposing credentials." };
}

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function assertProductLegacyReadback(input: {
  importId: string; runId: string; checksum: string; printProfile: string;
  result: { productId: string; stagingAuditId?: string; storageKey?: string; pageCount?: number; articleVersion?: number; articleHash?: string; diktatHash?: string };
  row?: { status: string; checksum: string; version: number };
  staging?: { id: string; correlationId: string | null; afterSnapshot: Record<string, unknown> | null };
  evidence?: { imporBundleId: string; productId: string; articleVersion: number; articleHash: string; diktatHash: string; status: string; storageKey: string | null; pageCount: number | null; failureCode: string | null; printProfile: string };
}) {
  const { row, staging, evidence, result } = input;
  if (!row || row.status !== "draft" || row.checksum !== input.checksum || ![2, 3].includes(row.version) || !staging || !result.stagingAuditId || staging.id !== result.stagingAuditId || staging.correlationId !== input.runId || staging.afterSnapshot?.checksum !== input.checksum || !evidence || evidence.imporBundleId !== input.importId || evidence.productId !== result.productId || evidence.articleVersion !== result.articleVersion || evidence.articleHash !== result.articleHash || evidence.diktatHash !== result.diktatHash || evidence.status !== "ready" || evidence.storageKey !== result.storageKey || evidence.pageCount !== result.pageCount || evidence.failureCode || evidence.printProfile !== input.printProfile) throw new Error("PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH");
}

export async function runProductLegacyLocal() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--capabilities") {
    if (process.env.ZYX_COMPUTE_RUNTIME || process.env.ZYX_COMPUTE_BUILD_RUNTIME || process.env.NEXT_PUBLIC_V4_WEB_RUNTIME) throw new Error("PRODUCT_V4_LOCAL_CONTEXT_REQUIRED");
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
    try {
      const [runtime, config] = await Promise.all([import("../../lib/compute/product-v4-runtime-binding"), import("../../lib/compute/product-v4-browser-config")]);
      const chromium = runtime.expectedChromiumRuntime();
      const identity = config.verificationBrowserIdentity({ NODE_ENV: "production", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "local_playwright" } as NodeJS.ProcessEnv);
      console.log(JSON.stringify({ schema: "zyx-product-legacy-local-capabilities.v1", command: "node scripts/authoring/run-product-legacy-local.mjs --input <absolute-input-json-path>", inputSchema: "zyx-product-legacy-local-input.v1", requiredFields: ["privateFile", "sourceRevision", "importId", "runId", "expectedChecksum", "actorId"], optionalFields: ["diktatId", "articleId"], targetSelection: "One linked Diktat or unlinked Article per export. Omit both IDs only for a single eligible target; IDs are mutually exclusive.", resultSchema: "zyx-product-legacy-local-result.v1", target: "verified-production-only", deployedRevisionCheck: "operator-prerequisite from authorized deployment record", versions: [2, 3], browser: { ...chromium, provider: identity.browserProvider, configuredVersion: identity.browserVersion, pinsMatch: identity.browserVersion === chromium.browserVersion }, concurrency: 1, timeoutSeconds: 180, printProfile: "a4-self-study-readable-v3", pageRange: [1, 4] }));
    } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
    return;
  }
  if (args.length !== 2 || args[0] !== "--input" || !path.isAbsolute(args[1])) throw new Error("PRODUCT_LEGACY_LOCAL_EXACT_INPUT_REQUIRED");
  const input = validateProductLegacyLocalInput(await readJson(args[1], 16 * 1024));
  const git = (...gitArgs: string[]) => execFileSync("git", ["-c", "core.fsmonitor=false", ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  // The operator must verify this SHA against the authorized deployment record.
  const assertSource = () => assertProductV4LocalSource(input.sourceRevision, { head: git("rev-parse", "HEAD"), status: git("status", "--porcelain", "--untracked-files=normal"), origin: git("remote", "get-url", "origin") });
  assertSource();
  const checkout = await realpath(git("rev-parse", "--show-toplevel"));
  const privateFile = await realpath(input.privateFile).catch(() => { throw new Error("PRODUCT_LEGACY_LOCAL_INPUT_FILE_INVALID"); });
  const relative = path.relative(checkout, privateFile);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    try { git("check-ignore", "--quiet", "--", relative); } catch { throw new Error("PRODUCT_LEGACY_LOCAL_PRIVATE_FILE_REQUIRED"); }
  }
  Object.assign(process.env, loadProductV4LocalSettings(await readJson(privateFile, 128 * 1024), input.sourceRevision));
  assertProductV4LocalTarget(process.env);
  const [inspector, runtime, config, pdf, print, pageReader, playwright, database, schema, drizzle, storageModule, auth] = await Promise.all([
    import("../../lib/compute/product-diktat-inspector"), import("../../lib/compute/product-v4-runtime-binding"), import("../../lib/compute/product-v4-browser-config"), import("../../lib/bundle/product-diktat-pdf"), import("../../lib/materials/diktat-print-readiness"), import("../../lib/compute/pdf-pages"), import("playwright-core"), import("../../lib/db"), import("../../db/schema"), import("drizzle-orm"), import("../../lib/storage"), import("../../lib/auth/authoring-actor"),
  ]);
  try {
  const chromium = runtime.expectedChromiumRuntime();
  if (config.verificationBrowserIdentity().browserVersion !== chromium.browserVersion) throw new Error("PRODUCT_LEGACY_LOCAL_CHROMIUM_PIN_MISMATCH");
  const renderer = async (html: string): Promise<Uint8Array> => {
    if (Buffer.byteLength(html) > 16 * 1024 * 1024) throw new Error("PRODUCT_DIKTAT_SOURCE_TOO_LARGE");
    const browser = await playwright.chromium.launch({ headless: true, timeout: 20_000 });
    try {
      if (browser.version() !== chromium.browserVersion) throw new Error("PRODUCT_LEGACY_LOCAL_CHROMIUM_PIN_MISMATCH");
      const context = await browser.newContext({ viewport: { width: 703, height: 1032 }, reducedMotion: "reduce", serviceWorkers: "block", javaScriptEnabled: false });
      try {
        const errors: string[] = [];
        await context.route("**/*", async route => { errors.push("EXTERNAL_REQUEST"); await route.abort(); });
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        page.on("pageerror", () => errors.push("PAGE_ERROR"));
        page.on("console", message => { if (message.type() === "error") errors.push("CONSOLE_ERROR"); });
        await page.emulateMedia({ media: "print" });
        await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
        const failures = await page.evaluate(print.inspectDiktatPrintReadiness);
        if (errors.length) throw new Error("PRODUCT_DIKTAT_RENDERER_REJECTED");
        if (failures.length) throw new Error(failures[0]);
        const bytes = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pdf.PRODUCT_DIKTAT_FOOTER_TEMPLATE, preferCSSPageSize: true });
        if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("PRODUCT_DIKTAT_PDF_TOO_LARGE");
        return bytes;
      } finally { await context.close(); }
    } finally { await browser.close(); }
  };
  assertSource();
  const result = await inspector.generateProductDiktatPdfEvidence({ importId: input.importId, requestedBy: input.actorId, exactLegacyDraft: { runId: input.runId, expectedChecksum: input.expectedChecksum, diktatId: input.diktatId, articleId: input.articleId }, renderer, verifyReadback: true, beforeEvidenceWrite: assertSource });
  if (result.status !== "ready" || !result.storageKey || !result.checksum || !result.pageCount || !result.stagingAuditId) {
    console.log(JSON.stringify({ schema: "zyx-product-legacy-local-result.v1", status: "failed", importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, productId: result.productId, evidenceId: result.evidenceId, failureCode: result.failureCode ?? null }));
    throw new Error("PRODUCT_LEGACY_LOCAL_NOT_READY");
  }
  const storage = storageModule.storage;
  if (!storage.download) throw new Error("PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH");
  const assertReadback = async () => {
    await auth.assertAuthoringActor(database.db, input.actorId, { roles: ["admin"], error: "PRODUCT_DIKTAT_RENDER_FORBIDDEN", requireLegacyAdmin: true });
    const [row] = await database.db.select({ status: schema.imporBundle.status, checksum: schema.imporBundle.checksum, version: schema.imporBundle.version }).from(schema.imporBundle).where(drizzle.eq(schema.imporBundle.id, input.importId)).limit(1);
    const [evidence] = await database.db.select().from(schema.buktiPdfBundle).where(drizzle.eq(schema.buktiPdfBundle.id, result.evidenceId)).limit(1);
    const [staging] = await database.db.select({ id: schema.auditMutasi.id, correlationId: schema.auditMutasi.correlationId, afterSnapshot: schema.auditMutasi.afterSnapshot }).from(schema.auditMutasi).where(drizzle.and(drizzle.eq(schema.auditMutasi.entityType, "product_bundle"), drizzle.eq(schema.auditMutasi.entityId, input.importId), drizzle.inArray(schema.auditMutasi.action, ["draft_created", "draft_replaced"]))).orderBy(drizzle.desc(schema.auditMutasi.createdAt), drizzle.desc(schema.auditMutasi.id)).limit(1);
    assertProductLegacyReadback({ importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, printProfile: pdf.PRODUCT_DIKTAT_PRINT_PROFILE, result, row, staging, evidence });
  };
  await assertReadback();
  const bytes = await storage.download(result.storageKey);
  if (bytes.byteLength > 20 * 1024 * 1024 || hash(bytes) !== result.checksum) throw new Error("PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH");
  const pages = await pageReader.parseStoredPdfPages(bytes.slice(), Array.from({ length: result.pageCount }, (_, index) => index + 1), { representation: "both", imageWidth: 1280 });
  if (pages.totalPages !== result.pageCount || pages.pages.length !== result.pageCount) throw new Error("PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH");
  const outputDirectory = path.resolve(root, input.importId, randomUUID());
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const inventory: { file: string; mediaType: string; checksum: string; byteLength: number; pageNumber?: number }[] = [];
  async function save(file: string, data: Uint8Array, mediaType: string, pageNumber?: number) {
    const target = path.join(outputDirectory, file);
    await writeFile(target, data, { mode: 0o600 });
    const readback = await readFile(target);
    if (readback.byteLength !== data.byteLength || hash(readback) !== hash(data)) throw new Error("PRODUCT_LEGACY_LOCAL_READBACK_MISMATCH");
    inventory.push({ file: target, mediaType, checksum: hash(readback), byteLength: readback.byteLength, ...(pageNumber === undefined ? {} : { pageNumber }) });
  }
  await save("diktat.pdf", bytes, "application/pdf");
  for (const page of pages.pages) {
    await save(`page-${page.pageNumber}.png`, page.png, "image/png", page.pageNumber);
    await save(`page-${page.pageNumber}.json`, Buffer.from(JSON.stringify({ pageNumber: page.pageNumber, text: page.text, width: page.width, height: page.height }, null, 2)), "application/json", page.pageNumber);
  }
  await assertReadback();
  assertSource();
  const summary = { schema: "zyx-product-legacy-local-result.v1", status: "ready", sourceRevision: input.sourceRevision, importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, actorId: input.actorId, productId: result.productId, evidenceId: result.evidenceId, browserProvider: "local_playwright", chromium, printProfile: pdf.PRODUCT_DIKTAT_PRINT_PROFILE, pageCount: result.pageCount, pdfChecksum: result.checksum, outputDirectory, inventory, next: "Inspect every PDF page, then use current MCP review and publication gates for this exact draft." };
  await writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary));
  } finally { await database.pool.end(); }
}

export function reportProductLegacyLocalFailure(error: unknown) {
  console.error(JSON.stringify(productLegacyLocalFailure(error)));
  process.exitCode = 1;
}

if (import.meta.main) runProductLegacyLocal().catch(reportProductLegacyLocalFailure);

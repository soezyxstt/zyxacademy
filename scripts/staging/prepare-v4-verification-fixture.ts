/** Exact learning-content transfer only. Production is read-only; staging never receives reviews or receipts. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@libsql/client/web";
import { parseProductBundleZip } from "@/lib/bundle/product-bundle-v2";
import { assertStagingEnvironment } from "@/lib/staging/staging-guard";
import { isBundleIdentitySentinelOrPlaceholder } from "@/lib/bundle/attribution";
import { R2Provider } from "@/lib/storage/r2";

const revision = process.env.V4_REVISION ?? "";
const path = "artifacts/v4-fixture";
const allowed = new Set(["courses", "chapters", "concepts", "mata_kuliah", "bab", "sumber_materi", "potongan_sumber", "ide"]);
type Row = Record<string, string | number | null>;
type Entry = { table: string; row: Row };
const quote = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error("FIXTURE_IDENTIFIER_INVALID"); return `"${s}"`; };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  if (!/^[a-f0-9]{64}$/.test(revision)) throw Error("FIXTURE_EXACT_REVISION_REQUIRED");
  const mode = process.env.V4_FIXTURE_MODE;
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_CONNECTION_URL || process.env.DATABASE_URL;
  if (!url || !/^(libsql|https):/.test(url)) throw Error("FIXTURE_REMOTE_DATABASE_REQUIRED");
  const host = new URL(url).hostname;
  console.log(JSON.stringify({ mode, environment: process.env.ZYX_ENVIRONMENT, databaseHost: host }));
  if (mode === "export") {
    if (process.env.ZYX_ENVIRONMENT !== "production" || process.env.NEXT_PUBLIC_APP_URL !== "https://www.zyxacademy.com" || /staging/.test(host)) throw Error("FIXTURE_SOURCE_ENVIRONMENT_INVALID");
  } else if (mode === "import") {
    assertStagingEnvironment({ requireMutation: true, requiredResources: ["database", "authUrl", "r2Bucket"] });
  } else throw Error("FIXTURE_MODE_INVALID");
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const select = async (table: string, column: string, value: string | number) => (await client.execute({ sql: `SELECT * FROM ${quote(table)} WHERE ${quote(column)} = ?`, args: [value] })).rows as unknown as Row[];
  try {
    if (mode === "export") {
      // Only SELECTs are issued on production. No accounts, sessions, learner data or old evidence are exported.
      const imports = await select("impor_bundle", "checksum", revision);
      if (imports.length !== 1 || imports[0].bundle_type !== "product" || imports[0].status !== "draft" || imports[0].version !== 4) throw Error("FIXTURE_SOURCE_DRAFT_NOT_UNIQUE");
      const row = imports[0];
      const storage = new R2Provider();
      const bytes = await storage.download(String(row.source_uri_or_key));
      const parsed = parseProductBundleZip(bytes);
      if (!parsed.success || parsed.data.manifest.bundleChecksum !== revision || parsed.data.manifest.bundleId !== row.bundle_id) throw Error("FIXTURE_SOURCE_BYTES_MISMATCH");
      const bundle = parsed.data;
      if (bundle.products.some(p => p.productType === "article" && p.visuals?.some(v => v.kind === "source_figure"))) throw Error("FIXTURE_SOURCE_FIGURE_TRANSFER_NOT_SUPPORTED");
      if (bundle.dependencies.some(d => d.upstreamEntityType === "product" && !bundle.products.some(p => p.id === d.upstreamEntityId))) throw Error("FIXTURE_EXTERNAL_PRODUCT_NOT_SUPPORTED");
      const entries: Entry[] = [], external: Array<{ table: string; column: string; value: string | number }> = [];
      const visited = new Set<string>();
      const visit = async (table: string, column: string, value: string | number) => {
        if (!allowed.has(table)) {
          if (!["pengguna", "user"].includes(table)) throw Error("FIXTURE_UNSUPPORTED_PARENT");
          external.push({ table, column, value }); return;
        }
        const rows = await select(table, column, value);
        if (rows.length !== 1) throw Error("FIXTURE_DEPENDENCY_NOT_UNIQUE");
        const found = rows[0], key = `${table}:${found.id}`;
        if (visited.has(key)) return;
        visited.add(key);
        const fks = (await client.execute(`PRAGMA foreign_key_list(${quote(table)})`)).rows;
        for (const fk of fks) {
          const value = found[String(fk.from)];
          if (value !== null && value !== undefined) await visit(String(fk.table), String(fk.to), value);
        }
        entries.push({ table, row: found });
      };
      await visit("mata_kuliah", "id", bundle.manifest.courseId);
      for (const product of bundle.products) {
        if (product.chapterId) await visit("bab", "id", product.chapterId);
        for (const idea of product.ideaLinks) await visit("ide", "id", idea.id);
        for (const source of product.sourceRefs) {
          await visit("sumber_materi", "id", source.sourceId);
          for (const excerpt of source.excerptIds) await visit("potongan_sumber", "id", excerpt);
        }
        for (const id of [product.creatorId, product.curatorId]) if (id && !isBundleIdentitySentinelOrPlaceholder(String(id))) external.push({ table: "pengguna", column: "id", value: id });
      }
      for (const dependency of bundle.dependencies) {
        const table = { idea: "ide", source_material: "sumber_materi", source_chunk: "potongan_sumber" }[dependency.upstreamEntityType as string];
        if (table) await visit(table, "id", dependency.upstreamEntityId);
      }
      for (const id of [bundle.manifest.creatorId, bundle.manifest.curatorId, row.requested_by]) if (id && !isBundleIdentitySentinelOrPlaceholder(String(id))) external.push({ table: "pengguna", column: "id", value: id });
      const fresh = await select("impor_bundle", "id", String(row.id));
      if (fresh[0]?.checksum !== revision || fresh[0]?.source_uri_or_key !== row.source_uri_or_key || fresh[0]?.status !== "draft") throw Error("FIXTURE_SOURCE_CHANGED");
      await mkdir(path, { recursive: true });
      await writeFile(`${path}/bundle.zip`, bytes, { mode: 0o600 });
      await writeFile(`${path}/manifest.json`, JSON.stringify({ schemaVersion: "v4-staging-fixture.v1", revision, archiveSha256: digest(bytes), bundleId: row.bundle_id, requestedBy: row.requested_by, sourceDatabaseHost: host, entries, external }), { mode: 0o600 });
      console.log(JSON.stringify({ exported: true, bundleVersion: 4, dependencyRows: entries.length, revision }));
      return;
    }
    const manifest = JSON.parse(await readFile(`${path}/manifest.json`, "utf8"));
    const bytes = new Uint8Array(await readFile(`${path}/bundle.zip`));
    if (manifest.schemaVersion !== "v4-staging-fixture.v1" || manifest.revision !== revision || manifest.archiveSha256 !== digest(bytes) || manifest.sourceDatabaseHost === host) throw Error("FIXTURE_MANIFEST_INVALID");
    const parsed = parseProductBundleZip(bytes);
    if (!parsed.success || parsed.data.manifest.bundleChecksum !== revision || parsed.data.manifest.bundleId !== manifest.bundleId) throw Error("FIXTURE_ARCHIVE_INVALID");
    const existingImports = await select("impor_bundle", "bundle_id", manifest.bundleId);
    if (existingImports.some(row => row.checksum !== revision || row.status !== "draft")) throw Error("FIXTURE_EXISTING_BUNDLE_CONFLICT");
    // All references and conflicts are checked before the first staging write.
    for (const ref of manifest.external) {
      if (!["pengguna", "user"].includes(ref.table) || ref.column !== "id" || (await select(ref.table, ref.column, ref.value)).length !== 1) throw Error("FIXTURE_STAGING_IDENTITY_MISSING");
    }
    const missing: Entry[] = [];
    const pins: Record<string, string[]> = { ide: ["version", "semantic_hash", "status", "mata_kuliah_id"], sumber_materi: ["version", "checksum", "status", "mata_kuliah_id"], potongan_sumber: ["source_version", "checksum", "sumber_materi_id"] };
    for (const entry of manifest.entries as Entry[]) {
      if (!allowed.has(entry.table)) throw Error("FIXTURE_TABLE_INVALID");
      const existing = await select(entry.table, "id", String(entry.row.id));
      if (!existing.length) { missing.push(entry); continue; }
      if ((pins[entry.table] ?? []).some(column => existing[0][column] !== entry.row[column])) throw Error(`FIXTURE_DEPENDENCY_CONFLICT:${entry.table}`);
    }
    console.log(JSON.stringify({ before: { matchingDrafts: existingImports.length, missingDependencyRows: missing.length } }));
    if (missing.length) await client.batch(missing.map(entry => ({ sql: `INSERT INTO ${quote(entry.table)} (${Object.keys(entry.row).map(quote).join(",")}) VALUES (${Object.keys(entry.row).map(() => "?").join(",")})`, args: Object.values(entry.row) })), "write");
    const runId = `staging-v4-fixture-${randomUUID()}`;
    const { stageProductBundle } = await import("@/lib/bundle/product-staging");
    const result = existingImports.length ? { importId: String(existingImports[0].id) } : await stageProductBundle({ runId, bundleId: manifest.bundleId, courseId: parsed.data.manifest.courseId, checksum: revision, bytes, requestedBy: manifest.requestedBy, bundle: parsed.data });
    const { requestProductV4Verification, getProductV4VerificationReadiness } = await import("@/lib/bundle/product-v4-verification-service");
    // Existing drafts are inspected separately; never duplicate an existing attempt automatically.
    if (existingImports.length) { console.log(JSON.stringify({ alreadyStaged: true, revision })); return; }
    await requestProductV4Verification({ importId: result.importId, runId });
    console.log(JSON.stringify({ after: { staged: true, insertedDependencyRows: missing.length, verificationRequested: true }, revision }));
    const deadline = Date.now() + 40 * 60_000;
    let last = "";
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      const current = await getProductV4VerificationReadiness(result.importId, runId);
      const summary = JSON.stringify({ verificationStatus: current.state.status, completedChecks: current.state.completedChecks ?? 0, totalChecks: current.plan.requirements.length, ready: current.evaluation.ready, failureCode: current.state.failureCode ?? null });
      if (summary !== last) { console.log(summary); last = summary; }
      if (["failed", "stale"].includes(current.state.status)) throw Error("FIXTURE_TRUSTED_VERIFICATION_FAILED");
      if (current.state.status === "complete") {
        if (!current.evaluation.ready) throw Error("FIXTURE_TRUSTED_CHECKS_NOT_ALL_PASS");
        const { getProductBundleImport } = await import("@/lib/bundle/product-staging");
        const row = await getProductBundleImport(result.importId);
        const pdf = row?.validationReport.productV4PdfEvidence as { planHash?: string; attemptId?: string; receiptSignature?: string } | undefined;
        if (row?.checksum !== revision) throw Error("FIXTURE_STAGING_REVISION_CHANGED");
        if (pdf?.planHash === current.plan.planHash && pdf?.attemptId === current.attemptId && pdf?.receiptSignature === current.receipt?.signature) {
          console.log(JSON.stringify({ allChecksPass: true, receiptReady: true, pdfEvidencePersisted: true, revision })); return;
        }
      }
    }
    throw Error("FIXTURE_VERIFICATION_POLL_TIMEOUT");
  } finally { client.close(); }
}
main().catch(error => { console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message.split(":")[0]) ? error.message.split(":")[0] : "FIXTURE_OPERATION_FAILED"); process.exitCode = 1; });

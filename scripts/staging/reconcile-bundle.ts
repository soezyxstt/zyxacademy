import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, imporBundle, itemImporBundle, publikasiBundle } from "@/db/schema";
import { reconcilePublishedIdeaBundle } from "@/lib/bundle/publication";
import { currentSourceCommit, parseCliArgs, readArtifact, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const type = typeof args.type === "string" ? args.type : "idea";
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    if (type === "product") {
      process.env.FEATURE_PRODUCT_BUNDLE_V2 = "1";
      const plan = await readArtifact<{ import?: { importId?: string; bundleId?: string }; status?: string }>(runId, "plan-008-result.json");
      const importId = plan.import?.importId;
      if (!importId) throw new Error("STAGING_PRODUCT_BUNDLE_IMPORT_ID_MISSING");
      const [bundle] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
      if (!bundle) throw new Error("STAGING_PRODUCT_BUNDLE_IMPORT_NOT_FOUND");
      const items = await db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId));
      const audits = await db.select().from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId)));
      const publication = await db.select().from(publikasiBundle).where(eq(publikasiBundle.imporBundleId, importId));
      const { reconcileProductBundle } = await import("@/lib/bundle/product-publication");
      const domain = await reconcileProductBundle(importId);
      const report = {
        planNumber: "008",
        runId,
        status: bundle.status === "published" && publication.some((row) => row.status === "published") && items.length > 0 ? "passed" : "blocked",
        sourceCommit: currentSourceCommit(),
        bundle: { id: bundle.id, bundleId: bundle.bundleId, checksum: bundle.checksum, courseId: bundle.courseId, status: bundle.status },
        itemCount: items.length,
        publishedItemCount: items.filter((item) => item.status === "published").length,
        reviewAndPublicationAuditCount: audits.length,
        publications: publication.map((row) => ({ id: row.id, version: row.version, status: row.status, publicationHash: row.publicationHash })),
        domain,
        operatorTimestamp: new Date().toISOString(),
      };
      await writeArtifact(runId, "plan-008-reconcile.json", report);
      console.log(JSON.stringify({ status: report.status, runId, importId, itemCount: report.itemCount, publishedItemCount: report.publishedItemCount }));
      if (report.status !== "passed") process.exitCode = 1;
      return;
    }
    if (type !== "idea") throw new Error("STAGING_BUNDLE_TYPE_UNSUPPORTED");
    process.env.FEATURE_IDEA_BUNDLE_V2 = "1";
    const plan = await readArtifact<{ import?: { importId?: string; bundleId?: string }; status?: string }>(runId, "plan-006-result.json");
    const importId = plan.import?.importId;
    if (!importId) throw new Error("STAGING_BUNDLE_IMPORT_ID_MISSING");
    const [bundle] = await db.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
    if (!bundle) throw new Error("STAGING_BUNDLE_IMPORT_NOT_FOUND");
    const items = await db.select().from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, importId));
    const audits = await db.select().from(auditMutasi).where(and(eq(auditMutasi.entityType, "idea_bundle"), eq(auditMutasi.entityId, importId)));
    const publication = await db.select().from(publikasiBundle).where(eq(publikasiBundle.imporBundleId, importId));
    const domain = await reconcilePublishedIdeaBundle(importId);
    const report = {
      planNumber: "006",
      runId,
      status: bundle.status === "published" && publication.some((row) => row.status === "published") && items.length > 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      bundle: { id: bundle.id, bundleId: bundle.bundleId, checksum: bundle.checksum, courseId: bundle.courseId, status: bundle.status },
      itemCount: items.length,
      publishedItemCount: items.filter((item) => item.status === "published").length,
      reviewAndPublicationAuditCount: audits.length,
      publications: publication.map((row) => ({ id: row.id, version: row.version, status: row.status, publicationHash: row.publicationHash })),
      domain,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-006-reconcile.json", report);
    console.log(JSON.stringify({ status: report.status, runId, importId, itemCount: report.itemCount, publishedItemCount: report.publishedItemCount }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

void main();

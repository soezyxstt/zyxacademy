import { createHash } from "node:crypto";
import { deterministicProductSerialization } from "./product-validator";
import { productVersionId } from "./product-identity";
import { deriveProductV4VerificationPlan, type ProductV4VerificationAuthority, type ProductV4VerificationBinding } from "./product-v4-verification";
import type { ProductV4VerificationSnapshot } from "./product-v4-verification-core";
import { hasCompleteProductV4PrintCapture, productV4ReuseScope, readProductV4ReuseProof } from "./product-v4-verification-reuse";

type Bundle = ProductV4VerificationSnapshot["bundle"] & { checksum: string };
type Source = { id: string; bundleType: string; bundleId: string; courseId: string | null; checksum: string; validationReport: Record<string, unknown> };
type Diktat = Extract<Bundle["products"][number], { productType: "diktat" }>;
export interface ProductV4RevisionReusePorts {
  binding(input: { row: Source & { courseId: string }; bundle: Bundle; runId: string }): Promise<ProductV4VerificationBinding>;
  read(key: string): Promise<Uint8Array | null>;
  canonicalPdf(product: Diktat, courseId: string): Promise<{ exists: boolean; matching: boolean; key?: string }>;
  authority(): ProductV4VerificationAuthority;
}
const same = (left: unknown, right: unknown) => deterministicProductSerialization(left) === deterministicProductSerialization(right);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Server-only choice, never a caller-supplied waiver for PDF verification. */
export async function selectProductV4ReusableDiktatVersions(input: {
  source: Source; original: Bundle; candidate: Bundle; runId: string; rootImportId: string;
}, injected?: ProductV4RevisionReusePorts): Promise<{ preserveUnchangedDiktatIds: string[]; reason: "verified" | "proof_missing" | "runtime_unavailable" }> {
  const missing = { preserveUnchangedDiktatIds: [], reason: "proof_missing" as const };
  if (input.candidate.manifest.schemaVersion !== "product-bundle.v4" || input.original.manifest.schemaVersion !== "product-bundle.v4" ||
    !input.source.courseId || input.source.bundleType !== "product" || input.source.checksum !== input.original.checksum ||
    input.source.bundleId !== input.original.manifest.bundleId || input.source.validationReport.revisionVerificationContext) return missing;
  const lineage = input.source.validationReport.revisionLineage as { schema?: unknown; rootImportId?: unknown } | undefined;
  const root = lineage?.schema === "authoring-revision.v1" && typeof lineage.rootImportId === "string" ? lineage.rootImportId : input.source.id;
  if (root !== input.rootImportId || input.original.manifest.courseId !== input.candidate.manifest.courseId) return missing;
  const unchanged = input.candidate.products.filter((product): product is Diktat => product.productType === "diktat" &&
    input.original.products.some(previous => previous.id === product.id && previous.productType === "diktat" && same(previous, product)));
  if (!unchanged.length) return missing;
  try {
    const ports = injected ?? await applicationPorts();
    const row = { ...input.source, courseId: input.source.courseId, bundleId: input.candidate.manifest.bundleId, checksum: input.candidate.checksum };
    const binding = { ...await ports.binding({ row, bundle: input.candidate, runId: input.runId }), purpose: "pdf" as const };
    const snapshot: ProductV4VerificationSnapshot = {
      importId: row.id, checksum: row.checksum, sourceUriOrKey: "unstaged-revision-candidate", stagingAuditId: "unstaged-revision-candidate", stagingRunId: input.runId,
      importState: { bundleType: "product", bundleId: row.bundleId, courseId: row.courseId, version: 4, status: "draft", validationReport: { revisionLineage: { schema: "authoring-revision.v1", rootImportId: root } } },
      binding, bundle: input.candidate,
    };
    const plan = deriveProductV4VerificationPlan({ bundle: input.candidate, binding });
    const authority = ports.authority();
    const preserveUnchangedDiktatIds: string[] = [];
    for (const product of unchanged) {
      const requirements = plan.requirements.filter(check => check.layer === "print" && check.target === product.id);
      if (requirements.length !== 1 || requirements[0].artifactType !== "application/pdf") continue;
      const requirement = requirements.find(check => check.artifactType === "application/pdf")!;
      const scope = productV4ReuseScope(snapshot, plan, requirement, 0, null);
      const proof = scope ? await readProductV4ReuseProof({ scope, requirement, authority, read: key => ports.read(key) }) : null;
      if (!hasCompleteProductV4PrintCapture(proof)) continue;
      const pdfs = proof.artifacts.filter(artifact => artifact.mediaType === "application/pdf");
      const canonical = await ports.canonicalPdf(product, binding.courseId);
      if (canonical.exists) {
        if (!canonical.matching || !canonical.key) continue;
        const bytes = await ports.read(canonical.key);
        if (!bytes || bytes.byteLength !== pdfs[0].bytes.byteLength || sha(bytes) !== sha(pdfs[0].bytes)) continue;
      }
      preserveUnchangedDiktatIds.push(product.id);
    }
    return { preserveUnchangedDiktatIds, reason: preserveUnchangedDiktatIds.length ? "verified" : "proof_missing" };
  } catch {
    // This is an optional optimization. A failed read never preserves a version or
    // blocks the content edit. Normal verification reports any continuing outage.
    return { preserveUnchangedDiktatIds: [], reason: "runtime_unavailable" };
  }
}

async function applicationPorts(): Promise<ProductV4RevisionReusePorts> {
  const [{ db }, { diktatMateri }, { eq }, { storage }, { resolveAuthSecret }, { buildProductV4RevisionReuseBinding }, { readProductVerificationObject }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/storage"), import("@/lib/auth-secret"), import("@/lib/compute/product-v4-runtime-binding"), import("./product-v4-verification-core"),
  ]);
  return {
    binding: buildProductV4RevisionReuseBinding,
    read: key => readProductVerificationObject(storage, key),
    async canonicalPdf(product, courseId) {
      const [row] = await db.select({ version: diktatMateri.version, hash: diktatMateri.generationHash, courseId: diktatMateri.mataKuliahId, status: diktatMateri.status, key: diktatMateri.fileKey }).from(diktatMateri).where(eq(diktatMateri.id, productVersionId(product.id, product.version))).limit(1);
      return row ? { exists: true, matching: row.status === "published" && row.version === product.version && row.hash === product.generationHash && row.courseId === courseId, key: row.key ?? undefined } : { exists: false, matching: false };
    },
    authority() {
      if (!process.env.BETTER_AUTH_SECRET) throw new Error("PRODUCT_V4_VERIFICATION_KEY_REQUIRED");
      return { signingKey: resolveAuthSecret(), executorId: "zyx-product-v4-server-runner.v1" };
    },
  };
}

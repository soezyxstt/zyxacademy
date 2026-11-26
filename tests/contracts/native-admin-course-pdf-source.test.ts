import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { artikel, buktiPdfBundle, courseMaterials, diktatMateri, diktats } from "@/db/schema";
import type { ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { buildProductVerificationKey } from "@/lib/storage/keys";

const ids = ["course", "legacy-course"];
const course: ResolvedCourseIdentity = { primaryId: ids[0], canonicalId: ids[0], legacyId: ids[1], allIds: ids,
  slug: ids[0], title: "Matematika", category: "Matematika", description: null, status: "active" };
const selected = new Map<unknown, { row: object; requires: string[] }>();
const visited = new Map<unknown, unknown[]>();
const legacyFile = "courses/legacy-course/materials/manual.pdf";
const product = { id: "document", courseCode: "math-101", status: "published", revision: new Date(10), version: 2, generationHash: "generation" };

mock.module("server-only", () => ({}));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => "https://school.example.test" }));
mock.module("@/lib/offline/server-auth", () => ({ OfflineHttpError: class extends Error { constructor(readonly status: number) { super("PDF unavailable"); } } }));
mock.module("@/lib/admin/course-identity", () => ({ resolveCourseIdentity: async (id: string) => ids.includes(id) ? course : null }));
mock.module("@/db", () => ({ db: {
  select() {
    return { from(table: unknown) {
      const query = { innerJoin: () => query, where(condition: SQL) {
        const params = new PgDialect().sqlToQuery(condition).params;
        visited.set(table, params);
        const resource = selected.get(table);
        return { async limit() { return resource?.requires.every(value => params.includes(value)) ? [resource.row] : []; } };
      } };
      return query;
    } };
  },
} }));
const bundle = { importId: "import", expectedRevision: "8".repeat(64) };
const evidence = { row: { courseId: "course", status: "draft", version: 4 }, status: "ready",
  evidence: { id: "attempt", storageKey: "private/ready.pdf" }, pdfIntegrity: { checksum: "sha", byteLength: 1 } };
const getDiktatPdfContext = mock(async (_importId: string, _productId: string, _revision: string) => evidence);
const assertDiktatPdfBytes = mock((_context: typeof evidence, bytes: Uint8Array) => {
  if (bytes[0] !== 17) throw new Error("PRODUCT_DIKTAT_PDF_STALE");
});
mock.module("@/lib/bundle/product-diktat-evidence", () => ({ getDiktatPdfContext, assertDiktatPdfBytes }));
const { authorizeAdminCoursePdf, findAdminCoursePdf } = await import("@/lib/native/academic/course-pdf");

beforeEach(() => { selected.clear(); visited.clear(); });

test("upload and compiled Diktat records must belong to the same verified course and exact document", async () => {
  selected.set(courseMaterials, { row: { id: "document", course: ids[1], fileUrl: legacyFile, revision: new Date(1) },
    requires: ["document", ids[1]] });
  expect((await authorizeAdminCoursePdf({ courseId: ids[1], materialId: "document" })).source).toEqual({ storageKey: legacyFile });
  expect(visited.get(courseMaterials)).toContain(ids[0]);
  expect(await findAdminCoursePdf(course, "other")).toBeNull();
  await expect(authorizeAdminCoursePdf({ courseId: "outside", materialId: "document" })).rejects.toMatchObject({ status: 404 });
  selected.clear();
  selected.set(diktats, { row: { id: "document", course: ids[1], status: "ready", revision: new Date(1), fileUrl: "courses/legacy-course/diktats/compiled.pdf" },
    requires: ["document", ids[1]] });
  expect((await findAdminCoursePdf(course, "document"))?.source).toEqual({ storageKey: "courses/legacy-course/diktats/compiled.pdf" });
  selected.set(artikel, { row: { id: "document" }, requires: ["document", ids[0]] });
  expect(await findAdminCoursePdf(course, "document")).toBeNull();
});

test("canonical compiled PDFs require their exact storage namespace and recorded renderer evidence", async () => {
  const verificationKey = buildProductVerificationKey("a".repeat(64), "artifact-" + "b".repeat(64) + "-0.pdf");
  for (const fileKey of ["overhaul/bundle/diktat-pdf/compiled.pdf", verificationKey]) {
    selected.clear();
    selected.set(diktatMateri, { row: { ...product, fileKey }, requires: ["document", ids[0]] });
    expect(await findAdminCoursePdf(course, "document")).toBeNull();
    selected.set(buktiPdfBundle, { row: { id: "proof" }, requires: [fileKey, product.generationHash, "ready", ids[1]] });
    expect((await findAdminCoursePdf(course, "document"))?.source).toEqual({ storageKey: fileKey });
  }
  selected.set(diktatMateri, { row: { ...product, fileKey: "courses/math-101/materials/document-123456.pdf" }, requires: ["document", ids[0]] });
  expect((await findAdminCoursePdf(course, "document"))?.source).toEqual({ storageKey: "courses/math-101/materials/document-123456.pdf" });
  selected.set(diktatMateri, { row: { ...product, fileKey: "https://untrusted.example/document.pdf" }, requires: ["document", ids[0]] });
  expect(await findAdminCoursePdf(course, "document")).toBeNull();
});

test("a staged Diktat preview binds the import, course, product, evidence and actual bytes", async () => {
  const target = { courseId: "course", materialId: "diktat" };
  const grant = await authorizeAdminCoursePdf(target, bundle);
  expect(getDiktatPdfContext).toHaveBeenCalledWith(bundle.importId, target.materialId, bundle.expectedRevision);
  expect(grant.source).toEqual({ storageKey: evidence.evidence.storageKey });
  expect(() => grant.validateBytes!(Uint8Array.of(17))).not.toThrow();
  expect(() => grant.validateBytes!(Uint8Array.of(99))).toThrow();
  await expect(authorizeAdminCoursePdf({ ...target, courseId: "other" }, bundle)).rejects.toMatchObject({ status: 404 });
  getDiktatPdfContext.mockResolvedValueOnce({ ...evidence, status: "pending" });
  await expect(authorizeAdminCoursePdf(target, bundle)).rejects.toMatchObject({ status: 404 });
  getDiktatPdfContext.mockRejectedValueOnce(new Error("PRODUCT_BUNDLE_STALE_CONTEXT"));
  await expect(authorizeAdminCoursePdf(target, bundle)).rejects.toMatchObject({ status: 409 });
  getDiktatPdfContext.mockResolvedValueOnce({ ...evidence, evidence: { ...evidence.evidence, id: "replacement" } });
  expect((await authorizeAdminCoursePdf(target, bundle)).revision).not.toBe(grant.revision);
});

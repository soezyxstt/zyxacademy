import { expect, mock, test } from "bun:test";
import { pengguna, penggunaPeran, user } from "@/db/schema";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

const mutations: string[] = [];
const bundle = buildLocalVerificationFixture().bundle;
let assetLoads = 0;
mock.module("@/db", () => ({ db: {
  select() { return { from(table: unknown) {
    const rows = table === user ? [{ role: "admin" }]
      : table === pengguna ? [{ status: "active" }]
      : table === penggunaPeran ? [{ code: "admin" }]
      : [{ id: "import", bundleType: "product", version: 4, status: "draft", checksum: bundle.manifest.bundleChecksum }];
    const query = { innerJoin() { return query; }, where() { return query; }, limit: async () => rows,
      then(resolve: (value: typeof rows) => unknown) { return Promise.resolve(rows).then(resolve); } };
    return query;
  } }; },
  insert() { mutations.push("insert"); throw new Error("UNEXPECTED_EVIDENCE_MUTATION"); },
  update() { mutations.push("update"); throw new Error("UNEXPECTED_EVIDENCE_MUTATION"); },
} }));
mock.module("@/lib/bundle/product-staged-worker", () => ({ readProductBundleForDiktat: async () => bundle }));
mock.module("@/lib/compute/product-diktat-worker-assets", () => ({ loadDiktatWorkerAssets: async () => { assetLoads++; throw new Error("INTERACTIVE_DOCUMENT_ADMISSION_REQUIRED"); } }));
const { generateProductDiktatPdfEvidence } = await import("@/lib/compute/product-diktat-inspector");

test("V4 PDF evidence requires trusted verification before legacy rendering or evidence mutation", async () => {
  await expect(generateProductDiktatPdfEvidence({ importId: "import", requestedBy: "admin", renderer: async () => { throw new Error("UNEXPECTED_RENDER"); } })).rejects.toThrow("PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED");
  expect(assetLoads).toBe(0);
  expect(mutations).toEqual([]);
});

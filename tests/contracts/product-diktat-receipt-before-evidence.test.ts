import { expect, mock, test } from "bun:test";
import { user } from "@/db/schema";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

const mutations: string[] = [];
mock.module("@/db", () => ({ db: {
  select() { return { from(table: unknown) { return { where() { return { limit: async () => table === user ? [{ role: "admin" }] : [{ id: "import", status: "draft" }] }; } }; } }; },
  insert() { mutations.push("insert"); throw new Error("UNEXPECTED_EVIDENCE_MUTATION"); },
  update() { mutations.push("update"); throw new Error("UNEXPECTED_EVIDENCE_MUTATION"); },
} }));
mock.module("@/lib/bundle/product-staged-worker", () => ({ readProductBundleForDiktat: async () => buildLocalVerificationFixture().bundle }));
mock.module("@/lib/compute/product-diktat-worker-assets", () => ({ loadDiktatWorkerAssets: async () => { throw new Error("INTERACTIVE_DOCUMENT_ADMISSION_REQUIRED"); } }));
const { generateProductDiktatPdfEvidence } = await import("@/lib/compute/product-diktat-inspector");

test("missing PNG admission leaves existing PDF evidence unchanged", async () => {
  await expect(generateProductDiktatPdfEvidence({ importId: "import", requestedBy: "admin", renderer: async () => { throw new Error("UNEXPECTED_RENDER"); } })).rejects.toThrow("INTERACTIVE_DOCUMENT_ADMISSION_REQUIRED");
  expect(mutations).toEqual([]);
});

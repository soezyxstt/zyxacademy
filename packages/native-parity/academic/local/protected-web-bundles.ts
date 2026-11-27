// Read-only loopback object storage for two synthetic protected-page fixtures.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import {
  computeIdeaBundleChecksum, parseIdeaBundle, serializeDeterministically, type IdeaBundleManifest,
} from "@/lib/bundle/idea-bundle-v2";
import {
  computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle,
} from "@/lib/bundle/product-validator";

const sqlPath = process.argv[2];
if (!sqlPath) throw new Error("Pass a scratch file for generated fixture SQL");

const encoder = new TextEncoder();
const fixture = resolve("tests/fixtures/bundles/idea-v2");
const readFixture = (path: string) => readFile(resolve(fixture, path));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const date = "2026-11-21T03:00:00Z";

const ideaBase = JSON.parse(await readFile(resolve(fixture, "manifest.json"), "utf-8")) as IdeaBundleManifest;
ideaBase.bundleId = "academic-web-idea-package";
ideaBase.courseId = "academic-course-2";
const ideaFiles = new Map<string, Uint8Array>();
for (const entry of ideaBase.entityFiles) {
  const source = await readFixture(entry.path);
  const relocated = JSON.parse(source.toString("utf-8").replaceAll("course-physics", ideaBase.courseId));
  const bytes = encoder.encode(`${serializeDeterministically(relocated)}\n`);
  ideaFiles.set(entry.path, bytes);
  entry.checksum = hash(bytes);
}
for (const source of ideaBase.sourceVersions) {
  ideaFiles.set(source.contentPath, await readFixture(source.contentPath));
}
const ideaChecksum = computeIdeaBundleChecksum(ideaBase, ideaFiles);
ideaFiles.set("manifest.json", encoder.encode(serializeDeterministically({ ...ideaBase, bundleChecksum: ideaChecksum })));
parseIdeaBundle(ideaFiles);

const product = {
  id: "academic-web-article-1",
  productType: "article",
  slug: "struktur-dan-fungsi-membran-sel",
  title: "Struktur dan Fungsi Membran Sel",
  courseId: "academic-course-1",
  chapterId: "academic-web-cell-chapter",
  version: 1,
  status: "draft",
  schemaVersion: "1.0",
  creatorId: "academic-admin",
  curatorId: "academic-admin",
  ideaLinks: [{ id: "academic-web-cell-idea", version: 1, semanticHash: "a".repeat(64), weight: 1, role: "primary" }],
  sourceRefs: [{ sourceId: "academic-web-cell-source", version: 1, checksum: "b".repeat(64), excerptIds: ["academic-web-cell-excerpt"] }],
  sourceHash: "b".repeat(64),
  generationHash: "a".repeat(64),
  sections: [],
  blocks: [
    ["prior_knowledge_activation", "Permukaan sel membatasi bagian dalam sel dari lingkungan."],
    ["problem_introduction", "Bagaimana zat dapat masuk tanpa membuat isi sel keluar seluruhnya?"],
    ["explanation", "Membran terdiri atas lapisan ganda fosfolipid yang mengandung protein."],
    ["verbal_representation", "Kepala fosfolipid menghadap air, sementara ekornya saling berhadapan."],
    ["mathematical_representation", "Gradien konsentrasi dapat ditulis sebagai selisih konsentrasi per jarak."],
    ["analogy", "Membran menyerupai batas yang menyediakan jalur tertentu bagi molekul."],
    ["worked_example", "Oksigen dapat bergerak melintasi lapisan lipid mengikuti gradien konsentrasi."],
    ["misconception", "Membran bersifat selektif dan dapat dilalui beberapa jenis molekul."],
    ["application", "Protein kanal membantu ion melewati membran."],
    ["retrieval_prompt", "Bagian fosfolipid manakah yang menghadap air?"],
    ["summary", "Struktur fosfolipid dan protein membuat membran bersifat selektif."],
    ["retrieval_close", "Jelaskan satu perbedaan antara difusi oksigen dan perpindahan ion."],
  ].map(([blockType, content], orderIndex) => ({ id: `cell-block-${orderIndex}`, blockType, content, orderIndex })),
};
const productFiles = new Map([
  ["entities/products.json", encoder.encode(deterministicProductSerialization([product]))],
  ["entities/dependencies.json", encoder.encode(deterministicProductSerialization([]))],
]);
const productBase = {
  bundleId: "academic-web-product-package",
  bundleType: "product" as const,
  schemaVersion: "product-bundle.v2" as const,
  courseId: product.courseId,
  entityFiles: [
    { path: "entities/products.json", entityType: "products" as const, checksum: hash(productFiles.get("entities/products.json")!), stableIds: [product.id] },
    { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: hash(productFiles.get("entities/dependencies.json")!), stableIds: [] },
  ],
  creatorId: "academic-admin",
  curatorId: "academic-admin",
  createdAt: date,
  conflicts: [],
};
const productChecksum = computeProductBundleChecksum(productBase, productFiles);
productFiles.set("manifest.json", encoder.encode(deterministicProductSerialization({ ...productBase, bundleChecksum: productChecksum })));

const zippedIdea = zipSync(Object.fromEntries(ideaFiles), { mtime: new Date(date) });
const zippedProduct = zipSync(Object.fromEntries(productFiles), { mtime: new Date(date) });
const validation = validateProductBundle(zippedProduct);
if (!validation.success) throw new Error(JSON.stringify(validation.issues));

await writeFile(sqlPath, `BEGIN;
UPDATE impor_bundle
SET bundle_id = '${ideaBase.bundleId}', checksum = '${ideaChecksum}', course_id = 'fisika-dasar',
    version = 2, status = 'validated', validation_report = '{"valid":true}'
WHERE id = 'academic-web-idea-1' AND requested_by = 'academic-admin';
UPDATE impor_bundle
SET bundle_id = '${productBase.bundleId}', checksum = '${productChecksum}',
    version = 2, status = 'draft', validation_report = '{"valid":true}'
WHERE id = 'academic-web-product-1' AND requested_by = 'academic-admin';
COMMIT;
`);

const bucket = "/academic-fixture/local-fixtures/";
const objects = new Map([
  [`${bucket}academic-web-idea-1.zip`, zippedIdea],
  [`${bucket}academic-web-product-1.zip`, zippedProduct],
]);
createServer((request, response) => {
  const key = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const bytes = request.method === "GET" ? objects.get(key) : undefined;
  if (!bytes) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "application/zip", "Content-Length": bytes.byteLength });
  response.end(bytes);
}).listen(3316, "127.0.0.1", () => {
  console.log("Serving the two fixture ZIPs on http://127.0.0.1:3316");
});

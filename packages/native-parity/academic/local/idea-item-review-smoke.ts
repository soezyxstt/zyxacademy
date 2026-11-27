import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { zipSync } from "fflate";
import pg from "pg";
import { computeIdeaBundleChecksum, parseIdeaBundle, serializeDeterministically, type IdeaBundleManifest } from "@/lib/bundle/idea-bundle-v2";
import { fixtureCookie } from "./cookie.mjs";

const fixture = "tests/fixtures/bundles/idea-v2";
const id = `native-idea-review-${randomUUID()}`;
const storageKey = `local-fixtures/${id}.zip`;
const manifest: IdeaBundleManifest = JSON.parse(await readFile(join(fixture, "manifest.json"), "utf8"));
const files = new Map<string, Uint8Array>();
const oldCourse = manifest.courseId;
manifest.courseId = "academic-course-2";
for (const entry of manifest.entityFiles) {
  const bytes = Buffer.from((await readFile(join(fixture, entry.path), "utf8")).replaceAll(oldCourse, manifest.courseId));
  files.set(entry.path, bytes);
  entry.checksum = createHash("sha256").update(bytes).digest("hex");
}
for (const source of manifest.sourceVersions) files.set(source.contentPath, await readFile(join(fixture, source.contentPath)));
manifest.bundleId = id;
manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
files.set("manifest.json", Buffer.from(serializeDeterministically(manifest)));
const artifact = parseIdeaBundle(files);
const zip = zipSync(Object.fromEntries(files));
const storage = createServer((request, response) => {
  if (request.method === "GET" && request.url?.split("?")[0] === `/academic-fixture/${storageKey}`) {
    response.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length }).end(zip);
  } else response.writeHead(404).end();
});
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const origin = "http://localhost:3314";
const ideaId = artifact.entities.ideas[0].id;
const api = `http://127.0.0.1:3314/api/native/academic-administration/bundle/idea`;
const bundle = (slug: string) => `${api}/${slug}/${id}`;
const item = (slug: string) => `${bundle(slug)}/item/${ideaId}`;

async function request(url: string, body?: unknown, requestId = randomUUID(), role = "admin") {
  return fetch(url, {
    method: body ? "PATCH" : "GET",
    redirect: "manual",
    headers: {
      ...(role ? { cookie: fixtureCookie(role) } : {}),
      ...(body ? { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json(response: Response, status: number) {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

try {
  const fixtureSession = await pool.query("select id from session where id = 'session-academic-admin' and user_id = 'academic-admin'");
  assert.equal(fixtureSession.rowCount, 1);
  await new Promise<void>((resolve, reject) => storage.once("error", reject).listen(3318, "127.0.0.1", resolve));
  await pool.query(`insert into impor_bundle (id, bundle_id, checksum, bundle_type, course_id, source_uri_or_key, version, status, validation_report, requested_by)
    values ($1, $1, $2, 'idea', 'fisika-dasar', $3, 2, 'validated', '{"valid":true}', 'academic-admin')`,
  [id, manifest.bundleChecksum, storageKey]);
  await pool.query(`insert into item_impor_bundle (id, impor_bundle_id, entity_type, entity_id, entity_version, entity_hash, status)
    values ($1, $1, 'idea', $2, 1, $3, 'validated')`, [id, ideaId, artifact.entities.ideas[0].semanticHash]);
  const detail = await json(await request(bundle("fisika-dasar")), 200);
  assert.equal(detail.rows[1].ideaReviewId, ideaId);
  await json(await request(item("biologi-dasar")), 404);
  await json(await request(item("fisika-dasar"), undefined, undefined, ""), 401);
  await json(await request(item("fisika-dasar"), undefined, undefined, "tutor"), 403);
  const target = await json(await request(item("fisika-dasar")), 200);
  assert.equal(target.code, "KIN-VELOCITY");
  assert.ok(target.sources[0]?.excerpt);
  const edit = { ...target.review, status: "changes_requested", notes: "Perjelas definisi dan kaitannya dengan sumber." };
  const requestId = randomUUID();
  const [receipt, replay] = await Promise.all(Array.from({ length: 2 }, async () =>
    json(await request(item("fisika-dasar"), edit, requestId), 200)));
  assert.deepEqual(receipt, replay);
  assert.deepEqual(receipt, { importId: id, ideaId, requestId, status: edit.status });
  await json(await request(item("academic-course-2"), edit), 409);
  await json(await request(item("fisika-dasar"), { ...edit, notes: "A different payload" }, requestId), 409);
  const actual = await json(await request(item("academic-course-2")), 200);
  assert.equal(actual.review.notes, edit.notes);
  assert.notEqual(actual.review.expectedReviewRevision, edit.expectedReviewRevision);
  const review = await pool.query("select reviewer_id, status, notes from review_item_bundle where impor_bundle_id = $1", [id]);
  assert.deepEqual(review.rows, [{ reviewer_id: "academic-admin", status: edit.status, notes: edit.notes }]);
  const audit = await pool.query("select action from audit_mutasi where entity_id = $1 order by action", [id]);
  assert.deepEqual(audit.rows.map((row) => row.action), ["item_reviewed", "native_item_review_receipt"]);
  console.log("Idea item review local HTTP/PG: scoped evidence, role isolation, persistence, concurrent replay and revision conflict passed");
} finally {
  try {
    await pool.query("delete from audit_mutasi where entity_id = $1 and actor_id = 'academic-admin'", [id]);
    await pool.query("delete from impor_bundle where id = $1 and requested_by = 'academic-admin'", [id]);
  } finally {
    await pool.end();
    await new Promise<void>((resolve) => storage.close(() => resolve()));
  }
}

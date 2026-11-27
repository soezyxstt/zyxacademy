// Run in its own Bun process so the local database binding cannot affect other suites.
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { blogArticles } from "../../db/schema";

const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: { getUrl: (url: string) => url } }));

try {
  const { GET: list } = await import("../../app/api/native/public/blog/route");
  const { GET: detail } = await import("../../app/api/native/public/blog/[slug]/route");
  const index = (query = "") => list(new Request("http://localhost/api/native/public/blog" + query));
  const show = (slug: string) => detail(new Request("http://localhost/"), { params: Promise.resolve({ slug }) });
  const articles = Array.from({ length: 15 }, (_, i) => ({
    id: `operations-${i}`,
    slug: `operations-${i}`,
    title: `Judul ${i}`,
    summary: "Ringkasan",
    content: `Isi ${i}`,
    category: "tips_kuliah" as const,
    status: i === 13 ? "draft" as const : i === 14 ? "scheduled" as const : "published" as const,
    publishedAt: new Date(Date.UTC(2026, 0, i + 1)),
  }));
  await testDb.insert(blogArticles).values(articles);

  const listing = await index();
  assert.equal(listing.status, 200);
  assert.equal(listing.headers.get("cache-control"), "no-store");
  const home = await listing.json();
  assert.equal(home.total, 13);
  assert.equal(home.articles.length, 3);
  assert.equal(home.sections.length, 1);
  for (const row of [...home.articles, ...home.sections[0].entries]) {
    assert.ok(!["operations-13", "operations-14"].includes(row.slug));
    assert.equal("content" in row || "createdById" in row || "id" in row, false);
  }
  const page = await (await index("?category=tips_kuliah&page=2")).json();
  assert.deepEqual(page.articles.map((article: { slug: string }) => article.slug), ["operations-0"]);
  assert.equal((await (await index("?category=pojok_kampus")).json()).total, 0);
  const article = await (await show("operations-12")).json();
  assert.equal(article.article.content, "Isi 12");
  assert.ok(article.related.length > 0);
  assert.ok(article.related.every((row: { slug: string }) => !["operations-12", "operations-13", "operations-14"].includes(row.slug)));
  for (const slug of ["operations-13", "operations-14", "missing"]) {
    assert.equal((await show(slug)).status, 404);
  }
  // Exercise the handler's temporary database error and retry against the same data.
  await client.exec("ALTER TABLE blog_articles RENAME TO operations_unavailable");
  assert.equal((await index()).status, 503);
  await client.exec("ALTER TABLE operations_unavailable RENAME TO blog_articles");
  assert.deepEqual(await (await index()).json(), home);
  console.log("operations public blog: projection, pagination, 404, failure and retry passed");
} finally {
  await client.close();
}

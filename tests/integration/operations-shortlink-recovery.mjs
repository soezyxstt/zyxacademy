import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { pengguna, penggunaPeran, peran, user } from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";

const { client, testDb } = await createPostgresTestDb();
const account = { id: "fixture-shortlink-admin", role: "admin" };
let signedIn = true;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => signedIn ? { user: account } : null } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));

try {
  await testDb.insert(user).values({ ...account, name: "Fixture Admin", email: "admin@example.invalid" });
  await testDb.insert(pengguna).values({ id: account.id, status: "active" });
  await testDb.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  await testDb.insert(penggunaPeran).values({
    id: "fixture-shortlink-member", penggunaId: account.id, peranId: PERAN_SEEDS.find(role => role.code === "admin").id, source: "manual",
  });

  const { GET, POST } = await import("../../app/api/admin/short-links/route");
  const request = (slug, title) => new Request("https://example.invalid/api/admin/short-links", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, title, url: "https://example.invalid/blog" }),
  });
  const responses = await Promise.all([POST(request("belajar", "Belajar")), POST(request("belajar", "Duplikat"))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.deepEqual(await responses.find(response => response.status === 409).json(), { error: "Slug already exists" });
  const list = await GET();
  assert.equal(list.headers.get("cache-control"), "private, no-store");
  assert.equal((await list.json()).filter(link => link.slug === "belajar").length, 1);
  const retry = await POST(request("belajar-baru", "Belajar"));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).slug, "belajar-baru");
  signedIn = false;
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(request("belajar-lagi", "Belajar"))).status, 403);
  console.log("short link conflicts, recovery and authorization passed against local PostgreSQL");
} finally {
  await client.close();
}

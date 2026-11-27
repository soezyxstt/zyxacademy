import assert from "node:assert/strict";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { penggunaPeran, peran, user } from "../../db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
const { client, testDb } = await createPostgresTestDb();
let current = null;
const session = async () => current && { user: current };
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: session }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: session } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/vector-sync-dispatch", () => ({
  dispatchVectorSync: async () => {
    throw new Error("unexpected vector call");
  },
}));
mock.module("@/lib/generation-pipeline", () => ({
  startGenerationJob: async () => {
    throw new Error("unexpected job");
  },
}));
let checked = 0;
try {
  const handlers = await import(
    "../../app/api/native/operations/evaluation/actions/route"
  );
  const requests = [
    ["GET", "generation-job&id=synth"],
    ["POST", "generation-jobs"],
    ["POST", "questions"],
    ["PUT", "questions"],
    ["PUT", "question&id=synth"],
    ["DELETE", "question&id=synth"],
    ["POST", "import-questions"],
  ];
  async function check(method, action, want, extraHeaders = {}, body = {}) {
    const req = new NextRequest(
      "http://localhost/api/native/operations/evaluation/actions?action=" +
        action,
      {
        method,
        headers: { "Content-Type": "application/json", ...extraHeaders },
        ...(method === "POST" || method === "PUT"
          ? { body: JSON.stringify(body) }
          : {}),
      },
    );
    const response = await handlers[method](req);
    assert.equal(
      response.status,
      want,
      method + " " + action + " " + JSON.stringify(await response.json()),
    );
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
    checked++;
  }
  for (const [m, a] of requests) await check(m, a, 401);
  await testDb
    .insert(peran)
    .values([...PERAN_SEEDS])
    .onConflictDoNothing();
  for (const role of ["student", "teacher", "admin"]) {
    current = { id: "eval-write-" + role, role };
    await testDb
      .insert(user)
      .values({ ...current, name: role, email: role + "@example.invalid" });
    if (role !== "admin") for (const [m, a] of requests) await check(m, a, 403);
  }
  for (const [m, a] of requests)
    if (m !== "GET")
      await check(m, a, 403, { Origin: "https://wrong.example.invalid" });
  await check("POST", "generation-jobs", 415, { "Content-Type": "text/plain" });
  await check("POST", "unknown", 404);
  await check("GET", "generation-job", 404);
  await check(
    "POST",
    "generation-jobs",
    400,
    {},
    { courseId: "missing", chapterId: "missing", koId: "all" },
  );
  await check("POST", "questions", 400);
  await check("POST", "import-questions", 400);
  await check("PUT", "questions", 400);
  await check("PUT", "question&id=synth", 400);
  await check("DELETE", "question&id=synth", 200);
  await check("GET", "generation-job&id=synth", 404);
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, current.id));
  for (const [m, a] of requests) await check(m, a, 403);
  console.log("guard + real delegated handler checks passed", checked);
} finally {
  await client.close();
}

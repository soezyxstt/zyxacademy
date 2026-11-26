import { afterAll, expect, mock, test } from "bun:test";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { pengguna, session, user } from "@/db/schema";
import { PERAN_SEEDS } from "@/lib/auth/peran";
import { peran } from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb: db } = await createPostgresTestDb();
mock.module("@/db", () => ({ db }));
const { auth } = await import("@/lib/auth");
const { requireNativeStudent } = await import("@/app/api/native/student/_session");
const context = await auth.$context;
afterAll(() => client.close());

async function fixture(userId: string, role: "student" | "teacher") {
  await db.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  await db.insert(user).values({ id: userId, name: userId, email: userId + "@example.invalid", role });
  const token = "synthetic-" + userId;
  await db.insert(session).values({ id: token, userId, token, expiresAt: new Date(Date.now() + 60000) });
  const signed = token + "." + await makeSignature(token, context.secret);
  return context.authCookies.sessionToken.name + "=" + encodeURIComponent(signed);
}

function request(cookie: string, expected: string, source?: string) {
  const headers = new Headers({ cookie, "x-student-id": expected });
  if (source) headers.set("origin", source);
  return new Request("http://localhost:3000/api/native/student/courses", { headers });
}

test("signed learner session is checked against current DB membership and account on each request", async () => {
  const userId = "student-session-test";
  const cookie = await fixture(userId, "student");
  expect(await requireNativeStudent(request(cookie, userId))).toEqual({ userId });
  expect((await requireNativeStudent(request(cookie, "another-user")) as Response).status).toBe(409);
  expect((await requireNativeStudent(request(cookie, userId, "https://foreign.invalid")) as Response).status).toBe(403);
  await db.update(pengguna).set({ status: "suspended" }).where(eq(pengguna.id, userId));
  expect((await requireNativeStudent(request(cookie, userId)) as Response).status).toBe(403);
  await db.delete(session).where(eq(session.userId, userId));
  expect((await requireNativeStudent(request(cookie, userId)) as Response).status).toBe(401);
});

test("Tutor role and absent or altered credentials cannot access Student handlers", async () => {
  const userId = "student-session-tutor";
  const cookie = await fixture(userId, "teacher");
  expect((await requireNativeStudent(request(cookie, userId)) as Response).status).toBe(403);
  for (const invalid of ["", cookie + "x"]) {
    expect((await requireNativeStudent(request(invalid, userId)) as Response).status).toBe(401);
  }
});

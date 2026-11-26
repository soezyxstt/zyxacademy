import { afterAll, expect, mock, test } from "bun:test";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { accountLocalePreferences, pengguna, session, user } from "@/db/schema";
import { PERAN_SEEDS } from "@/lib/auth/peran";
import { peran } from "@/db/schema";
import { personalAccountSessionHeader } from "@/packages/student-community/account-access";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb: db } = await createPostgresTestDb();
mock.module("@/db", () => ({ db }));
const { auth } = await import("@/lib/auth");
const { requireNativePersonalAccount, requireNativeStudent } = await import("@/app/api/native/student/_session");
const context = await auth.$context;
let browserHeaders = new Headers();
const nextHeaders = await import("next/headers");
mock.module("next/headers", () => ({ ...nextHeaders, headers: async () => browserHeaders }));
const community = await import("@/app/api/native/student/community/[operation]/route");
afterAll(() => client.close());

async function fixture(userId: string, role: "student" | "teacher" | "admin") {
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

test("Tutor and Admin use their signed session for personal reads and locale writes only", async () => {
  for (const role of ["teacher", "admin"] as const) {
    const userId = `personal-${role}`;
    const cookie = await fixture(userId, role);
    const send = (method: "GET" | "POST", operation: string, options: { sessionId?: string; userId?: string; locale?: string } = {}) => {
      const headers = new Headers({ cookie, "x-student-id": options.userId ?? userId, "content-type": "application/json" });
      if (options.sessionId !== undefined) headers.set(personalAccountSessionHeader, options.sessionId);
      browserHeaders = headers;
      return community[method](new Request(`http://localhost:3000/api/native/student/community/${operation}`, {
        method, headers, body: method === "POST" ? JSON.stringify({ locale: options.locale ?? "en" }) : undefined,
      }), { params: Promise.resolve({ operation }) });
    };
    const current = { sessionId: "synthetic-" + userId };
    expect((await send("GET", "profile")).status).toBe(409);
    expect((await send("GET", "profile", { sessionId: "old-session" })).status).toBe(409);
    expect((await send("GET", "profile", { ...current, userId: "another-user" })).status).toBe(409);
    expect(await (await send("GET", "profile", current)).json()).toMatchObject({
      account: { name: userId, email: userId + "@example.invalid" },
      customization: null, summary: null, courses: [], stats: null,
    });
    expect(await (await send("GET", "notifications", current)).json()).toMatchObject({ canUseTutorialAvailability: role === "teacher" });
    for (const operation of ["public-profile", "reflections", "achievements", "academic-ranking", "discussion-scope"]) {
      expect((await send("GET", operation, current)).status).toBe(403);
    }
    for (const operation of ["social-settings", "social", "groups", "reward", "discussion"]) {
      expect((await send("POST", operation, current)).status).toBe(403);
    }
    expect(await (await send("POST", "locale", current)).json()).toEqual({ success: true });
    expect(await db.select({ locale: accountLocalePreferences.locale }).from(accountLocalePreferences)
      .where(eq(accountLocalePreferences.userId, userId))).toEqual([{ locale: "en" }]);
    expect(await (await send("POST", "locale", { ...current, locale: "other" })).json()).toEqual({ code: "invalid" });
    await db.update(pengguna).set({ status: "suspended" }).where(eq(pengguna.id, userId));
    expect((await send("GET", "profile", current)).status).toBe(403);
  }
});

test("existing learner clients retain their account-header-only personal access", async () => {
  const userId = "legacy-personal-learner";
  const cookie = await fixture(userId, "student");
  expect(await requireNativePersonalAccount(request(cookie, userId))).toEqual({ userId });
});

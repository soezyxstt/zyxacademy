import { expect, test } from "bun:test";
import { createNativeSessionController } from "../../apps/mobile-native/auth/session-controller";
import { NativeAdditionalLoginError } from "../../apps/mobile-native/auth/additional-login-error";
import { NATIVE_STAGING_ORIGIN as origin, type SessionIdentity } from "../../apps/mobile-native/auth/session-api";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const expiresAt = Date.UTC(2027, 0, 1);
const credential = (id: string) => `__Secure-better-auth.session_token=${id}.${"a".repeat(43)}%3D`;
const headers = (id: string) => new Headers({ "set-cookie": `${credential(id)}; Secure; HttpOnly; Path=/` });
function fixture() {
  let value: string | null = null;
  let failWrite = false;
  const sessions = new Map<string, SessionIdentity>();
  const revoked: string[] = [];
  const newSession = (accountId: string, id = accountId) => {
    sessions.set(credential(id), { accountId, sessionId: id, expiresAt });
    return headers(id);
  };
  const create = () => createNativeSessionController({
    origin, now: () => expiresAt - 1000,
    dataTransport: createNativeTransport({ origin, fetcher: async () => new Response("message") }),
    api: { read: async cookie => sessions.get(cookie) ?? null, revoke: async cookie => { revoked.push(cookie); sessions.delete(cookie); } },
    store: { read: async () => value, write: async next => { if (failWrite) throw new Error("full"); value = next; }, remove: async () => { value = null; } },
  });
  async function login() {
    const session = create();
    await session.refresh();
    await session.acceptLogin(newSession("student"), "student");
    return session;
  }
  return { login, create, newSession, revoked, sessions, getStored: () => value,
    setFailWrite: (v: boolean) => { failWrite = v; }, setStored: (v: string) => { value = v; } };
}

test("switches roles after online verification, detaches old device work, and restores only the active identity on restart", async () => {
  const f = fixture();
  const session = await f.login();
  const original = session.getSnapshot().transport!;
  await session.rememberAccountAccess({ accountId: "student", sessionId: "student", roles: ["murid"], locale: "id",
    display: { name: "Murid", email: "student@example.test" } }, original);
  const cleaned: string[] = [];
  session.subscribeBeforeLogout(transport => { cleaned.push(transport.scope.sessionId); });
  session.subscribeBeforeLocalLogout(scope => { cleaned.push(scope.accountId); });
  await session.acceptAdditionalLogin(f.newSession("tutor"), "tutor", "student");
  expect(original.isCurrent()).toBe(false);
  expect(cleaned).toEqual(["student", "student"]);
  expect(await session.listSavedAccounts()).toEqual([{ accountId: "student", name: "Murid", email: "student@example.test" }]);
  const cold = f.create();
  await cold.refresh();
  expect(cold.getSnapshot().state).toEqual({ status: "signed-in", accountId: "tutor", sessionId: "tutor", expiresAt });
  await expect(cold.switchSavedAccount("student", "wrong-session")).rejects.toMatchObject({ code: "BUSY" });
  await cold.switchSavedAccount("student", "tutor");
  expect(cold.getSnapshot().state).toEqual({ status: "signed-in", accountId: "student", sessionId: "student", expiresAt });
  await cold.logout();
  expect(f.revoked).toEqual([credential("student")]);
  const signedOut = f.create();
  await signedOut.refresh();
  expect(signedOut.getSnapshot().state.status).toBe("signed-out");
  await signedOut.switchSavedAccount("tutor", null);
  expect(signedOut.getSnapshot().state).toMatchObject({ status: "signed-in", accountId: "tutor" });
});

test("protects existing cookies on duplicate attempts and retires distinct rejected grants", async () => {
  const f = fixture();
  const session = await f.login();
  await expect(session.acceptAdditionalLogin(headers("student"), "student", "student")).rejects.toBeInstanceOf(NativeAdditionalLoginError);
  expect(f.revoked).toEqual([]);
  await expect(session.acceptAdditionalLogin(f.newSession("student", "alternate"), "student", "student")).rejects.toMatchObject({ code: "ACTIVE_ACCOUNT" });
  const cancel = new AbortController();
  cancel.abort();
  await expect(session.acceptAdditionalLogin(f.newSession("other"), "other", "student", cancel.signal)).rejects.toMatchObject({ code: "CANCELLED" });
  await expect(session.acceptAdditionalLogin(f.newSession("outsider"), "wrong-identity", "student")).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
  expect(f.revoked).toEqual(["alternate", "other", "outsider"].map(credential));
  expect(session.getSnapshot().state).toMatchObject({ status: "signed-in", accountId: "student" });
});

test("an unconsumed mutation blocks switching and failed storage restores private transport without exposing the cookie", async () => {
  const f = fixture();
  const session = await f.login();
  await session.acceptAdditionalLogin(f.newSession("staff"), "staff", "student");
  const pending = await session.getSnapshot().transport!.request("/api/change", { method: "POST" });
  await expect(session.switchSavedAccount("student", "staff")).rejects.toMatchObject({ code: "PENDING_CHANGES" });
  expect(await pending.text()).toBe("message");
  const previous = f.getStored();
  f.setFailWrite(true);
  await expect(session.switchSavedAccount("student", "staff")).rejects.toThrow();
  expect(session.getSnapshot().state).toEqual({ status: "signed-in", accountId: "staff", sessionId: "staff", expiresAt });
  expect(session.getSnapshot().transport?.isCurrent()).toBe(true);
  expect(f.getStored()).toBe(previous);
  f.setFailWrite(false);
  await session.switchSavedAccount("student", "staff");
  await session.removeSavedAccount("staff", "student");
  expect(f.revoked).toEqual([credential("staff")]);
  expect(await session.listSavedAccounts()).toEqual([]);
  expect(JSON.parse(f.getStored()!)).not.toHaveProperty("savedSessions");
});

test("enforces the five-account limit, verifies saved identities again and filters foreign stored accounts", async () => {
  const f = fixture();
  const session = await f.login();
  let current = "student";
  for (const next of ["two", "three", "four", "five"]) {
    await session.acceptAdditionalLogin(f.newSession(next), next, current);
    current = next;
  }
  await expect(session.acceptAdditionalLogin(f.newSession("six"), "six", current)).rejects.toMatchObject({ code: "SESSION_LIMIT" });
  expect(f.revoked).toEqual([credential("six")]);
  f.sessions.delete(credential("student"));
  await expect(session.switchSavedAccount("student", current)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect((await session.listSavedAccounts()).map(i => i.accountId)).toEqual(["two", "three", "four"]);
  const bundle = JSON.parse(f.getStored()!);
  bundle.savedSessions[0].origin = "https://foreign.invalid";
  bundle.savedSessions[1].expiresAt = 0;
  f.setStored(JSON.stringify(bundle));
  const cold = f.create();
  await cold.refresh();
  expect((await cold.listSavedAccounts()).map(i => i.accountId)).toEqual(["four"]);
});

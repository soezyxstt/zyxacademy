import { expect, test } from "bun:test";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { loadNativeAccountContext } from "../../apps/mobile-native/network/account-context";

const origin = "https://staging.zyxacademy.com";
const context = { accountId: "student", sessionId: "one", roles: ["tutor", "murid"], dashboard: "/tutor", locale: "id" } as const;
function run(payload: unknown, status = 200) {
  const transport = createNativeTransport({ origin, fetcher: async url => {
    expect(url).toBe(origin + "/api/native/context");
    return Response.json(payload, { status });
  } });
  const session = transport.setSession({ origin, accountId: "student", sessionId: "one", readCookie: () => "session=fixture" });
  return loadNativeAccountContext(session);
}

test("returns the current user's scoped roles, locale and role dashboard", async () => {
  expect(await run(context)).toEqual(context);
});
test("rejects cross-session data and inconsistent memberships or locale", async () => {
  for (const invalid of [{ sessionId: "previous" }, { accountId: "other" }, { locale: "xx" }, { roles: [] },
    { roles: ["teacher"] }, { dashboard: "/admin" }]) {
    await expect(run({ ...context, ...invalid })).rejects.toThrow();
  }
});
test("does not provide access on an expired or unauthorized session", async () => {
  for (const status of [401, 403]) await expect(run(context, status)).rejects.toThrow();
});

import { expect, test } from "bun:test";
import { accountSessions, accountSessionsPath } from "../../packages/student-community/account-sessions";
import { createCommunityFixtureRequest } from "../../packages/native-parity/student/community/fixtures";

test("rejects another active scope and lists only the remaining device after sign-out", async () => {
  const request = createCommunityFixtureRequest();
  const list = async () => (await request(accountSessionsPath)).json();
  const initial = await list();
  expect(accountSessions(initial, "different")).toBeNull();
  expect(accountSessions({ sessions: [...initial.sessions, initial.sessions[0]] })).toBeNull();
  expect(accountSessions(initial, "phone")?.map(row => row.id)).toEqual(["phone", "laptop"]);
  const revoke = (id: string) => request(accountSessionsPath, { method: "DELETE", body: JSON.stringify({ id }) });
  expect((await revoke("phone")).status).toBe(409);
  expect((await revoke("foreign")).status).toBe(404);
  expect((await revoke("laptop")).ok).toBe(true);
  expect(accountSessions(await list(), "phone")?.map(row => row.id)).toEqual(["phone"]);
});

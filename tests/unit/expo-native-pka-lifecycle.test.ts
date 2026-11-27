import { expect, test } from "bun:test";
import { submitPkaLifecycle } from "../../apps/mobile-native/features/academic/administration/pka-lifecycle-client";
import { handleNativePkaLifecycle } from "../../lib/native/academic/administration/pka-lifecycle-handler";
import { pkaScheduleCreationNeedsDelivery, type PkaLifecycleCommand, type PkaLifecycleReceipt } from "../../packages/academic/pka-lifecycle";

const origin = "https://zyx.example";
const requestId = "eeb5cf68-64c5-49d0-abae-dcd833eaf72e";
const id = "pka-existing";
const viewer = { user: { id: "admin-a" }, session: { id: "session-a" } };
const command = { action: "delete-schedule", id, expectedRevision: "a".repeat(64) } as const;
const make = (body: unknown, headers = {}) => new Request(`${origin}/api/native/academic-administration/pka-lifecycle`, {
  method: "POST", body: JSON.stringify(body), headers: {
    Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId, ...headers,
  },
});

function scenario(result: PkaLifecycleReceipt = { status: "saved", id }) {
  const writes: unknown[] = [];
  const services = {
    session: async () => viewer,
    hasAdmin: async (id: string) => id === viewer.user.id,
    write: async (command: PkaLifecycleCommand, identity: string, actor: typeof viewer) => {
      writes.push({ command, identity, actor });
      return result;
    },
  };
  return { writes, services };
}

test("PKA lifecycle requires current Admin and origin before dispatch", async () => {
  const { writes, services } = scenario();
  expect((await handleNativePkaLifecycle(make(command, { Origin: "https://other.example" }), origin, services)).status).toBe(403);
  expect((await handleNativePkaLifecycle(make(command), origin, { ...services, session: async () => null })).status).toBe(401);
  expect((await handleNativePkaLifecycle(make(command), origin, { ...services, hasAdmin: async () => false })).status).toBe(403);
  expect((await handleNativePkaLifecycle(make(command, { "Idempotency-Key": "invalid" }), origin, services)).status).toBe(400);
  expect(writes).toHaveLength(0);
});

test("deletion and announcement state are revision-bound and return the exact request receipt", async () => {
  const { writes, services } = scenario();
  expect((await handleNativePkaLifecycle(make({ action: "delete-schedule", id }), origin, services)).status).toBe(422);
  const adopt = { action: "announcement-state", id, expectedRevision: command.expectedRevision, field: "pinned", value: true };
  const response = await handleNativePkaLifecycle(make(adopt), origin, services);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "saved", id, requestId });
  expect(writes).toEqual([{ command: adopt, identity: requestId, actor: viewer }]);
});

test("a malformed schedule date and credential-bearing URL are rejected before writing", async () => {
  const { writes, services } = scenario();
  const schedule = { action: "create-schedule", title: "Review", sessionAt: "2025-03-01T15:00:00+07:00", meetLink: null };
  expect((await handleNativePkaLifecycle(make({ ...schedule, sessionAt: "2025-02-30T15:00:00+07:00" }), origin, services)).status).toBe(422);
  expect((await handleNativePkaLifecycle(make({ ...schedule, meetLink: "https://account:secret@example.org" }), origin, services)).status).toBe(422);
  expect((await handleNativePkaLifecycle(make(schedule), origin, services)).status).toBe(200);
  expect(writes).toHaveLength(1);
});

test("silent schedule creation stays limited to past sessions", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  expect(pkaScheduleCreationNeedsDelivery(new Date(now - 1), now)).toBe(false);
  expect(pkaScheduleCreationNeedsDelivery(new Date(now + 1), now)).toBe(true);
});

test("a damaged or mismatched receipt never reports a successful write", async () => {
  const signal = new AbortController().signal;
  const attempt = { command, requestId };
  const transport = {
    accountId: viewer.user.id, origin, locale: "id", get: async () => new Response(),
    command: async (path: string, input: unknown) => {
      expect(path).toBe("/api/native/academic-administration/pka-lifecycle");
      expect(input).toEqual({ method: "POST", body: command, requestId });
      return Response.json({ status: "saved", id: "other", requestId });
    },
  };
  expect(await submitPkaLifecycle(transport, attempt, signal)).toEqual({ status: "uncertain" });
  expect(await submitPkaLifecycle({
    ...transport, command: async () => Response.json({ status: "saved", id, requestId }),
  }, attempt, signal)).toEqual({ status: "saved" });
});

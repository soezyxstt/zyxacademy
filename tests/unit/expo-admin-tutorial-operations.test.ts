import { expect, test } from "bun:test";
import { submitTutorialOperation, pendingTutorialOperation } from "../../apps/mobile-native/features/academic/administration/tutorial-operations-client";
import type { AcademicTransport } from "../../apps/mobile-native/features/academic/client";
import { handleAdminCommand } from "../../lib/native/academic/administration/admin-command-handler";
import { tutorialOperation, tutorialRejectionStatus } from "../../lib/native/academic/administration/tutorial-operations-handler";
import { isAdminTutorialSchedule, type AdminTutorialCommand } from "../../packages/academic/admin-tutorial-operations";

const origin = "https://calendar.example.test";
const requestId = crypto.randomUUID();
const revision = "a".repeat(64);
const version = { id: "record", expectedRevision: revision };
const create = { action: "create-availability", tutorId: "tutor", sessionDate: "2026-11-30", startTime: "09:00",
  endTime: "10:30", mode: "offline", location: "Ruang 1", reason: "Pindah ruangan" } as const;
const commands: AdminTutorialCommand[] = [create,
  { action: "delete-availability", ...version, reason: "Slot ganda" },
  { action: "assign", ...version, groupId: "group", courseId: "course", topic: null, reason: "Kelas tambahan" },
  { action: "move", ...version, targetSlotId: "other", expectedTargetRevision: revision, reason: "Bentrok waktu" },
  { action: "cancel", ...version, reason: "Tutor berhalangan" },
  { action: "qualifications", ...version, courseIds: ["course"] },
];

test("all six schedule actions accept precise DTOs and reject missing reasons, spoofed actors and bad revisions", () => {
  for (const command of commands) expect(tutorialOperation.safeParse(command).success).toBe(true);
  for (const input of [{ ...create, reason: " " }, { ...create, location: null }, { ...create, sessionDate: "2026-02-30" },
    { ...commands[4], expectedRevision: "stale" }, { ...commands[2], actorId: "another" },
    { ...commands[3], expectedTargetRevision: undefined }, { ...commands[5], courseIds: ["same", "same"] }]) {
    expect(tutorialOperation.safeParse(input).success).toBe(false);
  }
  expect(isAdminTutorialSchedule({ weekStart: create.sessionDate, tutors: [], courses: [], groups: [], slots: [] })).toBe(true);
  expect(isAdminTutorialSchedule({ weekStart: create.sessionDate, tutors: [{ id: "other", label: "Tutor", revision: "broken", courseIds: [] }],
    courses: [], groups: [], slots: [] })).toBe(false);
});

test("Admin route binding preserves authoritative domain errors and never invokes a foreign or Tutor session", async () => {
  let writes = 0;
  const post = (actor: string | null, requestOrigin = origin) => handleAdminCommand(new Request(origin, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/json", "idempotency-key": requestId },
    body: JSON.stringify(commands[2]),
  }), origin, { session: async () => actor ? { user: { id: actor }, session: { id: "session" } } : null, hasAdmin: async id => id === "admin" },
  tutorialOperation, async (_command, key, viewer) => {
    expect(key).toBe(requestId);
    expect(viewer.user.id).toBe("admin");
    writes++;
    throw new Error("TOTAL_QUOTA_EXCEEDED");
  }, tutorialRejectionStatus);
  expect((await post("admin", "https://foreign.test")).status).toBe(403);
  expect((await post(null)).status).toBe(401);
  expect((await post("tutor")).status).toBe(403);
  expect(writes).toBe(0);
  const denied = await post("admin");
  expect(denied.status).toBe(409);
  expect(await denied.json()).toEqual({ error: "TOTAL_QUOTA_EXCEEDED" });
});

test("native retries preserve the exact command until matching response and id", async () => {
  const signals = new AbortController();
  const calls: unknown[] = [];
  const transport: AcademicTransport = {
    accountId: "admin", origin, locale: "id",
    async get() { throw new Error("Unexpected read"); },
    async command(path, body) {
      expect(path).toBe("/api/native/academic-administration/tutorial-operations");
      calls.push(body);
      return Response.json({ status: "saved", id: calls.length === 1 ? "unrelated" : version.id, requestId });
    },
  };
  const attempt = { command: commands[3], requestId };
  expect(await submitTutorialOperation(transport, attempt, signals.signal)).toEqual({ status: "uncertain" });
  expect(pendingTutorialOperation(transport)).toEqual(attempt);
  expect(await submitTutorialOperation(transport, { ...attempt, command: commands[4] }, signals.signal)).toEqual({ status: "uncertain" });
  expect(await submitTutorialOperation(transport, attempt, signals.signal)).toEqual({ status: "saved", id: version.id });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(pendingTutorialOperation(transport)).toBeUndefined();
});

import { expect, test } from "bun:test";
import { handleAdminCommand } from "../../lib/native/academic/administration/admin-command-handler";
import { academicEventCommand } from "../../lib/native/academic/administration/schedule-events-handler";
import { isAcademicEventView } from "../../packages/academic/admin-schedule-events";

const origin = "https://calendar.example.test";
const fields = { type: "official_exam", title: "Ujian", startDate: "2026-11-30T09:00:00+07:00",
  endDate: null, location: null, description: null, courseId: null };
const key = crypto.randomUUID();

test("accepts explicit instants, rejects invalid ranges and unconfirmed deletion", () => {
  const create = { action: "create", fields };
  expect(academicEventCommand.safeParse(create).success).toBe(true);
  for (const changes of [{ title: " " }, { endDate: fields.startDate }, { startDate: "2026-11-30T09:00" }, { courseId: "../a" }]) {
    expect(academicEventCommand.safeParse({ ...create, fields: { ...fields, ...changes } }).success).toBe(false);
  }
  expect(academicEventCommand.safeParse({ action: "delete", id: "s", expectedRevision: "a".repeat(64) }).success).toBe(false);
  expect(isAcademicEventView({ ...fields, revision: "b".repeat(64) })).toBe(true);
  expect(isAcademicEventView({ ...fields, revision: "b".repeat(64), endDate: "broken" })).toBe(false);
});

test("only dispatches an authorized, same-origin command and returns its matching receipt", async () => {
  const seen: string[] = [];
  const submit = (actor: string | null, requestOrigin = origin, input = key) => handleAdminCommand(new Request(origin, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/json", "idempotency-key": input },
    body: JSON.stringify({ action: "create", fields }),
  }), origin, {
    session: async () => actor ? { user: { id: actor }, session: { id: "s" } } : null, hasAdmin: async id => id === "admin",
  }, academicEventCommand, async (_command, uuid) => { seen.push(uuid); return { id: "event" }; });
  expect((await submit(null)).status).toBe(401);
  expect((await submit("tutor")).status).toBe(403);
  expect((await submit("admin", "https://wrong.example.test")).status).toBe(403);
  expect((await submit("admin", origin, "invalid" as typeof key)).status).toBe(400);
  expect(await (await submit("admin")).json()).toEqual({ status: "saved", requestId: key, id: "event" });
  expect(seen).toEqual([key]);
});

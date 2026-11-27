import { expect, test } from "bun:test";
import { createTutorTicketEditor } from "../../../../apps/mobile-native/features/academic/tutor/ticket-client";
import type { AcademicTransport } from "../../../../apps/mobile-native/features/academic/client";
import { handleTutorTicket } from "../../../../lib/native/academic/handle-tutor-ticket";

const signal = new AbortController().signal;
const origin = "https://example.test";
const draft = { requestId: "original-request-0001", command: { action: "reply" as const, message: "Balasan" } };
test("uncertain reply keeps its identity until the exact ticket receipt arrives", async () => {
  let count = 0;
  const send: AcademicTransport["command"] = async (path, init) => {
    expect(path).toBe("/api/native/academic/tutor-support/schedule/tickets/ticket-1");
    expect(init.requestId).toBe(draft.requestId);
    count++;
    return Response.json({ requestId: init.requestId, ticketId: count === 1 ? "wrong" : "ticket-1" });
  };
  const editor = createTutorTicketEditor({ origin, accountId: "tutor", locale: "id", get: async () => Response.error(), command: send })!;
  expect(await editor.submit("ticket-1", draft, signal)).toBe("unknown");
  expect(await editor.submit("ticket-1", { ...draft, requestId: "replacement" }, signal)).toBe("unknown");
  expect(await editor.submit("ticket-1", editor.pending("ticket-1")!, signal)).toBe("saved");
  expect(count).toBe(2);
  expect(editor.pending("ticket-1")).toBeUndefined();
});
test("rejects cross-origin, unauthorized, empty and client-supplied actor requests", async () => {
  let written = 0;
  const run = (body: object, requestOrigin = origin, authorized = true) => handleTutorTicket(
    new Request(origin, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json",
      "idempotency-key": draft.requestId }, body: JSON.stringify(body) }),
    ["schedule", "tickets", "ticket-1"], origin, { session: async () => ({ user: { id: "tutor" }, session: { id: "session" } }),
      hasTutor: async () => authorized, save: async (actor, ticketId) => { written++; return { requestId: actor.requestId, ticketId }; } });
  expect((await run(draft.command, "https://other.test")).status).toBe(403);
  expect((await run(draft.command, origin, false)).status).toBe(403);
  expect((await run({ ...draft.command, message: " " })).status).toBe(422);
  expect((await run({ ...draft.command, actorId: "someone" })).status).toBe(422);
  expect(written).toBe(0);
  expect((await run({ action: "decide", decision: "approved", notes: "Disetujui" })).status).toBe(200);
});

test("calendar commands need confirmation or an identified source and destination; retries require the original outcome", async () => {
  const { handleTutorCalendar } = await import("../../../../lib/native/academic/handle-tutor-ticket");
  const { createCalendarEditor } = await import("../../../../apps/mobile-native/features/academic/tutor/calendar-client");
  const request = (body: object) => new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json",
    "idempotency-key": draft.requestId }, body: JSON.stringify(body) });
  const services = { session: async () => ({ user: { id: "tutor" }, session: { id: "session" } }), hasTutor: async () => true,
    save: async () => ({ requestId: draft.requestId, outcome: { action: "copy" as const, created: 2, skipped: 1 } }) };
  expect((await handleTutorCalendar(request({ action: "delete", slotId: "slot", expectedRevision: "a".repeat(64) }), origin, services)).status).toBe(422);
  expect((await handleTutorCalendar(request({ action: "copy", week: "2026-02-30" }), origin, services)).status).toBe(422);
  expect((await handleTutorCalendar(request({ action: "move", bookingId: "booking", targetSlotId: "slot", date: "2026-11-30", reason: "" }), origin, services)).status).toBe(422);
  let calls = 0;
  const command = { action: "copy", week: "2026-11-30" } as const;
  const editor = createCalendarEditor({ accountId: "tutor", locale: "id", origin, get: async () => Response.error(),
    command: async () => ++calls === 1 ? new Response(null, { status: 503 }) : handleTutorCalendar(request(command), origin, services) })!;
  expect(await editor.save({ requestId: draft.requestId, command }, signal)).toBe("unknown");
  expect(await editor.save({ requestId: "other-id", command }, signal)).toBe("unknown");
  expect(await editor.save(editor.pending()!, signal)).toEqual({ action: "copy", created: 2, skipped: 1 });
  expect(editor.pending()).toBeUndefined();
});

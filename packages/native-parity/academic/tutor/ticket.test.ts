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

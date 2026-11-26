import { expect, test } from "bun:test";
import { createTutorSlotEditor } from "../../../../apps/mobile-native/features/academic/tutor/slot-client";
import type { TutorSlotFields } from "../../../academic/tutor-slot";

const scope = { origin: "https://academic.example.test", accountId: "academic-tutor", locale: "id", async get() { return Response.json({}); } };
const fields: TutorSlotFields = { date: "2026-11-28", mode: "online", location: "", start: "09:00", notes: "Belajar sel" };
const signal = new AbortController().signal;

test("slot write retries the exact create or edit command until a matching receipt returns", async () => {
  for (const target of [undefined, { slotId: "slot-1", expectedRevision: "1".repeat(64) }]) {
    let attempts = 0;
    const transport = {
      ...scope,
      async command(path: string, command: { requestId: string; method: string; body: unknown }) {
        expect(path).toBe("/api/native/academic/tutor-support/schedule/slots" + (target ? "/slot-1" : ""));
        expect(command.method).toBe(target ? "PATCH" : "POST");
        expect(command.requestId).toBe("slot-request-001");
        expect(command.body).toEqual({ ...fields, ...(target ? { expectedRevision: target.expectedRevision } : {}) });
        attempts += 1;
        if (attempts === 1) throw new Error("LOST_RESPONSE");
        if (attempts === 2) return Response.json({ slotId: "slot-1", requestId: "incorrect-response", date: fields.date });
        return Response.json({ slotId: "slot-1", requestId: command.requestId, date: fields.date });
      },
    };
    const editor = createTutorSlotEditor(transport)!;
    expect(await editor.save(target, fields, "slot-request-001", signal)).toEqual({ status: "unknown" });
    expect(editor.pending()[0].fields).toEqual(fields);
    expect(createTutorSlotEditor(transport)!.pending()).toEqual([]);
    expect(await editor.save(target, { ...fields, notes: "Lain" }, "slot-request-002", signal)).toEqual({ status: "unknown" });
    expect(attempts).toBe(1);
    expect(await editor.save(target, fields, "slot-request-002", signal)).toEqual({ status: "unknown" });
    expect(await editor.save(target, fields, "slot-request-002", signal)).toEqual({
      status: "saved", receipt: { requestId: "slot-request-001", slotId: "slot-1", date: fields.date },
    });
    expect(editor.pending()).toEqual([]);
  }
});

test("slot edit releases pending requests after definitive failures", async () => {
  for (const [status, error, expected] of [
    [400, "INVALID_SLOT", "invalid"],
    [401, "UNAUTHENTICATED", "denied"],
    [403, "FORBIDDEN", "denied"],
    [404, "NOT_FOUND", "missing"],
    [409, "CANNOT_EDIT_BOOKED_SLOT", "booked"],
    [409, "TUTOR_SLOT_OVERLAP", "overlap"],
    [409, "SLOT_CHANGED", "conflict"],
  ] as const) {
    const editor = createTutorSlotEditor({ ...scope, async command() { return Response.json({ error }, { status }); } })!;
    const result = await editor.save({ slotId: "slot-1", expectedRevision: "1".repeat(64) }, fields, "slot-request-001", signal);
    expect(result).toEqual({ status: expected });
    expect(editor.pending()).toEqual([]);
  }
});

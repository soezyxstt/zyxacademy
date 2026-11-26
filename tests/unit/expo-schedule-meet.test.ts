import { expect, test } from "bun:test";
import type { AcademicResponse, AcademicTransport } from "../../apps/mobile-native/features/academic/client";
import { provisionScheduledMeets } from "../../apps/mobile-native/features/academic/administration/schedule-meet-client";

const response = (status: number, body: unknown): AcademicResponse => ({ ok: status === 200, status, json: async () => body });
const base = { accountId: "user", origin: "https://example.test", locale: "id" };

test("iterates server pages and counts only a matching confirmation as ready", async () => {
  const requests: string[] = [];
  const transport: AcademicTransport = { ...base,
    get: async path => response(200, path.includes("?after=b") ? { ids: ["c", "d", "e"] } : { ids: ["a", "b"], next: "b" }),
    command: async (_path, { body, requestId }) => {
      const { bookingId } = body as { bookingId: string };
      requests.push(bookingId);
      if (bookingId === "a") return response(200, { status: "saved", id: bookingId, requestId });
      if (bookingId === "b") return response(409, { error: "BOOKING_CHANGED" });
      if (bookingId === "c") return response(422, { error: "MEET_REJECTED" });
      if (bookingId === "d") return response(409, { error: "MEET_UNCERTAIN" });
      return response(200, { status: "saved", id: "another", requestId });
    },
  };
  expect(await provisionScheduledMeets(transport, new AbortController().signal, () => "key", () => {})).toEqual({ ready: 1, changed: 1, rejected: 1, uncertain: 2 });
  expect(requests).toEqual(["a", "b", "c", "d", "e"]);
});
test("stops after loss of authority, malformed pagination or a dismissed screen", async () => {
  const controller = new AbortController();
  let writes = 0;
  const transport: AcademicTransport = { ...base, get: async () => response(200, { ids: ["a", "b"] }),
    command: async () => { writes++; return response(403, {}); } };
  await expect(provisionScheduledMeets(transport, controller.signal, () => "key", () => {})).rejects.toThrow("FORBIDDEN");
  transport.get = async () => response(200, { ids: ["a"], next: "b" });
  await expect(provisionScheduledMeets(transport, controller.signal, () => "key", () => {})).rejects.toThrow("READ_FAILED");
  controller.abort();
  await expect(provisionScheduledMeets(transport, controller.signal, () => "key", () => {})).rejects.toThrow("ABORTED");
  expect(writes).toBe(1);
});

import { describe, expect, test } from "bun:test";
import { addCalendarDays, assertCalendarDate } from "@/lib/date-utils";
import { communityKey, demoCommunitySchema, demoWeek, emptyCommunity, parseCommunity, putDemoBooking } from "./community-state";

const scope = { courseId: "math", revision: "r1" };
describe("browser demo community", () => {
  test("seeds every arbitrary week across year boundaries and preserves moved overrides", () => {
    for (let week = -125; week <= 125; week++) {
      const anchor = addCalendarDays(assertCalendarDate("2028-02-29"), week * 7);
      const data = demoWeek(scope, anchor, emptyCommunity());
      expect(data.slots).toHaveLength(3);
      expect(data.bookings).toHaveLength(2);
      const moved = { ...data.bookings[0], sessionDate: addCalendarDays(assertCalendarDate(data.bookings[0].sessionDate), 7) };
      const state = { ...emptyCommunity(), bookings: [moved] };
      expect(demoWeek(scope, anchor, state).bookings).toHaveLength(1);
      expect(demoWeek(scope, moved.sessionDate, state).bookings.some(row => row.id === moved.id)).toBe(true);
    }
  });
  test("rejects unsafe metadata without silently resetting saved data", () => {
    const booking = demoWeek(scope, "2026-11-16", emptyCommunity()).bookings[0];
    expect(demoCommunitySchema.safeParse({ ...emptyCommunity(), bookings: [{ ...booking, sessionDate: "2026-02-30" }] }).success).toBe(false);
    expect(demoCommunitySchema.safeParse({ ...emptyCommunity(), bookings: [{ ...booking, endTime: "01:00" }] }).success).toBe(false);
    expect(demoCommunitySchema.safeParse({ ...emptyCommunity(), group: { name: "Group", members: ["Alya", "alya"] } }).success).toBe(false);
    expect(demoCommunitySchema.safeParse({ ...emptyCommunity(), bookings: [{ ...booking, resources: [{ id: "x", phase: "pre", kind: "link", label: "Bad", url: "javascript:alert(1)", fileName: null, mimeType: null, sizeBytes: null, createdById: "demo" }] }] }).success).toBe(false);
    expect(() => parseCommunity("broken")).toThrow();
    expect(communityKey(scope)).not.toBe(communityKey({ ...scope, revision: "r2" }));
  });
  test("moving releases the original slot and rejects occupied or partially overlapping destinations", () => {
    const initial = emptyCommunity();
    const original = demoWeek(scope, "2026-11-16", initial).bookings[0];
    expect(() => putDemoBooking(scope, initial, { ...original, sessionDate: "2026-11-23" })).toThrow("SLOT_TAKEN");
    const moved = putDemoBooking(scope, initial, { ...original, sessionDate: "2026-11-24" });
    expect(moved.bookings[0].slotId).not.toBe(original.slotId);
    expect(demoWeek(scope, original.sessionDate, moved).slots[0].booking).toBeNull();
    const replacement = { ...original, id: "replacement" };
    const rebooked = putDemoBooking(scope, moved, replacement);
    expect(rebooked.bookings).toHaveLength(2);
    expect(() => putDemoBooking(scope, rebooked, { ...replacement, id: "overlap", startTime: "11:00", endTime: "12:00" })).toThrow("SLOT_TAKEN");
    const saturday = { ...original, sessionDate: "2026-11-21", startTime: "11:00", endTime: "12:00" };
    const partial = putDemoBooking(scope, initial, saturday);
    expect(demoWeek(scope, saturday.sessionDate, partial).slots[2].booking?.id).toBe(original.id);
    expect(() => putDemoBooking(scope, partial, { ...replacement, sessionDate: saturday.sessionDate })).toThrow("SLOT_TAKEN");
    const cancelled = putDemoBooking(scope, partial, { ...partial.bookings[0], status: "cancelled" });
    expect(demoWeek(scope, saturday.sessionDate, cancelled).slots[2].booking).toBeNull();
    expect(putDemoBooking(scope, cancelled, { ...replacement, sessionDate: saturday.sessionDate }).bookings).toHaveLength(2);
  });
});

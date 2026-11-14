import { describe, expect, test } from "bun:test";
import { addCalendarDays, getCalendarDayIndex } from "@/lib/date-utils";
import { demoStateSchema, demoStorageKey, demoWeekSessions, initialDemoState } from "@/lib/demo-state";

describe("public demo browser state", () => {
  test("generates unique Monday, Wednesday and Saturday sessions in past and future weeks", () => {
    const ids = new Set<string>();
    for (let week = -125; week <= 125; week++) {
      const sessions = demoWeekSessions(addCalendarDays("2028-02-29", week * 7), "Fungsi dan Limit", {});
      expect(sessions).toHaveLength(3);
      expect(sessions.map(session => getCalendarDayIndex(session.date))).toEqual([1, 3, 6]);
      for (const session of sessions) { expect(ids.has(session.id)).toBe(false); ids.add(session.id); }
    }
  });
  test("keeps cancellation and moves a seed between weeks without duplicating it", () => {
    const [seed] = demoWeekSessions("2030-12-31", "Limit", {});
    const moved = { ...seed, date: addCalendarDays(seed.date, 7), status: "cancelled" as const };
    const overrides = { [seed.id]: moved };
    expect(demoWeekSessions(seed.date, "Limit", overrides)).toHaveLength(2);
    const next = demoWeekSessions(moved.date, "Limit", overrides);
    expect(next).toHaveLength(4);
    expect(next.find(session => session.id === seed.id)?.status).toBe("cancelled");
  });
  test("rejects invalid dates, executable links, malformed state and oversized groups", () => {
    const [session] = demoWeekSessions("2028-02-29", "Limit", {});
    const state = initialDemoState();
    expect(demoStateSchema.safeParse({ ...state, sessions: { x: { ...session, date: "2028-02-31" } } }).success).toBe(false);
    expect(demoStateSchema.safeParse({ ...state, sessions: { x: { ...session, resources: [{ id: "link", kind: "link", phase: "pre", name: "X", url: "javascript:alert(1)" }] } } }).success).toBe(false);
    expect(demoStateSchema.safeParse({ ...state, members: Array(7).fill("A") }).success).toBe(false);
    expect(demoStateSchema.shape.members.safeParse(["Kamu", "Alya", "Alya"]).success).toBe(false);
    expect(demoStateSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(demoStorageKey("/courses/a")).not.toBe(demoStorageKey("/courses/b"));
  });
});

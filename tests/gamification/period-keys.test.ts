import { expect, test } from "bun:test";
import { gamificationPeriodKey } from "../../lib/date-utils";
test("period keys use Jakarta Monday and calendar month", () => {
  expect(gamificationPeriodKey("week", new Date("2026-11-01T17:00:00Z"))).toBe("week:2026-11-02");
  expect(gamificationPeriodKey("month", new Date("2026-10-31T17:00:00Z"))).toBe("month:2026-11");
  expect(gamificationPeriodKey("all")).toBe("all");
});

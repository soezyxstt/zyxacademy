import { afterEach, expect, mock, setSystemTime, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { localWeekdayIndex } from "@/lib/date-utils";

mock.module("lucide-react", () => ({ Flame: () => null, Check: () => null }));
mock.module("@/lib/i18n/client", () => ({ useTranslations: () => (key: string) => key }));
const { StreakCalendarStrip } = await import("@/components/dashboard/streak-calendar-strip");
afterEach(() => setSystemTime());

test("streak calendar has stable initial markup across different local days", () => {
  const render = () => renderToStaticMarkup(<StreakCalendarStrip current={2} weeklyActivity={[true, false, true]} />);
  setSystemTime(new Date("2026-11-05T12:00:00Z"));
  const first = render();
  setSystemTime(new Date("2026-11-06T12:00:00Z"));
  expect(render()).toBe(first);
  expect(first).not.toContain("ring-1.5");
  expect(localWeekdayIndex(new Date(2026, 10, 2, 12))).toBe(0);
  expect(localWeekdayIndex(new Date(2026, 10, 8, 12))).toBe(6);
});

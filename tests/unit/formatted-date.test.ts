import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolveDateDisplay } from "../../lib/date-utils/display";
import { formattedDateCases } from "../../packages/ui-parity/formatted-date-cases";
import { galleryCases } from "../../packages/ui-parity/gallery";

test("uses the app language unless the caller supplies an explicit locale", () => {
  const date = new Date("2025-01-11T17:05:00.000Z");
  expect(resolveDateDisplay({ date }, "id")).toEqual({
    locale: "id-ID",
    text: date.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }),
  });
  expect(resolveDateDisplay({ date }, "en")).toEqual({
    locale: "en-US",
    text: date.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }),
  });
  expect(resolveDateDisplay({ date, locale: "en-GB" }, "id")?.locale).toBe("en-GB");
});

test("web initial rendering forces UTC and mounted rendering honors an explicit timezone", () => {
  const date = "2025-01-11T17:05:00.000Z";
  const options = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" } as const;
  expect(resolveDateDisplay({ date, options }, "en", true)?.text).toBe("Jan 11, 2025, 5:05 PM");
  expect(resolveDateDisplay({ date, options }, "en")?.text).toBe("Jan 12, 2025, 12:05 AM");
  expect(options.timeZone).toBe("Asia/Jakarta");
});

test("normalizes both timestamp units and omits invalid input", () => {
  const date = 1_736_665_200;
  const options = { dateStyle: "medium", timeZone: "UTC" } as const;
  expect(resolveDateDisplay({ date, options }, "id")).toEqual(resolveDateDisplay({ date: date * 1000, options }, "id"));
  for (const invalid of ["2025-unknown", Number.NaN, new Date(Number.NaN)]) {
    expect(resolveDateDisplay({ date: invalid }, "id")).toBeNull();
  }
});

test("the gallery registers all three source-backed cases and their expected content", () => {
  expect(galleryCases.filter(item => item.family === "formatted-date").map(item => item.id))
    .toEqual(formattedDateCases.map(item => item.id));
  for (const item of formattedDateCases) {
    expect(existsSync(item.reference)).toBe(true);
    expect(resolveDateDisplay(item, "id")?.text ?? null).toBe(item.expected);
  }
});

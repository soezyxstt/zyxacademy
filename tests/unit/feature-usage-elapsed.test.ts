import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("rolling days remain exactly 24 hours across a daylight-saving change", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const dateFns = require(process.env.UI_TEST_DATE_FNS ?? "date-fns");
  const source = readFileSync("lib/date-utils.ts", "utf8");
  const module = { exports: {} as any };
  runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, { module, exports: module.exports, require: () => dateFns });
  const now = new Date("2026-03-10T12:00:00.123Z");
  expect(module.exports.elapsedDaysAgo(7, now).toISOString()).toBe("2026-03-03T12:00:00.123Z");
});

import { afterAll, expect, mock, test } from "bun:test";

mock.module("@/lib/analytics-sync", () => ({ syncPopularPages: async () => ({ success: true, count: 0 }) }));
const { GET } = await import("../../app/api/cron/analytics/route");
const original = { CRON_SECRET: process.env.CRON_SECRET, COMPUTE_SERVICE_SECRET: process.env.COMPUTE_SERVICE_SECRET, QUEUE_PROVIDER: process.env.QUEUE_PROVIDER };
afterAll(() => {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("analytics requires configured auth and limits compute credentials to the Tasks cutover", async () => {
  delete process.env.CRON_SECRET;
  process.env.COMPUTE_SERVICE_SECRET = "synthetic-compute";
  process.env.QUEUE_PROVIDER = "inngest";
  const request = (secret: string) => new Request("https://www.zyxacademy.com/api/cron/analytics", { headers: { Authorization: `Bearer ${secret}` } });
  expect((await GET(request("undefined"))).status).toBe(401);
  expect((await GET(request("synthetic-compute"))).status).toBe(401);
  process.env.QUEUE_PROVIDER = "cloud-tasks";
  expect((await GET(request("wrong"))).status).toBe(401);
  expect((await GET(request("synthetic-compute"))).status).toBe(200);
  process.env.CRON_SECRET = "synthetic-legacy";
  expect((await GET(request("synthetic-legacy"))).status).toBe(200);
});

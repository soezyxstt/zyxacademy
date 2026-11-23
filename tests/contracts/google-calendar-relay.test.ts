import { afterAll, expect, mock, test } from "bun:test";
const saved = { provider: process.env.QUEUE_PROVIDER, secret: process.env.COMPUTE_SERVICE_SECRET };
process.env.QUEUE_PROVIDER = "cloud-tasks";
process.env.COMPUTE_SERVICE_SECRET = "fixture-relay-secret";
const relayed: string[] = [];
mock.module("@/lib/queue/cloud-tasks", () => ({ enqueueTask: async (event: { name: string }) => { relayed.push(event.name); return "fixture-task"; } }));
const { POST } = await import("@/app/api/internal/queue/route");
afterAll(() => {
  for (const [key, value] of [["QUEUE_PROVIDER", saved.provider], ["COMPUTE_SERVICE_SECRET", saved.secret]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});
test("authenticated compute can relay both the daily cron and manual calendar event", async () => {
  for (const name of ["google-calendar-sync-cron", "google-calendar/sync.requested", "ai-model-catalog-cron"]) {
    const response = await POST(new Request("https://fixture.test/api/internal/queue", { method: "POST", headers: { Authorization: "Bearer fixture-relay-secret", "Content-Type": "application/json" }, body: JSON.stringify({ name, id: `fixture-${name}`, data: {} }) }));
    expect(response.status).toBe(200);
  }
  expect(relayed).toEqual(["google-calendar-sync-cron", "google-calendar/sync.requested", "ai-model-catalog-cron"]);
  expect((await POST(new Request("https://fixture.test/api/internal/queue", { method: "POST" }))).status).toBe(401);
});

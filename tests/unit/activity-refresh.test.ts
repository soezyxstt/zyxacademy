import { expect, test } from "bun:test";
import { createActivityRefresh } from "../../lib/student/activity-refresh";

test("coalesces passive requests and queues a mutation arriving during fetch", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let clock = 0;
  const activity = createActivityRefresh(async () => {
    calls++;
    if (calls === 1) await gate;
  }, () => clock);
  const first = activity.refresh(true);
  await activity.refresh();
  await activity.refresh(true);
  await activity.refresh(true);
  expect(calls).toBe(1);
  release();
  await first;
  expect(calls).toBe(2);
  await activity.refresh();
  expect(calls).toBe(2);
  clock = 60_000;
  await activity.refresh();
  expect(calls).toBe(3);
  activity.dispose();
});

test("failed fetch retries and disposed accounts cannot process queued refreshes", async () => {
  let calls = 0;
  const failed = createActivityRefresh(async () => { calls++; throw new Error("offline"); });
  await failed.refresh();
  await failed.refresh();
  expect(calls).toBe(2);
  failed.dispose();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let signal!: AbortSignal;
  const oldAccount = createActivityRefresh(async (value) => { signal = value; await gate; });
  const request = oldAccount.refresh(true);
  await oldAccount.refresh(true);
  oldAccount.dispose();
  expect(signal.aborted).toBe(true);
  release();
  await request;
  await oldAccount.refresh(true);
  let freshCalls = 0;
  const newAccount = createActivityRefresh(async () => { freshCalls++; });
  await newAccount.refresh();
  expect(freshCalls).toBe(1);
  newAccount.dispose();
});

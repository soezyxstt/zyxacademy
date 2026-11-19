import { AsyncLocalStorage } from "node:async_hooks";
import { enqueueTask } from "./cloud-tasks";

const pending = new AsyncLocalStorage<Map<string, number>>();

// Producers record wakeups in the transaction that inserted the outbox row.
// The outer transaction waits for COMMIT before dispatching a coalesced task.
export function wakeOutbox(name: string, due = 0) {
  if (process.env.QUEUE_PROVIDER !== "cloud-tasks") return;
  const work = pending.getStore();
  if (!work) throw new Error("QUEUE_WAKEUP_OUTSIDE_TRANSACTION");
  work.set(name, Math.min(work.get(name) ?? Infinity, due));
}

export async function withQueueWakeups<T>(transaction: () => Promise<T>) {
  if (process.env.QUEUE_PROVIDER !== "cloud-tasks") return transaction();
  const work = new Map<string, number>();
  const result = await pending.run(work, transaction);
  await Promise.all(Array.from(work, async ([name, due]) => {
    const now = Date.now();
    const end = (Math.floor(Math.max(due, now) / 10_000) + 1) * 10_000;
    try {
      await enqueueTask({ name, id: `outbox:${end}`, delaySeconds: (end - now) / 1000, data: {} });
    } catch {
      console.warn(JSON.stringify({ event: "queue.outbox_wakeup_failed", name }));
    }
  }));
  return result;
}

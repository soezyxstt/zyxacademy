import { expect, test } from "bun:test";
import { scheduleAdminListRequest } from "../../lib/admin/list-request";

test("a failed folder request can retry its target without an older response taking over", async () => {
  let resolveOld!: (value: string) => void;
  const old = new Promise<string>((resolve) => { resolveOld = resolve; });
  const events: string[] = [];
  const handlers = {
    onSuccess: (value: string) => events.push(value),
    onError: () => events.push("failed"),
    onSettled: () => events.push("settled"),
  };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  const cancelOld = scheduleAdminListRequest(() => old, handlers, 0);
  await tick();
  cancelOld();
  scheduleAdminListRequest(async () => { throw new Error("offline"); }, handlers, 0);
  await tick();
  scheduleAdminListRequest(async () => "target folder", handlers, 0);
  await tick();
  resolveOld("previous folder");
  await Promise.resolve();

  expect(events).toEqual(["failed", "settled", "target folder", "settled"]);
});

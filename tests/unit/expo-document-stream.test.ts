import { expect, test } from "bun:test";
import { openAndroidDocument } from "../../apps/mobile-native/device/document-stream";

test("a document provider with no file length returns each sequential chunk exactly once", async () => {
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array(0)];
  const closed: string[] = [];
  const reader = openAndroidDocument({
    begin: () => "handle", read: async () => chunks.shift()!, close: id => { closed.push(id); },
  }, "content://example/document/1").getReader();
  expect(await reader.read()).toMatchObject({ value: new Uint8Array([1, 2]) });
  expect(await reader.read()).toMatchObject({ value: new Uint8Array([3]) });
  expect((await reader.read()).done).toBe(true);
  expect(closed).toEqual(["handle"]);
});

test("cancelling while a cloud provider is still reading closes its handle and discards the late bytes", async () => {
  const pending = Promise.withResolvers<Uint8Array>();
  const started = Promise.withResolvers<void>();
  const closed: string[] = [];
  const reader = openAndroidDocument({
    begin: () => "handle",
    read: () => { started.resolve(); return pending.promise; },
    close: id => { closed.push(id); },
  }, "content://example/document/1").getReader();
  const read = reader.read();
  await started.promise;
  await reader.cancel();
  pending.resolve(new Uint8Array([8]));
  expect((await read).done).toBe(true);
  expect(closed).toEqual(["handle"]);
});

import { expect, test } from "bun:test";
import { createMediaFilePicker } from "../../apps/mobile-native/features/operations/management/media-upload";
import { mediaDestination, mediaSelection, runMediaBatch } from "../../apps/mobile-native/features/operations/management/media-batch";
import type { NativeSessionTransport } from "../../apps/mobile-native/network/transport";
import { createManagementFixture } from "../../packages/native-parity/operations/management-fixtures";
import { ManagementFailure, type ManagementAction } from "../../packages/native-parity/operations/management-contract";

const signal = new AbortController().signal;

test("media picker retains the file and request identity for explicit retry", async () => {
  const scope = { origin: "https://example.test", accountId: "admin", sessionId: "original" };
  const copies: Array<[string, string, string]> = [];
  let current = true;
  let released = 0;
  const session = {
    scope, signal, isCurrent: () => current,
    async request(path, init) {
      const body = init?.body as FormData;
      copies.push([path, String(body.get("key")), new Headers(init?.headers).get("x-native-operations-request-key")!]);
      if (copies.length === 1) return Object.assign(new Response("", { status: 424 }), { dispose() {} });
      return Object.assign(Response.json({ id: "media/test.pdf" }), { dispose() {} });
    },
  } as NativeSessionTransport;
  const target = { draftId: "native-library-draft-id", route: "/admin/media", locale: "id" as const };
  const picker = createMediaFilePicker(session, {
    async pick({ policy }) {
      expect(policy.maxBytes).toBe(200 * 1024 * 1024);
      expect(policy.mimeTypes).toContain("application/pdf");
      return { status: "ready", document: { scope, target, name: "test.pdf", mimeType: "application/pdf",
        uri: "file://fake", size: 8, release() { released++; } } };
    },
    multipart() {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.7"], "test.pdf", { type: "application/pdf" }));
      return form;
    },
  });
  const picked = await picker({ action: "replace", key: "media/test.pdf" }, target, signal);
  if (picked.status !== "ready") throw new Error("Picker failed");
  await expect(picked.file.send(signal)).rejects.toMatchObject({ code: "uncertain" });
  await expect(picked.file.send(signal)).resolves.toEqual({ id: "media/test.pdf" });
  picked.file.release();
  current = false;
  await expect(picked.file.send(signal)).rejects.toMatchObject({ code: "forbidden" });
  expect(released).toBe(1);
  expect(copies).toEqual(Array(2).fill(["/api/native/operations/management/media", "media/test.pdf", target.draftId]));
});

test("bulk selection excludes descendants and retries uncertain items with their original IDs", async () => {
  const items = [{ key: "media/old", folder: true }, { key: "media/old/nested.pdf", folder: false },
    { key: "media/old/sub", folder: true }, { key: "media/file.pdf", folder: false }];
  expect(mediaSelection(items)).toEqual([items[0], items[3]]);
  expect(mediaDestination([items[0]], "media/old/sub")).toBe(false);
  expect(mediaDestination([items[0]], "")).toBe(false);
  expect(mediaDestination([items[0]], "media/new")).toBe(true);
  const calls: string[] = [];
  const client = createManagementFixture();
  const failed = { ...items[3], type: "media.delete" } as const;
  client.mutate = async (action: ManagementAction, id: string) => {
    calls.push(id);
    if (action.type === "media.delete" && action.key === failed.key && calls.length === 2) throw new ManagementFailure("uncertain");
    return {};
  };
  const commands = [{ ...items[0], type: "media.delete" as const }, failed];
  const ids = new Map<string, string>();
  const first = await runMediaBatch(client, ids, commands, () => "id-" + calls.length, signal);
  expect(first).toEqual({ succeeded: 1, failed: [{ item: items[3], uncertain: true }] });
  const second = await runMediaBatch(client, ids, [failed], () => "fresh", signal);
  expect(second).toEqual({ succeeded: 1, failed: [] });
  expect(calls).toEqual(["id-0", "id-1", "id-1"]);
  expect(ids.size).toBe(0);
});

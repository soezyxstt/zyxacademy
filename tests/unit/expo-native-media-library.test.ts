import { expect, test } from "bun:test";
import { baseFolderName, filterMediaNames } from "../../lib/media";
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

test("copies Storage folders and files independently to one library destination", async () => {
  const items = [
    { key: "inputs/lessons", folder: true },
    { key: "inputs/lessons/nested.pdf", folder: false },
    { key: "inputs/handout.pdf", folder: false },
  ];
  const commands = mediaSelection(items).map(item => ({ type: "media.copy" as const, ...item, destination: "media/kelas" }));
  const calls: Array<{ action: ManagementAction; id: string }> = [];
  const client = createManagementFixture();
  client.mutate = async (action, id) => {
    calls.push({ action, id });
    if (calls.length === 2) throw new ManagementFailure("pending");
    return {};
  };

  const ids = new Map<string, string>();
  const first = await runMediaBatch(client, ids, commands, () => `copy-${calls.length}`, signal);
  expect(first).toEqual({ succeeded: 1, failed: [{ item: items[2], uncertain: true }] });
  const retry = commands.filter(command => first.failed.some(({ item }) => command.key === item.key));
  expect(await runMediaBatch(client, ids, retry, () => "unused", signal)).toEqual({ succeeded: 1, failed: [] });
  expect(calls).toEqual([
    { action: commands[0], id: "copy-0" },
    { action: commands[1], id: "copy-1" },
    { action: commands[1], id: "copy-1" },
  ]);
});

test("stops on revoked Admin access and retains unsent selections", async () => {
  const client = createManagementFixture();
  const commands = ["one", "two", "three"].map(key => ({ type: "media.copy" as const, key, folder: false, destination: "" }));
  const seen: string[] = [];
  client.mutate = async action => {
    if (action.type !== "media.copy") throw new Error("Wrong operation");
    seen.push(action.key);
    if (action.key === "two") throw new ManagementFailure("forbidden");
    return {};
  };
  const result = await runMediaBatch(client, new Map(), commands, () => "copy-id", signal);
  expect(seen).toEqual(["one", "two"]);
  expect(result.failed.map(({ item }) => item.key)).toEqual(["two", "three"]);
});

test("media search matches visible file and folder names in the current folder only", () => {
  const files = [{ key: "media/hidden-parent/notes.pdf", name: "Notes.PDF" }, { key: "media/notes/figure.png", name: "figure.png" }];
  const folders = ["media/hidden-parent/NOTES", "media/notes/figures"];
  expect(filterMediaNames(files, " nOtEs ", item => item.name)).toEqual([files[0]]);
  expect(filterMediaNames(folders, " nOtEs ", baseFolderName)).toEqual([folders[0]]);
  expect(filterMediaNames(folders, "hidden-parent", baseFolderName)).toEqual([]);
  expect(filterMediaNames(files, "missing", item => item.name)).toEqual([]);
  expect(filterMediaNames(files, " ", item => item.name)).toBe(files);
});

import { describe, expect, test } from "bun:test";
import { createNativeFileController, type DocumentDraftRequest, type PickerDocument } from "../../apps/mobile-native/device/file-controller";
import { createPublicLinkSharer } from "../../apps/mobile-native/device/share-links";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const origin = "https://staging.example.test";
const fixturePdf = new TextEncoder().encode("%PDF-1.7\nPDF fixture");
const fixtureImage = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 2);
const target = { route: "/settings", locale: "id", draftId: "upload" } as const;
const policy = { mimeTypes: ["application/pdf"], maxBytes: 1024 };
const providerAsset = { uri: "file:///cache/DocumentPicker/fixture.pdf", name: "Dokumen.pdf", mimeType: "application/pdf", size: fixturePdf.length };

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function setup(overrides: Partial<Parameters<typeof createNativeFileController>[0]> = {},
  fetcher = async (_url: string, _init: RequestInit): Promise<Response> => { throw new Error("Unexpected request"); }) {
  const files = new Map<string, Uint8Array[]>();
  const discarded: string[] = [];
  const names: string[] = [];
  const shares: Array<{ uri: string; mimeType: string; title: string; size: number }> = [];
  const transport = createNativeTransport({ origin, fetcher });
  const identity = { origin, accountId: "account", sessionId: "session", readCookie: () => "session=fixture" };
  const session = transport.setSession(identity);
  const request: DocumentDraftRequest = { session, target, policy, isDraftCurrent: () => true };
  const controller = createNativeFileController({
    available: true,
    async pick() { return [providerAsset]; },
    inspect: asset => ({ mimeType: asset.mimeType, size: asset.size }),
    open: () => stream(fixturePdf),
    discard: asset => { discarded.push(asset.uri); },
    createTemporary(name) {
      const uri = `file:///cache/zyx-native-file-actions/${names.length}/${name}`;
      const chunks: Uint8Array[] = [];
      files.set(uri, chunks);
      names.push(name);
      return {
        uri,
        async write(chunk) { chunks.push(chunk); },
        close() {},
        remove() { files.delete(uri); },
      };
    },
    async canShare() { return true; },
    async share(uri, mimeType, title) {
      const chunks = files.get(uri);
      if (!chunks) throw new Error("File not present at the handoff");
      shares.push({ uri, mimeType, title, size: chunks.reduce((total, chunk) => total + chunk.byteLength, 0) });
    },
    ...overrides,
  });
  return { controller, transport, identity, session, request, files, discarded, shares, names };
}

describe("Expo scoped files", () => {
  test("copies a valid chosen document, discards the picker cache and authorizes only that live draft", async () => {
    const fixture = setup({
      pick: async types => {
        expect(types).toEqual(["application/pdf"]);
        return [{ ...providerAsset, name: "../Nama%2fujian#1.pdf" }];
      },
    });
    const result = await fixture.controller.pickDocument(fixture.request);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a document");
    const { document } = result;
    expect(document).toMatchObject({ name: "Nama_2fujian_1.pdf", size: fixturePdf.length, mimeType: "application/pdf" });
    expect(fixture.discarded).toEqual([providerAsset.uri]);
    const wrongDraft = { ...fixture.request, target: { ...target, draftId: "another" } };
    expect(await fixture.controller.shareDocument(document, wrongDraft)).toEqual({ status: "stale" });
    expect(await fixture.controller.shareDocument({ ...document }, fixture.request)).toEqual({ status: "stale" });
    expect(await fixture.controller.shareDocument(document, fixture.request)).toEqual({ status: "finished" });
    expect(fixture.shares).toHaveLength(1);
    fixture.transport.setSession({ ...fixture.identity, accountId: "second-account" });
    expect(fixture.files.size).toBe(0);
    document.release();
    expect(fixture.controller.belongsToDocumentDraft(document, fixture.request)).toBe(false);
  });

  test("cleans delayed picker output for a changed draft and serializes native picker launches", async () => {
    let active = true;
    const deferredPicker = deferred<PickerDocument[] | null>();
    const fixture = setup({ pick: () => deferredPicker.promise });
    const request = { ...fixture.request, isDraftCurrent: () => active };
    const opening = fixture.controller.pickDocument(request);
    expect(await fixture.controller.pickDocument(request)).toEqual({ status: "busy" });
    active = false;
    deferredPicker.resolve([providerAsset]);
    expect(await opening).toEqual({ status: "stale" });
    expect(fixture.discarded).toEqual([providerAsset.uri]);
    expect(fixture.files.size).toBe(0);
    const cancelled = setup({ async pick() { return null; } });
    expect(await cancelled.controller.pickDocument(cancelled.request)).toEqual({ status: "cancelled" });
  });

  test("rejects oversize, disguised, disallowed and inconsistent document metadata", async () => {
    const tooBig = setup({ pick: async () => [{ ...providerAsset, size: 1025 }] });
    expect(await tooBig.controller.pickDocument(tooBig.request)).toEqual({ status: "error", issue: "size" });
    expect(tooBig.names).toEqual([]);
    const wrongType = setup({ inspect: asset => ({ size: asset.size, mimeType: "image/png" }) });
    expect(await wrongType.controller.pickDocument(wrongType.request)).toEqual({ status: "error", issue: "type" });
    const disguised = setup({ open: () => stream(new Uint8Array(fixturePdf.length).fill(97)) });
    expect(await disguised.controller.pickDocument(disguised.request)).toEqual({ status: "error", issue: "type" });
    expect(disguised.files.size).toBe(0);
    const truncated = setup({ open: () => stream(fixturePdf.subarray(0, 8)) });
    expect(await truncated.controller.pickDocument(truncated.request)).toEqual({ status: "error", issue: "incomplete" });
    expect(truncated.files.size).toBe(0);
  });

  test("streams the authenticated Diktat download route into a private share file and deletes it afterward", async () => {
    const fixture = setup({}, async (url, init) => {
      expect(url).toBe(origin + "/api/courses/stats%3A1/diktats/lesson-2/pdf?download=1");
      expect(new Headers(init.headers).get("Cookie")).toBe("session=fixture");
      expect(init.redirect).toBe("manual");
      return new Response(stream(fixturePdf.subarray(0, 3), fixturePdf.subarray(3)), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename*=UTF-8''Materi%20studi.pdf" },
      });
    });
    expect(await fixture.controller.shareAuthorizedDownload({
      session: fixture.session, target: { kind: "diktat-pdf", courseId: "stats:1", diktatId: "lesson-2" }, policy,
    })).toEqual({ status: "finished" });
    expect(fixture.shares[0]).toMatchObject({ title: "Materi studi.pdf", mimeType: "application/pdf", size: fixturePdf.length });
    expect(fixture.files.size).toBe(0);
  });

  test("never requests arbitrary download URLs and keeps server denials, redirects, MIME and byte limits fail-closed", async () => {
    let calls = 0;
    const requestTarget = { kind: "diktat-pdf", courseId: "course-1", diktatId: "diktat-2" } as const;
    const fixture = setup({}, async () => {
      calls++;
      switch (calls) {
        case 1: return new Response(null, { status: 403 });
        case 2: return new Response(null, { status: 302, headers: { Location: "https://other.example.test/a" } });
        case 3: return new Response("blocking page", { headers: { "Content-Type": "text/html" } });
        case 4: return new Response(stream(fixturePdf), { headers: { "Content-Type": "application/pdf", "Content-Length": "5120" } });
        default: return new Response(stream(fixturePdf, new Uint8Array(1024)), { headers: { "Content-Type": "application/pdf" } });
      }
    });
    const request = { session: fixture.session, target: requestTarget, policy };
    expect(await fixture.controller.shareAuthorizedDownload({
      ...request, target: { ...requestTarget, courseId: "https://other.example.test/" },
    })).toEqual({ status: "error", issue: "invalid-target" });
    expect(calls).toBe(0);
    for (const issue of ["unauthorized", "fetch", "type", "size", "size"]) {
      expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "error", issue });
      expect(fixture.shares).toHaveLength(0);
      expect(fixture.files.size).toBe(0);
    }
  });

  test("discards partial downloads on caller cancellation", async () => {
    const started = deferred<void>();
    const streamRead = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(fixturePdf.subarray(0, 6)); },
      pull() { started.resolve(); return streamRead.promise; },
    });
    const fixture = setup({}, async () => new Response(body, { headers: { "Content-Type": "application/pdf" } }));
    const caller = new AbortController();
    const action = fixture.controller.shareAuthorizedDownload({
      session: fixture.session, target: { kind: "diktat-pdf", courseId: "c-1", diktatId: "d-1" }, policy, signal: caller.signal,
    });
    await started.promise;
    caller.abort();
    expect(await action).toEqual({ status: "cancelled" });
    expect(fixture.files.size).toBe(0);
    expect(fixture.shares).toHaveLength(0);
    streamRead.resolve();
  });

  test("purges a discussion attachment at account exit while the OS share operation remains open", async () => {
    const opened = deferred<void>();
    const dismissed = deferred<void>();
    const fixture = setup({
      share: async () => { opened.resolve(); await dismissed.promise; },
    }, async url => {
      expect(url).toBe(origin + "/api/discussions/attachments/attachment-1?download=1");
      return new Response(stream(fixtureImage), { headers: { "Content-Type": "image/png" } });
    });
    const pending = fixture.controller.shareAuthorizedDownload({
      session: fixture.session,
      target: { kind: "discussion-image", attachmentId: "attachment-1" },
      policy: { mimeTypes: ["image/png"], maxBytes: 100 },
    });
    await opened.promise;
    expect(fixture.files.size).toBe(1);
    fixture.transport.clearSession();
    expect(fixture.files.size).toBe(0);
    dismissed.resolve();
    expect(await pending).toEqual({ status: "stale" });
  });
});

describe("Expo public link sharing", () => {
  test("uses Android message and iOS URL fields and treats a dismissed iOS sheet as cancellation", async () => {
    const android = createPublicLinkSharer({
      platform: "android", dismissedAction: "dismissed",
      async share(content, dialogTitle) {
        expect(content).toEqual({ title: "Zyx", message: `Belajar\n${origin}/blog` });
        expect(dialogTitle).toBe("Zyx");
        return { action: "shared" };
      },
    });
    expect(await android({ url: "/blog", origin, title: "Zyx", text: "Belajar" })).toEqual({ status: "finished" });
    const ios = createPublicLinkSharer({
      platform: "ios", dismissedAction: "dismissed",
      async share(content) {
        expect(content.url).toBe(origin + "/");
        return { action: "dismissed" };
      },
    });
    expect(await ios({ url: origin, title: "Zyx" })).toEqual({ status: "cancelled" });
    for (const url of ["file:///secret", "javascript:alert(1)", "//other.example.test", "https://user:secret@example.test"]) {
      expect(await ios({ url, title: "Zyx", origin })).toEqual({ status: "error", issue: "invalid-url" });
    }
  });
});

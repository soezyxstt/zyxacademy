import { describe, expect, test } from "bun:test";
import {
  ANDROID_FILE_EXPORT_LEASE_MS,
  createNativeFileController,
  type DocumentDraftRequest,
  type PickerDocument,
} from "../../apps/mobile-native/device/file-controller";
import { adminMediaDownloadPolicy, adminMediaFilePath } from "../../packages/native-parity/operations/media-content";
import { createPublicLinkSharer } from "../../apps/mobile-native/device/share-links";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { SCHEDULE_ACCOUNT, SCHEDULE_SESSION, scheduleFilePolicy } from "../../packages/native-parity/schedule/resources";

import { TRYOUT_GRADE_ATTACHMENT_ACCOUNT, TRYOUT_GRADE_ATTACHMENT_SESSION, tryoutGradeAttachmentPolicy } from "../../packages/academic/tryout-grade-attachment";

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
  fetcher = async (_url: string, _init: RequestInit): Promise<Response> => { throw new Error("Unexpected request"); },
  clock?: Parameters<typeof createNativeFileController>[1],
  files = new Map<string, Uint8Array[]>()) {
  const discarded: string[] = [];
  const closed = new Set<string>();
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
        close() { closed.add(uri); },
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
  }, clock);
  return { controller, transport, identity, session, request, files, discarded, shares, names, closed };
}

function fileClock() {
  let now = 1_750_000_000_000;
  const timers = new Map<() => void, number>();
  return {
    now: () => now,
    schedule(work: () => void, delay: number) {
      timers.set(work, now + delay);
      return () => { timers.delete(work); };
    },
    advance(ms: number, deliverTimers = true) {
      now += ms;
      if (!deliverTimers) return;
      for (const [work, when] of timers) {
        if (now >= when) {
          timers.delete(work);
          work();
        }
      }
    },
  };
}

const diktatTarget = { kind: "diktat-pdf", courseId: "course-1", diktatId: "diktat-2" } as const;
const pdfResponse = async () => new Response(stream(fixturePdf), { headers: { "Content-Type": "application/pdf" } });

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

  test("accepts GIF signatures for a scoped image draft and rejects a disguised GIF", async () => {
    const gif = new TextEncoder().encode("GIF89a");
    const fixture = setup({
      async pick() { return [{ ...providerAsset, name: "fixture.gif", mimeType: "image/gif", size: gif.length }]; },
      open: () => stream(gif),
    });
    const request = { ...fixture.request, policy: { mimeTypes: ["image/gif"], maxBytes: 1024 } };
    const ready = await fixture.controller.pickDocument(request);
    expect(ready.status).toBe("ready");
    if (ready.status === "ready") ready.document.release();
    expect(fixture.files.size).toBe(0);
    gif[0] = 0;
    expect(await fixture.controller.pickDocument(request)).toEqual({ status: "error", issue: "type" });
    expect(fixture.files.size).toBe(0);
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
    for (const issue of ["unauthorized", "fetch", "type", "size", "size"] as const) {
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

  test("cancels a Diktat export when its screen or role verification changes and allows a fresh request", async () => {
    let current = false;
    let requests = 0;
    const fixture = setup({}, async () => {
      if (++requests === 1) current = false;
      return new Response(stream(fixturePdf), { headers: { "Content-Type": "application/pdf" } });
    });
    const request = { session: fixture.session, target: diktatTarget, policy, isTargetCurrent: () => current };
    expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "stale" });
    expect(requests).toBe(0);

    current = true;
    expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "stale" });
    expect(fixture.shares).toHaveLength(0);
    expect(fixture.files.size).toBe(0);

    current = true;
    expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "finished" });
    expect(requests).toBe(2);
    expect(fixture.shares).toHaveLength(1);
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

  test("shares only a scoped schedule attachment and sends the active account and session", async () => {
    let hits = 0;
    const fixture = setup({}, async (url, init) => {
      hits += 1;
      const headers = new Headers(init.headers);
      expect(url).toBe(origin + "/api/native/schedule/tutor/booking-1?download=attachment-1");
      expect(headers.get(SCHEDULE_ACCOUNT)).toBe("account");
      expect(headers.get(SCHEDULE_SESSION)).toBe("session");
      return new Response(stream(fixtureImage), { headers: { "Content-Type": "image/png" } });
    });
    const request = { session: fixture.session, policy: scheduleFilePolicy,
      target: { kind: "schedule-resource", role: "tutor", bookingId: "booking-1", attachmentId: "attachment-1" } } as const;
    expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "finished" });
    expect(fixture.shares.map(value => value.mimeType)).toEqual(["image/png"]);
    expect(await fixture.controller.shareAuthorizedDownload({
      ...request, target: { ...request.target, attachmentId: "../attachment-1" },
    })).toEqual({ status: "error", issue: "invalid-target" });
    expect(hits).toBe(1);
  });

  test("keeps an Android export readable after chooser return and removes it at lease expiry", async () => {
    const clock = fileClock();
    const fixture = setup({ androidExports: true }, pdfResponse, clock);
    expect(await fixture.controller.shareAuthorizedDownload({
      session: fixture.session, target: diktatTarget, policy,
    })).toEqual({ status: "finished" });
    const { uri } = fixture.shares[0];
    clock.advance(ANDROID_FILE_EXPORT_LEASE_MS - 1);
    expect(fixture.files.get(uri)?.[0]).toEqual(fixturePdf);
    clock.advance(1);
    expect(fixture.files.has(uri)).toBe(false);
  });

  test("revokes completed Android grants by account exit or the first active sweep after suspension", async () => {
    const clock = fileClock();
    const fixture = setup({ androidExports: true }, pdfResponse, clock);
    await fixture.controller.shareAuthorizedDownload({ session: fixture.session, target: diktatTarget, policy });
    clock.advance(ANDROID_FILE_EXPORT_LEASE_MS, false);
    fixture.controller.expireExports();
    expect(fixture.files.size).toBe(0);

    await fixture.controller.shareAuthorizedDownload({ session: fixture.session, target: diktatTarget, policy });
    expect(fixture.files.size).toBe(1);
    fixture.transport.clearSession();
    expect(fixture.files.size).toBe(0);
  });

  test("gives a picked Android draft a separate short-lived export copy", async () => {
    const clock = fileClock();
    const fixture = setup({ androidExports: true }, pdfResponse, clock);
    const picked = await fixture.controller.pickDocument(fixture.request);
    if (picked.status !== "ready") throw new Error("Expected a document");
    const { document } = picked;
    expect(await fixture.controller.shareDocument(document, fixture.request)).toEqual({ status: "finished" });
    const { uri } = fixture.shares[0];
    expect(uri).not.toBe(document.uri);
    expect(fixture.files.size).toBe(2);
    clock.advance(ANDROID_FILE_EXPORT_LEASE_MS);
    expect(fixture.files.has(uri)).toBe(false);
    expect(fixture.files.has(document.uri)).toBe(true);
    expect(fixture.controller.belongsToDocumentDraft(document, fixture.request)).toBe(true);
    document.release();
    expect(fixture.files.size).toBe(0);
  });

  test("a process restart purges orphaned owned exports before opening another file action", async () => {
    const disk = new Map<string, Uint8Array[]>();
    const sibling = "file:///cache/other-feature/kept.pdf";
    disk.set(sibling, [fixturePdf]);
    let resets = 0;
    const sameDisk = {
      androidExports: true,
      resetOwnedCache() {
        resets++;
        for (const path of disk.keys()) if (path.startsWith("file:///cache/zyx-native-file-actions/")) disk.delete(path);
      },
    };
    const before = setup(sameDisk, pdfResponse, fileClock(), disk);
    before.controller.initialize();
    await before.controller.shareAuthorizedDownload({ session: before.session, target: diktatTarget, policy });
    expect(resets).toBe(1);
    expect(disk.size).toBe(2);

    const after = setup(sameDisk, pdfResponse, fileClock(), disk);
    after.controller.initialize();
    expect([...disk.keys()]).toEqual([sibling]);
    expect(resets).toBe(2);
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

describe("private course video playback", () => {
  const path = "/api/storage/file/course/lecture.mp4";
  const bytes = Uint8Array.of(0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0);

  for (const end of ["close", "logout"]) test("removes the playback file on " + end, async () => {
    const fixture = setup({}, async (url, init) => {
      expect(url).toBe(origin + path);
      expect(new Headers(init.headers).get("cookie")).toBe("session=fixture");
      return new Response(stream(bytes), { headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) } });
    });
    const playback = new AbortController();
    const file = await fixture.controller.prepareCourseVideo(fixture.session, path, playback.signal);
    expect(fixture.files.get(file)).toEqual([bytes]);
    expect(fixture.shares).toHaveLength(0);
    if (end === "close") playback.abort();
    else fixture.transport.clearSession();
    expect(fixture.files.size).toBe(0);
  });

  test("removes failed and truncated downloads and rejects unrelated request targets", async () => {
    for (const response of [
      new Response(null, { status: 403 }),
      new Response(stream(fixturePdf), { headers: { "Content-Type": "video/mp4" } }),
      new Response(stream(bytes), { headers: { "Content-Type": "video/mp4", "Content-Length": "128" } }),
    ]) {
      let calls = 0;
      const fixture = setup({}, async () => { calls++; return response; });
      const signal = new AbortController().signal;
      await expect(fixture.controller.prepareCourseVideo(fixture.session, "/api/auth/session", signal)).rejects.toThrow();
      expect(calls).toBe(0);
      await expect(fixture.controller.prepareCourseVideo(fixture.session, path, signal)).rejects.toThrow();
      expect(fixture.files.size).toBe(0);
      expect(fixture.shares).toHaveLength(0);
    }
  });
});

test("PDF views stage one protected local file, renew only metadata, and release the temporary file with the viewing scope", async () => {
  const clock = fileClock();
  const revision = "2".repeat(64);
  const observed: Array<[string | undefined, string | null, string | null]> = [];
  const fixture = setup({}, async (url, init) => {
    expect(url).toBe(origin + "/api/native/student/material-pdf?courseId=course&materialId=manual");
    const headers = new Headers(init.headers);
    observed.push([init.method, headers.get("if-match"), headers.get("x-student-id")]);
    expect(headers.get("cookie")).toBe("session=fixture");
    return new Response(init.method === "HEAD" ? null : stream(fixturePdf), { headers: {
      "Content-Type": "application/pdf", "x-zyx-pdf-revision": revision,
      "x-zyx-pdf-view-until": String(clock.now() + 100_000),
    } });
  }, clock);
  const screen = new AbortController();
  const input = { session: fixture.session, target: { courseId: "course", materialId: "manual" },
    signal: screen.signal, sessionExpiresAt: clock.now() + 50_000, isTargetCurrent: () => true };
  const ready = await fixture.controller.prepareMaterialPdf(input);
  expect(ready.status).toBe("ready");
  if (ready.status !== "ready") throw new Error("Expected staged file");
  expect(ready.document.uri).toMatch(/^file:/);
  expect(fixture.closed.has(ready.document.uri)).toBe(true);
  expect(ready.document.expiresAt).toBe(input.sessionExpiresAt);
  expect(fixture.files.size).toBe(1);
  expect(await fixture.controller.renewMaterialPdf(input, ready.document.revision)).toMatchObject({ status: "ready", grant: { revision } });
  expect(observed).toEqual([["GET", null, "account"], ["HEAD", '"' + revision + '"', "account"]]);
  expect(fixture.shares).toEqual([]);
  screen.abort();
  expect(fixture.files.size).toBe(0);
});

test("PDF views reject stale sessions, expired grants and unexpected file parts", async () => {
  const clock = fileClock();
  let expired = true;
  let invalid = false;
  const fixture = setup({}, async () => new Response(stream(invalid ? fixtureImage : fixturePdf), { headers: {
    "Content-Type": "application/pdf", "x-zyx-pdf-revision": "a".repeat(64),
    "x-zyx-pdf-view-until": String(clock.now() + (expired ? 0 : 5000)),
  } }), clock);
  const input = { session: fixture.session, target: { courseId: "course", materialId: "manual" },
    signal: new AbortController().signal, sessionExpiresAt: clock.now() + 20_000, isTargetCurrent: () => true };
  expect(await fixture.controller.prepareMaterialPdf(input)).toEqual({ status: "error", issue: "unauthorized" });
  expired = false;
  invalid = true;
  expect(await fixture.controller.prepareMaterialPdf(input)).toEqual({ status: "error", issue: "type" });
  expect(fixture.files.size).toBe(0);
  invalid = false;
  expect((await fixture.controller.prepareMaterialPdf(input)).status).toBe("ready");
  fixture.transport.setSession({ ...fixture.identity, accountId: "other" });
  expect(fixture.files.size).toBe(0);
  expect(await fixture.controller.prepareMaterialPdf(input)).toEqual({ status: "stale" });
});

test("Admin PDF staging and metadata renewal use the fixed Admin route and never use Student credentials", async () => {
  const clock = fileClock();
  const revision = "3".repeat(64);
  const phases: Array<[string, string | undefined]> = [];
  const fixture = setup({}, async (url, init) => {
    expect(url).toBe(origin + "/api/native/academic/material-pdf?courseId=course&materialId=manual");
    const headers = new Headers(init.headers);
    expect(headers.get("x-native-account")).toBe("account");
    expect(headers.get("x-native-session")).toBe("session");
    expect(headers.get("x-student-id")).toBeNull();
    return new Response(init.method === "HEAD" ? null : stream(fixturePdf), { headers: {
      "Content-Type": "application/pdf", "x-zyx-pdf-revision": revision,
      "x-zyx-pdf-view-until": String(clock.now() + 100_000),
    } });
  }, clock);
  const admin = fixture.transport.setSession({ ...fixture.identity, canStartRequest: (method, role) => {
    phases.push([method, role]);
    return role === "admin";
  } });
  const screen = new AbortController();
  const input = { audience: "admin" as const, session: admin, target: { courseId: "course", materialId: "manual" },
    signal: screen.signal, sessionExpiresAt: clock.now() + 50_000, isTargetCurrent: () => true };
  expect(await fixture.controller.prepareMaterialPdf(input)).toMatchObject({ status: "ready" });
  expect(await fixture.controller.renewMaterialPdf(input, revision)).toMatchObject({ status: "ready" });
  expect(phases).toEqual([["GET", "admin"], ["HEAD", "admin"]]);
  expect(fixture.files.size).toBe(1);
  expect(fixture.shares).toEqual([]);
  screen.abort();
  expect(fixture.files.size).toBe(0);
});

test("Admin form drafts preview only authorized image bytes and release them when leaving", async () => {
  const pattern = "/api/storage/file/forms/survey/question-1/form-image.png";
  const calls: string[] = [];
  let bytes = fixtureImage;
  const { controller, session, files } = setup({}, async (url, init) => {
    calls.push(url);
    expect(new Headers(init.headers).get("cookie")).toBe("session=fixture");
    return new Response(stream(bytes), { headers: { "Content-Type": "image/png", "Content-Length": String(bytes.byteLength) } });
  });
  const abort = new AbortController();
  await expect(controller.prepareFormQuestionImage(session, "https://other.test" + pattern, abort.signal)).rejects.toThrow("invalid-target");
  await expect(controller.prepareFormQuestionImage(session, "/api/storage/file/media/file.png", abort.signal)).rejects.toThrow("invalid-target");
  expect(calls).toEqual([]);
  const result = await controller.prepareFormQuestionImage(session, pattern, abort.signal);
  expect(calls).toEqual([origin + pattern]);
  expect(files.has(result.uri)).toBe(true);
  abort.abort();
  expect(files.size).toBe(0);
  bytes = fixturePdf;
  await expect(controller.prepareFormQuestionImage(session, pattern, new AbortController().signal)).rejects.toThrow("type");
  expect(files.size).toBe(0);
});

test("Tutor can open an exact tryout answer PDF with native session binding and the tryout limit", async () => {
  let hits = 0;
  let length: number = fixturePdf.length;
  const fixture = setup({}, async (url, init) => {
    hits++;
    const headers = new Headers(init.headers);
    expect(url).toBe(origin + "/api/native/academic/tutor-support/courses/course/grading/sub-1/attachment/q-1");
    expect(headers.get(TRYOUT_GRADE_ATTACHMENT_ACCOUNT)).toBe("account");
    expect(headers.get(TRYOUT_GRADE_ATTACHMENT_SESSION)).toBe("session");
    return new Response(stream(fixturePdf), { headers: { "Content-Type": "application/pdf", "Content-Length": String(length) } });
  });
  const target = { kind: "tryout-grade-attachment", courseId: "course", submissionId: "sub-1", questionId: "q-1" } as const;
  const request = { session: fixture.session, policy: tryoutGradeAttachmentPolicy, target };
  expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "finished" });
  expect(fixture.shares.map(item => item.mimeType)).toEqual(["application/pdf"]);
  expect(await fixture.controller.shareAuthorizedDownload({ ...request, target: { ...target, submissionId: "../other" } }))
    .toEqual({ status: "error", issue: "invalid-target" });
  expect(hits).toBe(1);
  length = tryoutGradeAttachmentPolicy.maxBytes + 1;
  expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "error", issue: "size" });
  expect(fixture.shares).toHaveLength(1);
});

test("native PDF batch picker bounds total bytes and purges partial selections", async () => {
  const second = { ...providerAsset, uri: "content://documents/second", name: "Kedua.pdf" };
  const selected = setup({
    async pick(types, multiple) {
      expect(types).toEqual(["application/pdf"]);
      expect(multiple).toBe(true);
      return [providerAsset, second];
    },
  });
  const tooLarge = await selected.controller.pickDocuments(selected.request, { count: 2, bytes: fixturePdf.length + 1 });
  expect(tooLarge).toEqual({ status: "error", issue: "size" });
  expect(selected.files.size).toBe(0);
  expect(selected.discarded).toEqual([providerAsset.uri, second.uri]);
  const good = await selected.controller.pickDocuments(selected.request, { count: 2, bytes: fixturePdf.length * 2 });
  expect(good.status).toBe("ready");
  if (good.status !== "ready") throw new Error("Expected both PDF files");
  expect(good.documents.map(file => file.name)).toEqual(["Dokumen.pdf", "Kedua.pdf"]);
  selected.transport.clearSession();
  expect(selected.files.size).toBe(0);
});

test("native ZIP intake accepts a platform ZIP alias but checks actual file bytes", async () => {
  const asset = { uri: "content://documents/bundle", name: "Idea.zip", mimeType: "application/x-zip-compressed", size: 4 };
  const sample = (bytes: Uint8Array) => setup({ async pick() { return [asset]; }, open: () => stream(bytes) });
  const valid = sample(Uint8Array.of(80, 75, 3, 4));
  const draft = { ...valid.request, policy: { mimeTypes: ["application/zip"], maxBytes: 10 } };
  const good = await valid.controller.pickDocument(draft);
  expect(good).toMatchObject({ status: "ready", document: { name: "Idea.zip", mimeType: "application/zip" } });
  const invalid = sample(Uint8Array.of(0, 1, 2, 3));
  expect(await invalid.controller.pickDocument({ ...draft, session: invalid.session })).toEqual({ status: "error", issue: "type" });
  expect(invalid.files.size).toBe(0);
});

test("admits JSON selected from a generic Files provider and releases its scoped copy", async () => {
  const bytes = new TextEncoder().encode('{"markdown":"# Materi"}');
  const fixture = setup({
    pick: async () => [{ uri: "content://documents/12", name: "Material.json", mimeType: "application/octet-stream", size: bytes.length }],
    open: () => stream(bytes),
  });
  const request: DocumentDraftRequest = {
    ...fixture.request, target: { ...target, route: "/admin/ast-inspector" },
    policy: { mimeTypes: ["application/json"], maxBytes: 64 },
  };
  const result = await fixture.controller.pickDocument(request);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected a JSON document");
  expect(result.document.mimeType).toBe("application/json");
  expect(fixture.controller.belongsToDocumentDraft(result.document, request)).toBe(true);
  result.document.release();
  expect(fixture.files.size).toBe(0);
});

test("shares generated JSON only while authorized and measures the limit in UTF-8 bytes", async () => {
  const clock = fileClock();
  const fixture = setup({ androidExports: true }, undefined, clock);
  const request = {
    session: fixture.session, isDraftCurrent: () => true,
    name: "compiled-material-ujian.txt", title: "Ekspor JSON", text: '{"value":"é"}',
  };
  await expect(fixture.controller.shareGeneratedJson({ ...request, maxBytes: request.text.length }))
    .resolves.toEqual({ status: "error", issue: "size" });
  await expect(fixture.controller.shareGeneratedJson({ ...request, maxBytes: 64 })).resolves.toEqual({ status: "finished" });
  expect(fixture.names).toEqual(["compiled-material-ujian.json"]);
  expect(fixture.shares.map(({ mimeType }) => mimeType)).toEqual(["application/json"]);
  expect(fixture.files.size).toBe(1);
  clock.advance(ANDROID_FILE_EXPORT_LEASE_MS);
  expect(fixture.files.size).toBe(0);
  await expect(fixture.controller.shareGeneratedJson({ ...request, isDraftCurrent: () => false, maxBytes: 64 }))
    .resolves.toEqual({ status: "stale" });
  expect(fixture.shares.length).toBe(1);
});

test("manual PDF export only shares a protected attachment response under the current learner", async () => {
  let disposition = "inline";
  const fixture = setup({}, async (url, init) => {
    expect(url).toBe(origin + "/api/native/student/material-pdf?courseId=course-a&materialId=material-a&download=1");
    expect(new Headers(init.headers).get("x-student-id")).toBe(fixture.session.scope.accountId);
    return new Response(fixturePdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition } });
  });
  const request = { session: fixture.session, policy, target: { kind: "course-material-pdf", courseId: "course-a", materialId: "material-a" } as const };
  expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "error", issue: "unauthorized" });
  expect(fixture.shares).toHaveLength(0);
  disposition = "attachment";
  expect(await fixture.controller.shareAuthorizedDownload(request)).toEqual({ status: "finished" });
  expect(fixture.shares).toHaveLength(1);
});


test("Admin media previews and downloads use the exact storage key and release private files", async () => {
  const requests: string[] = [];
  const fixture = setup({}, async (url, init) => {
    requests.push(url);
    expect(new Headers(init.headers).get("cookie")).toBe("session=fixture");
    return new Response(stream(fixturePdf), { headers: { "Content-Type": "application/pdf" } });
  });
  const key = "media/admin dokumen/report.pdf";
  const controller = new AbortController();
  const preview = await fixture.controller.prepareAdminMedia(fixture.session, key, controller.signal, () => true);
  expect(fixture.files.size).toBe(1);
  controller.abort();
  expect(fixture.files.size).toBe(0);
  await expect(fixture.controller.shareAuthorizedDownload({
    session: fixture.session, target: { kind: "admin-media", key }, policy: adminMediaDownloadPolicy,
  })).resolves.toEqual({ status: "finished" });
  expect(requests).toEqual([
    `${origin}/api/storage/file/media/admin%20dokumen/report.pdf`,
    `${origin}/api/storage/file/media/admin%20dokumen/report.pdf?download=1`,
  ]);
  expect(fixture.files.size).toBe(0);
  for (const invalid of ["../media/file.pdf", "media/a%2Ffile.pdf", "media/file.pdf?download=1", "//evil.example/file.pdf"]) {
    expect(adminMediaFilePath(invalid)).toBeNull();
    await expect(fixture.controller.prepareAdminMedia(fixture.session, invalid, new AbortController().signal, () => true)).rejects.toThrow();
  }
  expect(requests).toHaveLength(2);
});

test("released Student quiz attachments use an exact scope URL and verified raster preview uses private temporary bytes", async () => {
  const calls: Array<{ path: string; student: string | null }> = [];
  const fixture = setup({}, async (value, init) => {
    const path = new URL(value).pathname;
    calls.push({ path, student: new Headers(init.headers).get("x-student-id") });
    return path.endsWith(".png")
      ? new Response(fixtureImage, { headers: { "Content-Type": "image/png" } })
      : new Response(fixturePdf, { headers: { "Content-Type": "application/pdf" } });
  });
  const { controller, session, shares, files } = fixture;
  const signal = new AbortController().signal;
  const prepared = await controller.prepareAssessmentImage(session, "/api/storage/file/materials/course/chart.png", signal, () => true);
  expect(files.has(prepared.uri)).toBe(true);
  prepared.release();
  expect(files.has(prepared.uri)).toBe(false);
  await expect(controller.prepareAssessmentImage(session, "https://outside.example/chart.png", signal, () => true)).rejects.toThrow();
  expect(await controller.shareAuthorizedDownload({ session, policy, fileName: "answer.pdf", signal,
    target: { kind: "quiz-review-attachment", courseId: "course", attemptId: "attempt", questionId: "question" } })).toEqual({ status: "finished" });
  expect(calls).toEqual([
    { path: "/api/storage/file/materials/course/chart.png", student: null },
    { path: "/api/native/student/assessment/course/my-results/attempt/attachment/question", student: "account" },
  ]);
  expect(shares[0]?.mimeType).toBe("application/pdf");
});

test("public quiz image follows the active session lifetime without sending the signed transport", async () => {
  const source = "https://upload.wikimedia.org/plot.png";
  const data = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 40, 0, 0, 0, 40);
  const fixture = setup();
  const signal = new AbortController().signal;
  const asset = await fixture.controller.preparePublicAssessmentImage(fixture.session, source, signal, () => true, async (url, init) => {
    expect(url).toBe(source);
    expect(init.credentials).toBe("omit");
    return new Response(data, { headers: { "Content-Type": "image/png", "Content-Length": String(data.byteLength) } });
  });
  expect(fixture.files.has(asset.uri)).toBe(true);
  const oversized = new Response(data, { headers: { "Content-Type": "image/png", "Content-Length": "4194305" } });
  await expect(fixture.controller.preparePublicAssessmentImage(fixture.session, source, signal, () => true, async () => oversized)).rejects.toThrow();
  expect(fixture.files.size).toBe(1);
  fixture.transport.clearSession();
  expect(fixture.files.has(asset.uri)).toBe(false);
});

test("admits UTF-8 Markdown from a generic Android Documents provider under the current question import draft", async () => {
  const bytes = new TextEncoder().encode("# Gerak\n\nΔv");
  const fixture = setup({
    pick: async () => [{ uri: "content://documents/18", name: "Gerak.md", mimeType: "application/octet-stream", size: bytes.length }],
    open: () => stream(bytes),
  });
  const request: DocumentDraftRequest = { ...fixture.request, target: { ...target, route: "/admin/questions" },
    policy: { mimeTypes: ["text/markdown"], maxBytes: 256 } };
  const result = await fixture.controller.pickDocument(request);
  if (result.status !== "ready") throw new Error("Expected Markdown");
  expect(result.document.mimeType).toBe("text/markdown");
  expect(result.document.name).toBe("Gerak.md");
  expect(fixture.controller.belongsToDocumentDraft(result.document, request)).toBe(true);
  expect(fixture.controller.belongsToDocumentDraft(result.document, { ...request, target: { ...request.target, draftId: "another" } })).toBe(false);
  result.document.release();
  expect(fixture.files.size).toBe(0);
});

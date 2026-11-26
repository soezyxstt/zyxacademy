import { expect, test } from "bun:test";
import {
  belongsToPhotoDraft,
  createDraftPhotoController,
  DRAFT_PHOTO_RECOVERY_TTL_MS,
  type PhotoDraftRequest,
  type PhotoPickerResult,
} from "../../apps/mobile-native/device/photo-controller";
import {
  DRAFT_PHOTO_MAX_BYTES,
  isPhotoCacheFile,
  prepareDraftPhoto,
  type PickerPhoto,
  type PreparedPhoto,
} from "../../apps/mobile-native/device/photo-image";

const epoch = 1_800_000_000_000;
const asset: PickerPhoto = { uri: "file:///cache/picker.jpg", width: 6000, height: 4000, type: "image", mimeType: "image/jpeg" };
const photo: PreparedPhoto = { uri: "file:///cache/prepared.jpg", width: 2048, height: 1365, size: 500_000, mimeType: "image/jpeg" };
const selected: PhotoPickerResult = { status: "selected", asset };
const scope = { origin: "https://staging.example.test", accountId: "student-a", sessionId: "session-a" };
const target = { route: "/discussions?thread=1", locale: "id" as const, draftId: "reply:1" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function fixture() {
  const calls: string[] = [];
  let current = true;
  let time = epoch;
  let pending: string | null = null;
  let pendingResult: PhotoPickerResult | null = null;
  let launchResult: PhotoPickerResult = selected;
  const request: PhotoDraftRequest = {
    session: { scope, isCurrent: () => current },
    target,
    isDraftCurrent: () => true,
  };
  const options: Parameters<typeof createDraftPhotoController>[0] = {
    createId: () => "capture-1",
    now: () => time,
    store: {
      read: async () => pending,
      async write(value) { pending = value; calls.push("write"); },
      async remove() { pending = null; calls.push("remove"); },
    },
    device: {
      available: true,
      supportsRecovery: true,
      async checkCameraPermission() { calls.push("check-camera"); return { granted: false, canAskAgain: true }; },
      async requestCameraPermission() { calls.push("prompt-camera"); return { granted: true, canAskAgain: true }; },
      async launch(source) {
        expect(pending).not.toBeNull();
        expect(pending).not.toContain("file://");
        calls.push(source);
        return launchResult;
      },
      async getPending() {
        calls.push("pending");
        const result = pendingResult;
        pendingResult = null;
        return result;
      },
      async prepare() { calls.push("prepare"); return { photo }; },
      discard(uri) { calls.push(`discard:${uri}`); },
    },
  };
  return {
    options,
    request,
    calls,
    create: () => createDraftPhotoController(options),
    deactivate: () => { current = false; },
    time: (next: number) => { time = next; },
    getRecord: () => pending,
    setLaunchResult: (next: PhotoPickerResult) => { launchResult = next; },
    restore(value: PhotoPickerResult | null = selected, createdAt = epoch) {
      pending = JSON.stringify({ version: 1, scope, target, id: "original-1", createdAt, recoverable: true });
      pendingResult = value;
    },
    oldResult: (value: PhotoPickerResult | null) => { pendingResult = value; },
  };
}

test("explicit camera and library flows share safe preparation without requesting broad library permission", async () => {
  const { create, request, calls, getRecord } = fixture();
  const bridge = create();
  expect(await bridge.getPendingTarget(request.session)).toBeNull();
  expect(calls).toEqual([]);

  const result = await bridge.pick("camera", request);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected a prepared photo");
  expect(result).toMatchObject({ recovered: false, photo: { ...photo, scope, target, name: "foto-soal-capture-1.jpg" } });
  expect(belongsToPhotoDraft(result.photo, request)).toBe(true);
  expect(belongsToPhotoDraft(result.photo, { ...request, target: { ...target, draftId: "reply:2" } })).toBe(false);
  expect(calls).toEqual(["check-camera", "prompt-camera", "pending", "write", "camera", "remove", "prepare", `discard:${asset.uri}`]);
  expect(getRecord()).toBeNull();
  result.photo.release();
  expect(calls.at(-1)).toBe(`discard:${photo.uri}`);

  calls.length = 0;
  expect((await bridge.pick("library", request)).status).toBe("ready");
  expect(calls).not.toContain("prompt-camera");
  expect(calls).not.toContain("check-camera");
});

test("blocked permission, cancellation and storage errors stay retryable and return no image", async () => {
  const f = fixture();
  f.options.device.checkCameraPermission = async () => ({ granted: false, canAskAgain: false });
  const bridge = f.create();
  expect(await bridge.pick("camera", f.request)).toEqual({ status: "permission-denied", canAskAgain: false });
  expect(f.calls).toEqual([]);

  f.setLaunchResult({ status: "cancelled" });
  expect(await bridge.pick("library", f.request)).toEqual({ status: "cancelled" });
  expect(f.getRecord()).toBeNull();
  expect(f.calls).not.toContain("prepare");

  f.options.store.write = async () => { throw new Error("unavailable"); };
  f.calls.length = 0;
  expect(await bridge.pick("library", f.request)).toEqual({ status: "error", issue: "storage" });
  expect(f.calls).not.toContain("library");
});

test("iOS selection does not touch pending storage, and a departed draft cannot launch the camera", async () => {
  const f = fixture();
  f.options.device.supportsRecovery = false;
  f.options.store.read = async () => { throw new Error("Unexpected storage read"); };
  f.options.device.launch = async () => selected;
  const bridge = f.create();
  expect(await bridge.recover(f.request)).toEqual({ status: "unavailable" });
  expect((await bridge.pick("library", f.request)).status).toBe("ready");

  const consentStarted = deferred<void>();
  const consent = deferred<{ granted: boolean; canAskAgain: boolean }>();
  let draftCurrent = true;
  f.options.device.requestCameraPermission = async () => { consentStarted.resolve(); return consent.promise; };
  const choice = bridge.pick("camera", { ...f.request, isDraftCurrent: () => draftCurrent });
  await consentStarted.promise;
  draftCurrent = false;
  consent.resolve({ granted: true, canAskAgain: true });
  expect(await choice).toEqual({ status: "stale" });
});

test("restores Android results once to the exact locale, route and draft identity", async () => {
  const f = fixture();
  f.restore();
  const bridge = f.create();
  expect(await bridge.getPendingTarget(f.request.session)).toEqual(target);
  for (const wrong of [
    { ...target, locale: "en" as const },
    { ...target, route: "/discussions?thread=2" },
    { ...target, draftId: "reply:2" },
  ]) {
    expect(await bridge.recover({ ...f.request, target: wrong })).toEqual({ status: "no-pending" });
  }
  expect(f.calls).toEqual([]);
  expect(await bridge.recover(f.request)).toMatchObject({
    status: "ready", recovered: true, photo: { ...photo, scope, target, name: "foto-soal-original-1.jpg" },
  });
  expect(await bridge.recover(f.request)).toEqual({ status: "no-pending" });
  expect(f.calls.filter(call => call === "prepare")).toEqual(["prepare"]);
});

test("expires stale recovery and discards records and native results from a different authenticated scope", async () => {
  for (const candidate of [
    { ...scope, origin: "https://production.example.test" },
    { ...scope, accountId: "student-b" },
    { ...scope, sessionId: "session-b" },
  ]) {
    const f = fixture();
    f.restore();
    const bridge = f.create();
    const request = { ...f.request, session: { ...f.request.session, scope: candidate } };
    expect(await bridge.getPendingTarget(request.session)).toBeNull();
    expect(await bridge.recover(request)).toEqual({ status: "no-pending" });
    expect(f.getRecord()).toBeNull();
    expect(f.calls).toEqual(["pending", "remove", `discard:${asset.uri}`]);
  }

  const f = fixture();
  f.restore();
  f.time(epoch + DRAFT_PHOTO_RECOVERY_TTL_MS + 1);
  expect(await f.create().recover(f.request)).toEqual({ status: "no-pending" });
  expect(f.getRecord()).toBeNull();
  expect(f.calls).not.toContain("prepare");
});

test("a late pending result cannot be assigned to a replacement launch after an ambiguous null read", async () => {
  const f = fixture();
  f.restore(null);
  const started = deferred<void>();
  const unfinished = deferred<PhotoPickerResult>();
  f.options.device.launch = async () => {
    started.resolve();
    return unfinished.promise;
  };
  const request = {
    ...f.request,
    session: { ...f.request.session, scope: { ...scope, accountId: "student-b", sessionId: "session-b" } },
  };
  const liveLaunch = f.create().pick("library", request);
  await started.promise;
  f.oldResult(selected);
  const relaunched = f.create();
  expect(await relaunched.getPendingTarget(request.session)).toBeNull();
  expect(await relaunched.recover(request)).toEqual({ status: "no-pending" });
  expect(f.calls).not.toContain("prepare");
  unfinished.resolve({ status: "cancelled" });
  await liveLaunch;
});

test("does not publish a processed photo if the session ends while preparation is in progress", async () => {
  const f = fixture();
  const preparing = deferred<void>();
  const finish = deferred<{ photo: PreparedPhoto }>();
  f.options.device.prepare = async () => { preparing.resolve(); return finish.promise; };
  const bridge = f.create();
  const pending = bridge.pick("library", f.request);
  await preparing.promise;
  expect(await bridge.recover(f.request)).toEqual({ status: "busy" });
  f.deactivate();
  finish.resolve({ photo });
  expect(await pending).toEqual({ status: "stale" });
  expect(f.calls.slice(-2)).toEqual([`discard:${photo.uri}`, `discard:${asset.uri}`]);
});

test("resizes along the longest edge and transcodes a large PNG into a bounded JPEG", async () => {
  const calls: unknown[][] = [];
  const result = await prepareDraftPhoto({ ...asset, width: 4000, height: 6000, mimeType: "image/png" }, {
    fileSize: uri => uri.endsWith("png") ? DRAFT_PHOTO_MAX_BYTES + 1 : 600_000,
    discard: uri => { calls.push(["discard", uri]); },
    async render(uri, resize) {
      calls.push(["render", uri, resize]);
      return {
        async save(format, quality) {
          calls.push(["save", format, quality]);
          return { uri: `file:///cache/processed.${format}`, width: 1365, height: 2048 };
        },
        release() { calls.push(["release"]); },
      };
    },
  });
  expect(result).toEqual({
    photo: { uri: "file:///cache/processed.jpeg", width: 1365, height: 2048, size: 600_000, mimeType: "image/jpeg" },
  });
  expect(calls).toEqual([
    ["render", asset.uri, { height: 2048 }],
    ["save", "png", 0.86],
    ["discard", "file:///cache/processed.png"],
    ["save", "jpeg", 0.86],
    ["release"],
  ]);
});

test("rejects unreadable and oversized inputs before decoding and oversized outputs before delivery", async () => {
  const device: Parameters<typeof prepareDraftPhoto>[1] = {
    fileSize: () => DRAFT_PHOTO_MAX_BYTES + 1,
    discard: () => {},
    render: async () => { throw new Error("Unexpected decode"); },
  };
  expect(await prepareDraftPhoto({ ...asset, width: 0 }, device)).toEqual({ issue: "decode" });
  expect(await prepareDraftPhoto({ ...asset, width: 9000, height: 9000 }, device)).toEqual({ issue: "image-size" });
  expect(await prepareDraftPhoto({ ...asset, type: "video" }, device)).toEqual({ issue: "unsupported-image" });
  const removed: string[] = [];
  expect(await prepareDraftPhoto(asset, {
    ...device,
    discard: uri => { removed.push(uri); },
    async render() {
      return {
        save: async (_format, quality) => ({ ...photo, uri: `file:///cache/quality-${quality}.jpg` }),
        release() {},
      };
    },
  })).toEqual({ issue: "image-size" });
  expect(removed).toEqual(["file:///cache/quality-0.86.jpg", "file:///cache/quality-0.7.jpg"]);
});

test("a form camera request saves JPEG with the authored byte limit", async () => {
  const outputs: string[] = [];
  const discarded: string[] = [];
  const result = await prepareDraftPhoto({ ...asset, mimeType: "image/png" }, {
    fileSize: uri => uri.endsWith("0.7.jpg") ? 400 : 600,
    discard: uri => { discarded.push(uri); },
    async render() {
      return {
        async save(format, quality) {
          outputs.push(`${format}:${quality}`);
          return { uri: `file:///cache/quality-${quality}.jpg`, width: 640, height: 480 };
        },
        release() {},
      };
    },
  }, { format: "jpeg", maxBytes: 500 });
  expect(outputs).toEqual(["jpeg:0.86", "jpeg:0.7"]);
  expect(discarded).toEqual(["file:///cache/quality-0.86.jpg"]);
  expect(result).toMatchObject({ photo: { mimeType: "image/jpeg", size: 400 } });
});

test("photo byte reads and cleanup are restricted to app cache file URIs", () => {
  expect(isPhotoCacheFile("file:///app/cache/ImagePicker/photo.jpg", "file:///app/cache/")).toBe(true);
  expect(isPhotoCacheFile(
    "file:///private/var/mobile/App/Library/Caches/ImagePicker/photo.jpg",
    "file:///var/mobile/App/Library/Caches/",
    true,
  )).toBe(true);
  for (const uri of [
    "file:///app/cache/",
    "file:///app/cached/photo.jpg",
    "file:///app/cache/%2e%2e/private.jpg",
    "file:///app/cache/%252e%252e/private.jpg",
    "content://library/private.jpg",
    "https://example.test/private.jpg",
  ]) expect(isPhotoCacheFile(uri, "file:///app/cache")).toBe(false);
});

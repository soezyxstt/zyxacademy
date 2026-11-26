import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import type { DocumentDraftRequest } from "../../apps/mobile-native/device/file-controller";
import type { PhotoDraftRequest, PhotoOutcome } from "../../apps/mobile-native/device/photo-controller";
import * as client from "../../apps/mobile-native/features/public-forms/client";
import type { FormWriteIdentity } from "../../packages/forms/response-policy";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

const scope = { origin: NATIVE_STAGING_ORIGIN, sessionId: "session-a", accountId: "account-a" };
const photoUrl = "/api/storage/file/forms/demo/camera.jpg";
const uri = "file:///app/cache/camera.jpg";

async function fixture(platform = "android") {
  const built = await Bun.build({ entrypoints: ["apps/mobile-native/features/public-forms/expo-client.ts"], format: "cjs", external: ["*"] });
  const module = { exports: {} as { pickAndUploadFormFile(
    source: "camera" | "document",
    resolveWrite: () => Promise<{ request: client.FormRequest; identity?: FormWriteIdentity } | null>,
    draft: DocumentDraftRequest, formId: string, questionIndex: number,
  ): Promise<unknown> } };
  const calls: string[] = [];
  const requests: Parameters<client.FormRequest>[] = [];
  const release = () => { calls.push("release"); };
  const controller = new AbortController();
  let current = true;
  let captured: PhotoOutcome | undefined;
  const draft: DocumentDraftRequest = {
    session: { scope, signal: controller.signal, isCurrent: () => current },
    isDraftCurrent: () => current,
    target: { route: "/f/demo", locale: "id", draftId: "draft-a" },
    policy: { mimeTypes: ["application/pdf", "image/jpeg"], maxBytes: 500 },
  };
  const request: client.FormRequest = async (...args) => {
    calls.push("write");
    requests.push(args);
    const response = Response.json({ success: true, url: photoUrl });
    return { status: 200, headers: response.headers, body: response.body, dispose() {} };
  };
  const dependencies: Record<string, unknown> = {
    "react-native": { Platform: { OS: platform } },
    "expo-file-system": { File: class extends File {
      constructor(path: string) { super([Uint8Array.from([0xff, 0xd8, 0xff])], new URL(path).pathname.split("/").at(-1)!, { type: "image/jpeg" }); }
    } },
    "expo/fetch": { fetch: () => { throw new Error("Unexpected anonymous request"); } },
    "../../auth/session-api": { NATIVE_STAGING_ORIGIN },
    "../../device/files": { scopedFiles: { pickDocument: async (target: DocumentDraftRequest) => {
      calls.push("document");
      expect(target).toBe(draft);
      return { status: "ready", document: { uri, name: "selected.jpg", release } };
    } } },
    "../../device/photo": { scopedPhotos: { pick: async (source: string, target: PhotoDraftRequest) => {
      calls.push(source);
      expect(target.session).toBe(draft.session);
      expect(target.target).toEqual({ ...draft.target, draftId: "draft-a:q3" });
      expect(target.output).toEqual({ format: "jpeg", maxBytes: 500 });
      expect(target.discardOnRestore).toBe(true);
      return captured ?? { status: "ready", photo: { uri, name: "captured.jpg", size: 376, mimeType: "image/jpeg", release } };
    } } },
    "./client": client,
  };
  runInNewContext(await built.outputs[0].text(), { module, exports: module.exports, require: (name: string) => dependencies[name],
    FormData, URL });
  return { draft, calls, requests, controller, release,
    action: module.exports.pickAndUploadFormFile,
    closeDraft: () => { current = false; },
    choose: (outcome: PhotoOutcome) => { captured = outcome; },
    verify: async () => { calls.push("verify"); return { request, identity: scope }; },
  };
}

test("camera capture uses the exact draft question and writes through the verified form upload route", async () => {
  const f = await fixture();
  expect(await f.action("camera", f.verify, f.draft, "form-id", 2)).toEqual({ status: "uploaded", filename: "captured.jpg", storageUrl: photoUrl });
  expect(f.calls).toEqual(["camera", "verify", "write", "release"]);
  const [[path, init]] = f.requests;
  expect(path).toBe("/api/forms/upload?target=id&respondent=session");
  expect(init).toMatchObject({ method: "POST", headers: {
    "X-Zyx-Form-Account": scope.accountId, "X-Zyx-Form-Session": scope.sessionId,
  } });
  const body = init.body as FormData;
  expect(body.get("formSlug")).toBe("form-id");
  expect(body.get("questionNumber")).toBe("3");
  expect(body.get("file")).toBeInstanceOf(File);
  expect((body.get("file") as File).type).toBe("image/jpeg");
});

test("camera availability, permission denial and cancellation stop before any write", async () => {
  const f = await fixture();
  const pdf = { ...f.draft, policy: { ...f.draft.policy, mimeTypes: ["application/pdf"] } };
  expect(await f.action("camera", f.verify, pdf, "form-id", 2)).toEqual({ status: "type" });
  expect(f.calls).toEqual([]);
  f.choose({ status: "permission-denied", canAskAgain: false });
  expect(await f.action("camera", f.verify, f.draft, "form-id", 2)).toEqual({ status: "camera-denied", canAskAgain: false });
  f.choose({ status: "cancelled" });
  expect(await f.action("camera", f.verify, f.draft, "form-id", 2)).toEqual({ status: "cancelled" });
  f.controller.abort();
  expect(await f.action("camera", f.verify, f.draft, "form-id", 2)).toEqual({ status: "cancelled" });
  expect(f.calls).toEqual(["camera", "camera"]);
  const web = await fixture("web");
  expect(await web.action("camera", web.verify, web.draft, "form-id", 2)).toEqual({ status: "type" });
  expect(web.calls).toEqual([]);
});

test("a photo is released if the size limit or foreground draft recheck fails", async () => {
  const f = await fixture();
  f.choose({ status: "ready", recovered: false, photo: { uri, name: "large.jpg", size: 501, mimeType: "image/jpeg",
    width: 100, height: 100, scope, target: f.draft.target, release: f.release } });
  expect(await f.action("camera", f.verify, f.draft, "form-id", 2)).toEqual({ status: "size" });
  expect(f.calls).toEqual(["camera", "release"]);

  const result = await fixture("ios");
  expect(await result.action("camera", async () => { const write = await result.verify(); result.closeDraft(); return write; },
    result.draft, "form-id", 2)).toEqual({ status: "cancelled" });
  expect(result.calls).toEqual(["camera", "verify", "release"]);
  expect(result.requests).toEqual([]);
});

test("the existing document picker keeps its policy and anonymous upload transport", async () => {
  const f = await fixture();
  expect(await f.action("document", async () => ({ request: (await f.verify()).request }), f.draft, "form-id", 2))
    .toEqual({ status: "uploaded", filename: "selected.jpg", storageUrl: photoUrl });
  expect(f.calls).toEqual(["document", "verify", "write", "release"]);
  expect(f.requests[0][0]).toBe("/api/forms/upload?target=id");
  expect(f.requests[0][1].headers).toBeUndefined();
});

test("interactive respondent attachments remain outside Admin MCP", () => {
  expect(operationsCatalog.find(item => item.source === "app/api/forms/upload/route.ts"))
    .toMatchObject({ actions: ["POST"], status: "excluded", tools: [] });
});

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createIntakeClient } from "@/apps/mobile-native/features/academic/courses/intake-client";
import { createNativeTransport } from "@/apps/mobile-native/network/transport";
import type { DraftDocument } from "@/apps/mobile-native/device/file-controller";
import { intakeLeaseSeconds, issueIntakeProof, verifyIntakeProof } from "@/lib/native/academic/intake-proof";
import { groupPdfIntake, pdfIntakePath, validPdfGroup, type PdfIntakeEntry } from "@/packages/native-parity/academic/courses/intake";

const origin = "https://staging.example.test";
const target = { accountId: "admin-a", sessionId: "session-a", courseId: "course-a" };
const checksum = "a".repeat(64);
const testKey = "synthetic-lease-key";
const requestId = "58afbee0-8a9b-484f-88cf-08e87610312b";
const id = (value: number) => `58afbee0-8a9b-484f-88cf-08e87610312${value}`;
const uploadUrl = `https://neon-storage.example.test/course/intro.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${checksum}`;
const entry = (value: number, size = 8): PdfIntakeEntry => ({
  id: id(value), filename: "intro.pdf", title: "Intro", type: "materi", subcategory: null, year: null, chapterIds: ["chapter-a"],
  checksum, size, keepDuplicate: false, overwrite: null,
});
const document: DraftDocument = {
  name: "intro.pdf", mimeType: "application/pdf", size: 8, uri: "file:///private/intro.pdf",
  scope: { origin, ...target }, target: { locale: "id", route: pdfIntakePath, draftId: "picker" }, release() {},
};

test("native intake proof expires and is bound to exact account, session, course, operation and revision", () => {
  const now = 1_800_000_000_000;
  const proof = issueIntakeProof(testKey, target, "idea", checksum, now);
  expect(verifyIntakeProof(testKey, target, "idea", checksum, proof, now)).toBe(true);
  for (const field of ["accountId", "sessionId", "courseId"] as const) {
    expect(verifyIntakeProof(testKey, { ...target, [field]: "other" }, "idea", checksum, proof, now)).toBe(false);
  }
  expect(verifyIntakeProof(testKey, target, "product", checksum, proof, now)).toBe(false);
  expect(verifyIntakeProof(testKey, target, "idea", "b".repeat(64), proof, now)).toBe(false);
  expect(verifyIntakeProof(testKey, target, "idea", checksum, "9" + proof, now)).toBe(false);
  expect(verifyIntakeProof(testKey, target, "idea", checksum, proof, now + intakeLeaseSeconds * 1000)).toBe(false);
});

test("bounded PDF intake groups by count and bytes and rejects duplicate overwrite targets", () => {
  const megabytes = 1024 * 1024;
  const files = [entry(1, 50 * megabytes), entry(2, 50 * megabytes), entry(3), entry(4), entry(5), entry(6), entry(7)].map(entry => ({ entry }));
  const groups = groupPdfIntake(files);
  expect(groups.map(group => group.length)).toEqual([2, 4, 1]);
  expect(groups.every(group => validPdfGroup(group.map(file => file.entry)))).toBe(true);
  expect(validPdfGroup(files.map(file => file.entry))).toBe(false);
  const overwrite = { id: "catalog-id", revision: checksum };
  expect(validPdfGroup([{ ...entry(1), overwrite }, { ...entry(2), overwrite }])).toBe(false);
});

test("PDF dedup, presign and receipt use web identity, while the provider only receives device bytes", async () => {
  const calls: string[] = [];
  const commitBodies: unknown[] = [];
  const transport = createNativeTransport({ origin, async fetcher(url, request) {
    const path = new URL(url).pathname;
    calls.push(path.split("/").at(-1)!);
    const headers = new Headers(request.headers);
    expect(headers.get("cookie")).toBe("session=fixture");
    expect(headers.get("x-native-intake-account")).toBe(target.accountId);
    expect(headers.get("x-native-intake-session")).toBe(target.sessionId);
    expect(headers.get("x-native-intake-course")).toBe(target.courseId);
    const body = JSON.parse(request.body as string);
    if (path.endsWith("/check-duplicates")) return Response.json({ duplicates: { [checksum]: { materialId: "catalog-id", title: "Duplikat", revision: checksum } } });
    if (path.endsWith("/presign")) return Response.json({ data: [{ id: id(1), uploadUrl, proof: "fixture-proof" }] });
    commitBodies.push(body);
    if (commitBodies.length === 1) throw new Error("Connection interrupted after dispatch");
    return Response.json({ id: requestId, created: 1, updated: 0 }, { status: 201 });
  } });
  const session = transport.setSession({ origin, ...target, readCookie: () => "session=fixture" });
  const use = createIntakeClient({ session, courseId: target.courseId, signal: new AbortController().signal, current: () => true }, {
    assertFile: file => expect(file).toBe(document),
    async put(url, file, signal) {
      calls.push("provider-put");
      expect(url).toBe(uploadUrl);
      expect(file).toBe(document);
      expect(signal.aborted).toBe(false);
    },
    form() { throw new Error("Unexpected multipart"); },
  });
  expect((await use.findDuplicates([checksum, checksum]))[checksum]?.materialId).toBe("catalog-id");
  const prepared = await use.preparePdfGroup([{ entry: entry(1), document }], requestId);
  await expect(prepared.commit()).rejects.toThrow();
  await expect(prepared.commit()).resolves.toEqual({ id: requestId, created: 1, updated: 0 });
  expect(calls).toEqual(["check-duplicates", "presign", "provider-put", "commit", "commit"]);
  expect(commitBodies[0]).toEqual(commitBodies[1]);
});

test("PDF does not send bytes to unsigned storage or commit after switching accounts", async () => {
  let dispatched = 0;
  let uploaded = 0;
  let url = "https://storage.example.test/plain.pdf";
  const transport = createNativeTransport({ origin, async fetcher() {
    dispatched++;
    return Response.json({ data: [{ id: id(1), uploadUrl: url, proof: "proof" }] });
  } });
  const credentials = { origin, ...target, readCookie: () => "session=fixture" };
  const session = transport.setSession(credentials);
  const use = createIntakeClient({ session, courseId: target.courseId, signal: new AbortController().signal, current: () => true }, {
    assertFile() {},
    async put() { uploaded++; },
    form() { throw new Error("Unexpected multipart"); },
  });
  await expect(use.preparePdfGroup([{ entry: entry(1), document }], requestId)).rejects.toThrow();
  expect(uploaded).toBe(0);
  url = uploadUrl;
  const prepared = await use.preparePdfGroup([{ entry: entry(1), document }], requestId);
  transport.setSession({ ...credentials, sessionId: "different-session" });
  await expect(prepared.commit()).rejects.toThrow();
  expect(dispatched).toBe(2);
  expect(uploaded).toBe(1);
});

test("Idea and Product ZIP stage uses protected web multipart only after a successful preview", async () => {
  const requests: string[][] = [];
  const transport = createNativeTransport({ origin, async fetcher(url, request) {
    const form = request.body as FormData;
    const intent = String(form.get("intent"));
    const kind = new URL(url).pathname.split("/").at(-1)!;
    requests.push([kind, intent, String(form.get("proof"))]);
    expect(new Headers(request.headers).get("x-native-intake-course")).toBe(target.courseId);
    expect(form.get("file")).toBeInstanceOf(File);
    return intent === "preview" ? Response.json({
      persisted: false, bundleId: "bundle-a", schemaVersion: kind + "-bundle.v3", checksum, titles: ["Satu"], total: 1, proof: kind + "-proof",
    }) : Response.json({ result: { importId: kind + "-import" } });
  } });
  const session = transport.setSession({ origin, ...target, readCookie: () => "session=fixture" });
  const use = createIntakeClient({ session, courseId: target.courseId, signal: new AbortController().signal, current: () => true }, {
    assertFile() {},
    async put() { throw new Error("ZIP must use web multipart"); },
    form() {
      const form = new FormData();
      form.append("file", new File([Uint8Array.of(80, 75, 3, 4)], "bundle.zip", { type: "application/zip" }));
      return form;
    },
  });
  for (const kind of ["idea", "product"] as const) {
    expect(await use.stageBundle(kind, document, await use.previewBundle(kind, document))).toBe(kind + "-import");
  }
  expect(requests).toEqual([["idea", "preview", "null"], ["idea", "stage", "idea-proof"],
    ["product", "preview", "null"], ["product", "stage", "product-proof"]]);
});

test("protected Expo course documents and review mount the live intake controls", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const live = read("apps/mobile-native/features/academic/courses/live-sections.tsx");
  expect(live).toContain("data.pdfUpload && data.chapters.length ? <LivePdfIntake");
  expect(live).toContain("data.bundleUpload?.[tab] ? <LiveBundleIntake");
  const courseRead = read("lib/native/academic/course-section-reads.ts");
  expect(courseRead).toContain('identity.status === "active" && Boolean(identity.legacyId)');
  expect(courseRead).toContain('identity.status === "active" && workspace.ideaEnabled');
  expect(courseRead).toContain('identity.status === "active" && workspace.productEnabled');
  for (const path of ["check-duplicates", "presign", "commit"]) {
    expect(read("app/api/admin/course-materials/batch/" + path + "/route.ts")).toContain("handleNativeCoursePdfIntake(req");
  }
});

test("the Admin route retains a same-session file chooser while foreground access is rechecked", () => {
  const route = readFileSync("apps/mobile-native/routing/ProductRoute.tsx", "utf8");
  expect(route).toContain('pattern === "/admin/courses/[slug]/documents" || pattern === "/admin/courses/[slug]/review"');
  expect(route).toContain("|| tutor || adminCourseFiles");
  const intake = readFileSync("apps/mobile-native/features/academic/courses/intake-scope.ts", "utf8");
  expect(intake).toContain("useNativeRouteAccountContext(true)");
  expect(intake).toContain("ready: () => !retaining && canInteract()");
});

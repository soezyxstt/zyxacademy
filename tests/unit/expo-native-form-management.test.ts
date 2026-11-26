import { expect, test } from "bun:test";
import { createFormImagePicker } from "../../apps/mobile-native/features/operations/management/form-image-upload";
import { createManagementHttpClient } from "../../apps/mobile-native/features/operations/management/http";
import type { NativeSessionTransport } from "../../apps/mobile-native/network/transport";
import { buildFormSpreadsheetPayload } from "../../lib/forms/spreadsheet-payload";

test("form sheet export keeps answer slots, excludes non-questions and formats existing responses", () => {
  const form = { id: "form-a", title: "Survey", slug: "survey", questions: [
    { type: "SECTION", title: "Intro" }, { type: "RADIO", title: "Pilihan" },
    { type: "STATEMENT", title: "Sela" }, { type: "FILE_UPLOAD", title: "File" },
    { type: "GRID_CHECKBOX", title: "Grid" },
  ] };
  const rows = [{ id: "response-a", responderEmail: null, submittedAt: new Date(0),
    answers: { "1": "A", "3": "/api/storage/file/forms/survey/question-4/report.pdf", Grid: { subject: ["A", "B"] } } }];
  expect(buildFormSpreadsheetPayload(form, rows, "https://example.test")).toEqual({
    entityType: "form", entityId: "form-a", folderSubpath: "forms/survey", title: "form-survey-responses",
    headers: ["Response ID", "Submitted At", "Responder Email", "1. Pilihan", "2. File", "3. Grid"],
    rows: [["response-a", new Date(0).toISOString(), "Anonim", "A", "https://example.test/api/storage/file/forms/survey/question-4/report.pdf", "subject: A, B"]],
  });
});

test("native export sends only the form and confirmed revision, then accepts its own Sheets receipt", async () => {
  const revision = "a".repeat(64);
  const actions: unknown[] = [];
  const url = "https://docs.google.com/spreadsheets/d/sheet-id/edit";
  let response: unknown = { id: "different-form", formSheet: { kind: "saved", url, created: false, sharingIncomplete: false } };
  const client = createManagementHttpClient({
    userId: "admin", sessionId: "original",
    async request(path, init) {
      expect(path).toBe("/api/native/operations/management");
      expect(new Headers(init.headers).get("x-native-operations-session-id")).toBe("original");
      expect(new Headers(init.headers).get("x-native-operations-request-key")).toBe("request-id-123456");
      actions.push(JSON.parse(String(init.body)));
      return Object.assign(Response.json(response), { dispose() {} });
    },
  });
  const command = { type: "form.export", id: "form-a", confirmedRevision: revision } as const;
  await expect(client.mutate(command, "request-id-123456")).rejects.toMatchObject({ code: "uncertain" });
  response = { id: "form-a", formSheet: { kind: "confirm", revision, conflicts: ["manual_columns"] } };
  expect((await client.mutate(command, "request-id-123456")).formSheet).toEqual((response as { formSheet: unknown }).formSheet);
  response = { id: "form-a", formSheet: { kind: "saved", url: "https://other.example/spreadsheets/d/sheet-id/edit", created: false, sharingIncomplete: false } };
  await expect(client.mutate(command, "request-id-123456")).rejects.toMatchObject({ code: "uncertain" });
  response = { id: "form-a", formSheet: { kind: "saved", url, created: false, sharingIncomplete: true } };
  expect((await client.mutate(command, "request-id-123456")).formSheet).toEqual((response as { formSheet: unknown }).formSheet);
  expect(actions).toEqual(Array(4).fill(command));
});

test("form image upload uses signed-in native session and cannot carry a late result to another question", async () => {
  const scope = { origin: "https://example.test", accountId: "admin", sessionId: "original" };
  const signal = new AbortController().signal;
  const draft = { route: "/admin/forms", locale: "id", draftId: "form-a:0" } as const;
  let current = true;
  let calls = 0;
  let releases = 0;
  const session = { scope, signal, isCurrent: () => current, async request(path, init) {
    expect(path).toBe("/api/admin/custom-forms/image");
    expect(init?.requiredRole).toBe("admin");
    expect(new Headers(init?.headers).get("origin")).toBe(scope.origin);
    expect(new Headers(init?.headers).get("x-native-operations-session-id")).toBe(scope.sessionId);
    const body = init?.body as FormData;
    expect(body.get("questionNumber")).toBe("1");
    expect(body.get("formTitle")).toBe("Survey");
    calls++;
    if (calls === 2) current = false;
    return Object.assign(Response.json({ success: true, key: "forms/survey/question-1/1-hash-image.gif" }), { dispose() {} });
  } } as NativeSessionTransport;
  const upload = createFormImagePicker(session, { async pick({ policy }) {
    expect(policy.mimeTypes).toContain("image/gif");
    expect(policy.mimeTypes).not.toContain("application/pdf");
    return { status: "ready", document: { scope, target: draft, name: "image.gif", mimeType: "image/gif", uri: "file://test", size: 7,
      release() { releases++; } } };
  }, multipart() { const form = new FormData(); form.append("file", new File(["GIF89a"], "image.gif")); return form; } });
  const input = { draft, signal, isCurrent: () => current, formTitle: "Survey", questionIndex: 0 };
  expect(await upload(input)).toEqual({ status: "uploaded", url: "/api/storage/file/forms/survey/question-1/1-hash-image.gif" });
  expect(await upload(input)).toEqual({ status: "cancelled" });
  expect(calls).toBe(2);
  expect(releases).toBe(2);
});

import { describe, expect, test } from "bun:test";
import { buildFormSteps } from "../../packages/forms/presentation";
import { publicFormCases, publicFormFixtureEnvelope } from "../../packages/forms/parity-cases";
import { createFormSubmissionGate, loadPublicForm, submitPublicForm, uploadPublicForm, type FormRequest } from "../../apps/mobile-native/features/public-forms/client";
import {
  fieldsOnStep, formIdentifier, formUploadPolicy, otherOption, parsePublicForm, publicFormPath,
  questionIssue, submitFormBody, validFormEmail, type PublicQuestion,
} from "../../apps/mobile-native/features/public-forms/model";
import { formClosureMessage } from "../../apps/mobile-native/features/public-forms/copy";

const signal = new AbortController().signal;
const origin = "https://staging.zyxacademy.com";
const formResult = parsePublicForm(publicFormFixtureEnvelope("forms-ready"), "full");
if (formResult.status !== "ready") throw new Error("Invalid ready form fixture.");
const form = formResult.form;

function reply(value: unknown, status = 200) {
  const response = Response.json(value, { status });
  return { status, headers: response.headers, body: response.body, dispose: () => { void response.body?.cancel(); } };
}

describe("Public Expo forms", () => {
  test("shared form cases retain route identity and anonymous states", async () => {
    for (const [key, value] of Object.entries(publicFormCases)) {
      const fixture = publicFormFixtureEnvelope(key as keyof typeof publicFormCases);
      const request: FormRequest = async (path, options) => {
        expect(path).toBe(`/api/forms/${value.id}${value.entry === "short" ? "?entry=short" : ""}`);
        expect(options.method).toBe("GET");
        return reply(fixture, value.status === "missing" ? 404 : 200);
      };
      expect((await loadPublicForm(request, value.entry, value.id, signal)).status).toBe(value.status);
    }
  });

  test("native short links accept only HTTPS Google Meet destinations", () => {
    expect(parsePublicForm({ success: true, destination: "meeting", meetingUri: "https://meet.google.com/my-room" }, "short"))
      .toEqual({ status: "meeting", url: "https://meet.google.com/my-room" });
    for (const meetingUri of ["https://meet.google.com.evil.example/room", "https://me@meet.google.com/room", "http://meet.google.com/room", "javascript:alert(1)"]) {
      expect(parsePublicForm({ success: true, destination: "meeting", meetingUri }, "short")).toEqual({ status: "meeting", url: null });
    }
    for (const id of ["/escape", "..", ["value"], "abc\\def", "a\u0000b"]) expect(formIdentifier(id)).toBeNull();
    expect(publicFormPath("short", "an alias?")).toBe("/f/an%20alias%3F");
  });

  test("rejects malformed responses and reports server scheduling in both languages", async () => {
    const noJson: FormRequest = async () => ({ status: 200, headers: new Headers(), body: null, dispose: () => {} });
    expect(await loadPublicForm(noJson, "full", "sample", signal)).toEqual({ status: "error" });
    expect(parsePublicForm({ success: true, form: { ...form, questions: [{ type: "NEW", title: "Future question" }] } }, "full"))
      .toEqual({ status: "unsupported" });
    const closure = { kind: "scheduled", opensAt: "2026-12-01T01:30:00Z" } as const;
    expect(formClosureMessage("en", closure)).toMatch(/opens on .*8:30.*WIB/);
    expect(formClosureMessage("id", closure)).toMatch(/dibuka pada .*08.30.*WIB/);
  });

  test("preserves original question indices and validates required grids, temporal values, and Other", () => {
    const grid: PublicQuestion = { type: "GRID_CHECKBOX", title: "Grid", required: true, gridRows: ["A", "B"] };
    const questions: PublicQuestion[] = [{ type: "TEXT", title: "Name" }, { type: "SECTION", title: "Second" }, grid];
    const steps = buildFormSteps(questions, "section", true);
    expect(steps.map(fieldsOnStep)).toEqual([
      { indices: [0], email: true, cover: true }, { indices: [1, 2], email: false, cover: false },
    ]);
    expect(questionIssue(grid, { A: ["one"] }, "")).toBe("required");
    expect(questionIssue(grid, { A: ["one"], B: ["two"] }, "")).toBeNull();
    expect(questionIssue({ type: "DATE", title: "Date", required: true }, "--", "")).toBe("required");
    expect(questionIssue({ type: "DATE", title: "Date" }, "2026-02-31", "")).toBe("date");
    expect(questionIssue({ type: "TIME", title: "Time" }, "25:00", "")).toBe("time");
    expect(questionIssue({ type: "TIME", title: "Time" }, "23:59", "")).toBeNull();
    expect(questionIssue({ type: "CHECKBOX", title: "Other" }, ["a", otherOption], "  ")).toBe("other");
    expect(validFormEmail(" user@example.com ")).toBe(true);
  });

  test("serializes typed answers, uploaded URLs, and input-mode email only", () => {
    const upload = "/api/storage/file/forms/tutorial/soal-02/result.pdf";
    const draft = { answers: { 0: ["a", otherOption], 1: upload, 2: "skip", 3: "--" },
      other: { 0: " custom " }, email: " email@example.com " };
    const fixture = { ...form, questions: [
      { type: "CHECKBOX", title: "Choice" }, { type: "FILE_UPLOAD", title: "File" },
      { type: "STATEMENT", title: "Notice" }, { type: "DATE", title: "Date" },
    ] as PublicQuestion[] };
    expect(submitFormBody(fixture, draft)).toEqual({ answers: { 0: ["a", "custom"], 1: upload }, responderEmail: undefined });
    expect(submitFormBody({ ...fixture, settings: { ...fixture.settings, collectEmail: "input" } }, draft).responderEmail).toBe("email@example.com");
  });

  test("never retries an ambiguous response and distinguishes authoritative rejections", async () => {
    let writes = 0;
    const draft = { answers: { 0: "Student" }, other: {}, email: "" };
    const uncertain: FormRequest = async (path, options) => {
      writes++;
      expect(path).toBe(`/api/forms/${form.id}?target=id`);
      expect(options.method).toBe("POST");
      expect(options.retry).toBeUndefined();
      return reply({ error: "transient" }, 500);
    };
    expect(await submitPublicForm(uncertain, form, draft, signal)).toEqual({ status: "uncertain" });
    expect(writes).toBe(1);
    expect(await submitPublicForm(async () => reply({ error: "sign in" }, 401), form, draft, signal)).toEqual({ status: "login" });
    expect(await submitPublicForm(async () => reply({ error: "Anda sudah pernah mengisi formulir ini (Dibatasi 1 kali pengisian)." }, 403),
      form, draft, signal)).toEqual({ status: "already-sent" });
    expect(await submitPublicForm(async () => reply({ success: true, submission: { id: "confirmed" } }),
      form, draft, signal)).toEqual({ status: "sent" });
  });

  test("retains a shared attempt after remount and permits another response only after confirmed success", async () => {
    let dispatched = 0;
    const gate = createFormSubmissionGate();
    const unknown = async () => { dispatched++; return { status: "uncertain" } as const; };
    const known = async () => { dispatched++; return { status: "sent" } as const; };
    const first = gate.send("anonymous", unknown);
    expect(gate.send("anonymous", known)).toBe(first);
    expect(await first).toEqual({ status: "uncertain" });
    gate.fillAgain("anonymous");
    expect(await gate.send("anonymous", known)).toEqual({ status: "uncertain" });
    expect(dispatched).toBe(1);
    expect(await gate.send("other", known)).toEqual({ status: "sent" });
    gate.fillAgain("other");
    await Promise.resolve();
    expect(await gate.send("other", known)).toEqual({ status: "sent" });
    expect(dispatched).toBe(3);
  });

  test("uses form MIME and size policy and accepts only same-origin form storage URLs", async () => {
    expect(formUploadPolicy({ type: "FILE_UPLOAD", title: "Evidence", allowedFileTypes: ["application/pdf"], maxFileSizeMb: 100 }))
      .toEqual({ mimeTypes: ["application/pdf"], maxMb: 50, maxBytes: 50 * 1024 * 1024 });
    const body = new FormData();
    const validUrl = "/api/storage/file/forms/tutorial/soal-01/name.pdf";
    const request: FormRequest = async (path, options) => {
      expect(path).toBe("/api/forms/upload?target=id");
      expect(options.body).toBe(body);
      return reply({ success: true, url: validUrl });
    };
    expect(await uploadPublicForm(request, body, signal, origin)).toEqual({ status: "uploaded", storageUrl: validUrl });
    expect(await uploadPublicForm(async () => reply({ success: true, url: "https://elsewhere.example" + validUrl }), body, signal, origin))
      .toEqual({ status: "retry" });
  });
});

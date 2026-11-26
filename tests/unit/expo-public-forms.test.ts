import { describe, expect, test } from "bun:test";
import { createNativeSessionApi } from "../../apps/mobile-native/auth/session-api";
import { createNativeSessionController } from "../../apps/mobile-native/auth/session-controller";
import { formDraftOwner, formWriteAccess, recoverFormWriteSession } from "../../apps/mobile-native/features/public-forms/session";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { buildFormSteps, formScaleValues } from "../../packages/forms/presentation";
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

async function formSessionHarness() {
  const initialTime = Date.parse("2026-11-26T09:00:00Z");
  let now = initialTime;
  const identity = { accountId: "student", sessionId: "session", expiresAt: initialTime + 60_000 };
  const cookie = `__Secure-better-auth.session_token=opaque.${"A".repeat(43)}%3D`;
  const headers = new Headers({ "Set-Cookie": `${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax` });
  let current = identity;
  let stored: string | null = JSON.stringify({ origin, cookie, status: "active", ...identity });
  let reads = 0;
  let writes = 0;
  let availability: "active" | "revoked" | "offline" = "active";
  const api = createNativeSessionApi(origin, async (_url, init) => {
    if (init.method === "POST") {
      availability = "revoked";
      return Response.json({ success: true });
    }
    reads++;
    if (availability === "offline") throw new TypeError("Network unavailable");
    if (availability === "revoked") return Response.json(null);
    const { accountId, sessionId, expiresAt } = current;
    return Response.json({ user: { id: accountId }, session: { id: sessionId, userId: accountId, expiresAt: new Date(expiresAt).toISOString() } });
  });
  const dataTransport = createNativeTransport({ origin, fetcher: async () => {
    writes++;
    return Response.json({ error: "Session required" }, { status: 401 });
  } });
  const session = createNativeSessionController({ origin, api, dataTransport, now: () => now, store: {
    read: async () => stored,
    write: async value => { stored = value; },
    remove: async () => { stored = null; },
  } });
  await session.refresh();
  const transport = session.getSnapshot().transport;
  if (!transport) throw new Error("Expected a verified session");
  return {
    session, transport,
    counts: () => ({ reads, writes }),
    expire: () => { now = identity.expiresAt; },
    setAvailability: (value: typeof availability) => { availability = value; },
    switchAccount: async () => {
      await session.logout();
      current = { ...identity, accountId: "other-student", sessionId: "other-session" };
      availability = "active";
      await session.acceptLogin(headers, current.accountId);
    },
  };
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

  test("keeps the draft owner through foreground checks and transport replacement, but blocks writes until verified", () => {
    const network = createNativeTransport({ origin, fetcher: async () => new Response() });
    const scope = { origin, accountId: "user", sessionId: "session" };
    const transport = network.setSession({ ...scope, readCookie: () => "session=example" });
    const state = { status: "signed-in", expiresAt: 100_000, ...scope } as const;
    const verified = { state, transport, revalidating: false };
    const owner = formDraftOwner(verified, null);
    const waiting = { ...verified, revalidating: true };
    expect(formDraftOwner(waiting, owner)).toBe(owner);
    expect(formWriteAccess(waiting, owner)).toBeNull();
    expect(formWriteAccess(verified, owner)).toBe(transport);

    network.clearSession();
    const unavailable = { state: { status: "unavailable", offlineIdentity: state } as const, transport: null, revalidating: false };
    expect(formDraftOwner(unavailable, owner)).toBe(owner);
    expect(formWriteAccess(unavailable, owner)).toBeNull();
    expect(formWriteAccess(verified, owner)).toBeNull();
    const restored = { ...verified, transport: network.setSession({ ...scope, readCookie: () => "session=example" }) };
    expect(formDraftOwner(restored, owner)).toBe(owner);
    expect(formWriteAccess(restored, owner)).toBe(restored.transport);

    const changedScope = { ...scope, sessionId: "replacement" };
    const changed = { state: { ...state, ...changedScope }, revalidating: false,
      transport: network.setSession({ ...changedScope, readCookie: () => "session=replacement" }) };
    expect(formDraftOwner(changed, owner)).toEqual(changedScope);
    expect(formWriteAccess(changed, owner)).toBeNull();
    const signedOut = { state: { status: "signed-out" } as const, transport: null, revalidating: false };
    expect(formDraftOwner(signedOut, owner)).toBe("anonymous");
    expect(formWriteAccess(signedOut, owner)).toBeNull();
    expect(formWriteAccess(signedOut, "anonymous")).toBe("anonymous");
  });

  test("signed submit and upload 401s recheck the authoritative session once per attempt without resending", async () => {
    const { session, transport, counts, setAvailability } = await formSessionHarness();
    const owner = transport.scope;
    const draft = { answers: { 0: "Keep my answer" }, other: {}, email: "" };
    expect(await submitPublicForm(transport.request, form, draft, signal, owner)).toEqual({ status: "credential-rejected" });
    expect(await recoverFormWriteSession(session, owner, signal)).toEqual({ status: "session-retry" });
    expect(formDraftOwner(session.getSnapshot(), owner)).toBe(owner);
    expect(counts()).toEqual({ reads: 2, writes: 1 });

    expect(await uploadPublicForm(transport.request, new FormData(), signal, origin, owner))
      .toEqual({ status: "credential-rejected" });
    setAvailability("offline");
    expect(await recoverFormWriteSession(session, owner, signal)).toEqual({ status: "session-pending" });
    expect(session.getSnapshot().state.status).toBe("unavailable");
    expect(formDraftOwner(session.getSnapshot(), owner)).toBe(owner);
    expect(counts()).toEqual({ reads: 3, writes: 2 });
  });

  test("rejected credentials enter signed-out only when the session is revoked or expires", async () => {
    for (const expired of [false, true]) {
      const { session, transport, counts, expire, setAvailability } = await formSessionHarness();
      const owner = transport.scope;
      if (expired) expire();
      expect(await submitPublicForm(transport.request, form, { answers: {}, other: {}, email: "" }, signal, owner))
        .toEqual({ status: "credential-rejected" });
      setAvailability("revoked");
      expect(await recoverFormWriteSession(session, owner, signal)).toEqual({ status: "session-pending" });
      expect(session.getSnapshot().state.status).toBe("signed-out");
      expect(formDraftOwner(session.getSnapshot(), owner)).toBe("anonymous");
      expect(counts()).toEqual(expired ? { reads: 1, writes: 0 } : { reads: 2, writes: 1 });
    }
  });

  test("late credential rejection from a retired or closed draft leaves the next account alone", async () => {
    const { session, transport, counts, switchAccount } = await formSessionHarness();
    const owner = transport.scope;
    expect(await uploadPublicForm(transport.request, new FormData(), signal, origin, owner))
      .toEqual({ status: "credential-rejected" });
    const closed = new AbortController();
    closed.abort();
    expect(await recoverFormWriteSession(session, owner, closed.signal)).toEqual({ status: "session-pending" });
    expect(counts()).toEqual({ reads: 1, writes: 1 });
    await switchAccount();
    expect(await recoverFormWriteSession(session, owner, signal)).toEqual({ status: "session-pending" });
    expect(session.getSnapshot().state).toMatchObject({ status: "signed-in", accountId: "other-student" });
    expect(counts()).toEqual({ reads: 3, writes: 1 });
  });

  test("preserves authored scale endpoints while retaining the five-level default", () => {
    const parsed = parsePublicForm({ success: true, form: { ...form, questions: [
      { type: "SCALE", title: "Scale", scaleLow: 0, scaleHigh: 10 },
      { type: "SCALE", title: "Short scale", scaleLow: 1, scaleHigh: 2 },
      { type: "SCALE", title: "Legacy scale" },
    ] } }, "full");
    expect(parsed.status === "ready" && parsed.form.questions.map(formScaleValues)).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2], [1, 2, 3, 4, 5],
    ]);
  });

  test("binds both signed requests to the supplied verified scope and leaves anonymous headers absent", async () => {
    const identity = { accountId: "account", sessionId: "session" };
    const draft = { answers: {}, email: "", other: {} };
    const body = new FormData();
    const request: FormRequest = async (path, options) => {
      expect(path).toEndWith("?target=id&respondent=session");
      const headers = new Headers(options.headers);
      expect(headers.get("X-Zyx-Form-Account")).toBe(identity.accountId);
      expect(headers.get("X-Zyx-Form-Session")).toBe(identity.sessionId);
      return reply({ success: true, url: "/api/storage/file/forms/upload.pdf" });
    };
    expect(await submitPublicForm(request, form, draft, signal, identity)).toEqual({ status: "sent" });
    expect(await uploadPublicForm(request, body, signal, origin, identity)).toMatchObject({ status: "uploaded" });
    await submitPublicForm(async (_path, options) => {
      expect(new Headers(options.headers).has("X-Zyx-Form-Session")).toBe(false);
      return reply({ success: true });
    }, form, draft, signal);
  });

  test("uses form MIME and size policy and accepts only same-origin form storage URLs", async () => {
    expect(formUploadPolicy({ type: "FILE_UPLOAD", title: "Evidence", allowedFileTypes: ["application/pdf"], maxFileSizeMb: 100 }))
      .toEqual({ mimeTypes: ["application/pdf"], maxMb: 10, authoredMaxMb: 50, maxBytes: 10 * 1024 * 1024 });
    expect(formUploadPolicy({ type: "FILE_UPLOAD", title: "Evidence", maxFileSizeMb: 5 })).toMatchObject({ maxMb: 5, authoredMaxMb: 5 });
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

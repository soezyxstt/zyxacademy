import assert from "node:assert/strict";
import test from "node:test";
import { createNativeTransport } from "../../../apps/mobile-native/network/transport";
import { bindAcademicSession } from "../../../apps/mobile-native/features/academic/session-transport";
import { createAcademicClient } from "../../../apps/mobile-native/features/academic/client";

test("navigation shares a client only inside its active origin, session and locale", async () => {
  const calls: RequestInit[] = [];
  const origin = "https://academic.invalid";
  const manager = createNativeTransport({ origin, fetcher: async (_url, init) => {
    calls.push(init);
    return Response.json({ courses: [] });
  } });
  const auth = (sessionId: string) => manager.setSession({
    accountId: "tutor", origin, sessionId, readCookie: () => "fixture=session",
  });
  const first = auth("first");
  const tr = bindAcademicSession(first, "id");
  assert.equal(bindAcademicSession(first, "id"), tr);
  assert.notEqual(tr, bindAcademicSession(first, "en"));
  assert.equal(createAcademicClient(tr), createAcademicClient(bindAcademicSession(first, "id")));
  const controller = new AbortController();
  const response = await tr.command!("/api/native/academic/test",
    { method: "POST", requestId: "fixture-request", body: { id: 1 } }, controller.signal);
  assert.equal(new Headers(calls[0].headers).get("Origin"), origin);
  assert.equal(new Headers(calls[0].headers).get("Idempotency-Key"), "fixture-request");
  assert.equal(calls.length, 1);
  const next = bindAcademicSession(auth("second"), "id");
  assert.notEqual(tr, next);
  assert.notEqual(createAcademicClient(tr), createAcademicClient(next));
  await assert.rejects(response.json(), { name: "AbortError" });
  await assert.rejects(tr.get("/api/native/academic/test", controller.signal), { name: "AbortError" });
});

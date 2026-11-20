import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { discussionViewerState } from "@/components/discussions/discussion-adapter";

type Slot = { value?: any; set?: (next: any) => void; deps?: unknown[]; cleanup?: () => void; callback?: (...args: any[]) => any };

function harness() {
 const slots: Slot[] = [], effects: Array<() => void> = [], revoked: string[] = [];
 let index = 0, session: { id?: string; pending: boolean } = { id: "alice", pending: false };
 const slot = () => slots[index++] ?? (slots[index - 1] = {});
 const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((value, i) => value === b[i]);
 const useState = (initial: unknown) => {
  const entry = slot();
  if (!entry.set) {
   entry.value = initial;
   entry.set = next => { entry.value = typeof next === "function" ? next(entry.value) : next; };
  }
  return [entry.value, entry.set];
 };
 const useRef = (initial: unknown) => { const entry = slot(); return entry.value ?? (entry.value = { current: initial }); };
 const useCallback = (callback: (...args: any[]) => any, deps: unknown[]) => {
  const entry = slot();
  if (!same(entry.deps, deps)) { entry.deps = deps; entry.callback = callback; }
  return entry.callback;
 };
 const useEffect = (effect: () => void | (() => void), deps: unknown[]) => {
  const entry = slot();
  if (same(entry.deps, deps)) return;
  entry.deps = deps;
  effects.push(() => { entry.cleanup?.(); entry.cleanup = effect() || undefined; });
 };
 const ready = () => null;
 const source = readFileSync("components/discussions/discussion-session-guard.tsx", "utf8");
 const start = source.indexOf("export function useRetainedDiscussionDrafts(");
 const end = source.length;
 const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 const exports: Record<string, any> = {};
 runInNewContext(code, { exports, useState, useRef, useCallback, useEffect, discussionViewerState,
  useTranslations: () => (key: string) => key,
  useSession: () => ({ data: session.id ? { user: { id: session.id } } : null, isPending: session.pending }),
  useRouter: () => ({ refresh: () => {} }), DiscussionClientReady: ready, Button: () => null,
  URL: { revokeObjectURL: (url: string) => revoked.push(url) },
  require: (name: string) => { if (name !== "react/jsx-runtime") throw new Error(name); return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) }; },
 });
 const render = (next: typeof session) => {
  session = next; index = 0;
  const result = exports.DiscussionSessionGuard({ viewerId: "alice", sessionId: session.id, pending: session.pending, children: (draftState: unknown) => ({ type: ready, props: { draftState } }) });
  while (effects.length) effects.shift()!();
  return result;
 };
 return { render, ready, revoked, slots, unmount: () => slots.forEach(entry => entry.cleanup?.()) };
}

test("temporary absence and unverified sessions retain the same user's text, file bytes, and request identity", async () => {
 const h = harness();
 const first = h.render({ id: "alice", pending: false });
 expect(first.type).toBe(h.ready);
 const file = new File(["image bytes"], "problem.png", { type: "image/png" });
 const pendingSubmission = { viewerId: "alice", channelId: "course", questionId: "q", body: "unfinished answer", attachments: [], mentionIds: [], askZyra: false, requestId: "request-1" };
 first.props.draftState.drafts[1]({ "question:q": { body: "unfinished answer", images: [{ id: "image", file, previewUrl: "blob:one", status: "error" }],
  mentionedPeople: [], sending: false, error: "unknown", requestId: "request-1", requestFingerprint: "fingerprint", pendingSubmission } });
 const channel = { id: "course", name: "Matematika", kind: "course", unreadCount: 0, muted: false, canCreate: true };
 first.props.draftState.newOpen[1](true);
 first.props.draftState.newChannel[1](channel);
 const forward = { targetChannel: { id: "course", name: "Course" }, targetQuestion: "destination", targetTitle: "Destination", requestId: "forward-request", status: "unknown" };
 first.props.draftState.forwardDrafts[1]({ source: forward });
 expect(h.render({ pending: false }).props.children[0].props.children).toBe("viewerExpired");
 expect(h.render({ id: "alice", pending: true }).props.children).toBe("viewerLoading");
 expect(h.revoked).toEqual([]);
 const restored = h.render({ id: "alice", pending: false });
 const draft = restored.props.draftState.drafts[0]["question:q"];
 expect(draft).toMatchObject({ body: "unfinished answer", requestId: "request-1", requestFingerprint: "fingerprint" });
 expect(draft.error).toBe("unknown");
 expect(draft.pendingSubmission).toBe(pendingSubmission);
 expect(draft.images[0].file).toBe(file);
 expect(await draft.images[0].file.text()).toBe("image bytes");
 expect(restored.props.draftState.newOpen[0]).toBe(true);
 expect(restored.props.draftState.newChannel[0]).toEqual(channel);
 expect(restored.props.draftState.forwardDrafts[0].source).toEqual(forward);
 restored.props.draftState.forwardDrafts[1]((current: any) => ({ ...current, source: { ...current.source, status: "replay_unverified", replayTarget: { threadId: "destination", messageId: "existing" } } }));
 expect(h.render({ id: "alice", pending: false }).props.draftState.forwardDrafts[0].source).toMatchObject({ requestId: "forward-request", targetQuestion: "destination", status: "replay_unverified" });
 restored.props.draftState.forwardDrafts[1]({});
 expect(h.render({ id: "alice", pending: false }).props.draftState.forwardDrafts[0]).toEqual({});
 h.unmount();
 expect(h.revoked).toEqual(["blob:one"]);
});

test("a different verified account purges and revokes drafts, and stale callbacks cannot revive them", () => {
 const h = harness();
 const first = h.render({ id: "alice", pending: false });
 const setDrafts = first.props.draftState.drafts[1];
 const setForwardDrafts = first.props.draftState.forwardDrafts[1];
 setDrafts({ new: { body: "private", images: [{ file: new File(["x"], "x.png"), previewUrl: "blob:private" }], mentionedPeople: [], sending: false, error: null } });
 setForwardDrafts({ source: { targetChannel: { id: "private" }, targetQuestion: "destination", requestId: "old", status: "sending" } });
 h.render({ id: "alice", pending: false });
 expect(h.render({ id: "bob", pending: true }).props.children).toBe("viewerLoading");
 expect(h.revoked).toEqual([]);
 const changed = h.render({ id: "bob", pending: false });
 expect(changed.props.role).toBe("alert");
 expect(h.revoked).toEqual(["blob:private"]);
 setDrafts({ new: { body: "stale", images: [], mentionedPeople: [], sending: false, error: null } });
 setForwardDrafts((current: any) => ({ ...current, source: { requestId: "old", status: "unknown" } }));
 const returned = h.render({ id: "alice", pending: false });
 expect(returned.props.role).toBe("alert");
 expect(h.slots[1].value).toEqual({});
 expect(h.slots[5].value).toEqual({});
 h.unmount();
 expect(h.revoked).toEqual(["blob:private"]);
});

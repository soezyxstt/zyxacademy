import { retryDiscussionRead, visibleDiscussionReadSnapshot } from "@/components/discussions/discussion-adapter";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("components/discussions/discussion-client.tsx", "utf8");
const start = source.indexOf("export function nextDiscussionReadBatch(");
const end = source.indexOf("\nexport function DiscussionClient", start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports: Record<string, any> = {};
runInNewContext(code, { setTimeout: (fn: () => void) => { fn(); return 0; }, exports });
const next: (observed: Map<number, any>, through: number, snapshot: number, visible?: Set<string>) => any = exports.nextDiscussionReadBatch;
const item = (seq: number, receipt: string) => ({ id: `m${seq}`, seq, revision: 1, receipt });

test("batches visible pages in contiguous order without crossing a receipt boundary", () => {
 const observed = new Map([[3, item(3, "page-2")], [1, item(1, "page-1")], [2, item(2, "page-1")]]);
 const first = next(observed, 0, 3);
 expect(first.throughSeq).toBe(2);
 expect(first.items.map((entry: any) => entry.id)).toEqual(["m1", "m2"]);
 first.items.forEach((entry: any) => observed.delete(entry.seq));
 const second = next(observed, first.throughSeq, 3);
 expect(second).toMatchObject({ throughSeq: 3, receipt: "page-2" });
 expect(second.items.map((entry: any) => entry.id)).toEqual(["m3"]);
});

test("a gap never advances but visible messages and edits are acknowledged independently", () => {
 expect(next(new Map([[450, item(450, "page")]]), 0, 0)).toMatchObject({ throughSeq: 0, items: [{ id: "m450" }] });
 const observed = new Map([[1, { ...item(1, "old-page"), revision: 2 }], [3, item(3, "new-page")]]);
 const edit = next(observed, 2, 3);
 expect(edit).toMatchObject({ throughSeq: 2, receipt: "old-page", items: [{ id: "m1", revision: 2 }] });
 observed.delete(1);
 expect(next(observed, 2, 3)).toMatchObject({ throughSeq: 3, receipt: "new-page" });
 expect(next(observed, 2, 2)).toMatchObject({ throughSeq: 2, items: [{ id: "m3" }] });
});

test("later observations do not cross pending hidden messages and a persisted gap can advance", () => {
 const observed = new Map([[1, item(1, "first")], [2, item(2, "hidden")], [450, item(450, "target")]]);
 expect(next(observed, 0, 2, new Set(["m1", "m450"]))).toMatchObject({ throughSeq: 1, items: [{ id: "m1" }] });
 observed.delete(1);
 expect(next(observed, 1, 2, new Set(["m450"]))).toMatchObject({ throughSeq: 1, items: [{ id: "m450" }] });
 observed.delete(450);
 expect(next(observed, 1, 450, new Set(["m2"]))).toMatchObject({ throughSeq: 450, items: [{ id: "m2" }] });
 expect(next(observed, 1, 450, new Set())).toBeNull();
});

test("explicit retry preserves a failed hidden observation when a later message is visible", () => {
 const state = { through: 0, seen: new Set<number>(), versions: new Map<string, number>() };
 const observedMessages = { current: new Map([[1, item(1, "page")]]) };
 visibleDiscussionReadSnapshot(state, "open", [item(1, "page")], "page");
 const snapshot = visibleDiscussionReadSnapshot(state, "open", [item(2, "page")], "page")!;
 observedMessages.current.set(2, item(2, "page"));
 const handler = source.match(/onRetryRead=\{(\(\) => \{[^}]*\})\}/)?.[1];
 expect(handler).toBeDefined();
 const retry = runInNewContext(`(${handler})`, { observedMessages, setReadError: () => {}, setRetryRead: () => {} });
 retry();
 observedMessages.current.set(2, item(2, "page"));
 const batch = next(observedMessages.current, 0, snapshot.throughSeq, new Set(["m2"]));
 expect(batch).toMatchObject({ throughSeq: 0, items: [{ id: "m2" }] });
 expect(observedMessages.current.has(1)).toBe(true);
 observedMessages.current.delete(2);
 expect(next(observedMessages.current, 0, snapshot.throughSeq, new Set(["m1"])))
  .toMatchObject({ throughSeq: 2, items: [{ id: "m1" }] });
});

test("read acknowledgement retries a transient failure without another observation", async () => {
 let calls = 0;
 expect(await retryDiscussionRead(async () => { if (++calls === 1) throw new Error("temporary"); return 42; }, () => true)).toBe(42);
 expect(calls).toBe(2);
 calls = 0;
 await expect(retryDiscussionRead(async () => { calls++; throw new Error("offline"); }, () => true)).rejects.toThrow("offline");
 expect(calls).toBe(3);
 calls = 0;
 await expect(retryDiscussionRead(async () => { calls++; throw new Error("hidden"); }, () => false)).rejects.toThrow("hidden");
 expect(calls).toBe(1);
}, 15_000);

import { expect, test } from "bun:test";
import { confirmReadBatch, nextReadBatch, visibleHeight, type ReadHistory, type ReadPage } from "../../apps/mobile-native/features/discussions/read-batches";

const page: ReadPage = { receipt: "signed-page", status: "open", throughSeq: 0,
  items: [{ id: "first", seq: 1, revision: 2 }, { id: "second", seq: 2 }, { id: "third", seq: 3 }] };
const history = (): ReadHistory => ({ through: 0, revisions: new Map(), sequences: new Set() });

test("scrolling past a sliver does not acknowledge a row, and tall messages can still be seen", () => {
  const viewport = { y: 100, height: 200 };
  expect(visibleHeight({ y: 298, height: 40 }, viewport)).toBe(false);
  expect(visibleHeight({ y: 280, height: 40 }, viewport)).toBe(true);
  expect(visibleHeight({ y: -50, height: 800 }, viewport)).toBe(true);
  expect(visibleHeight({ y: 90, height: 0 }, viewport)).toBe(false);
});

test("only visible receipt members count and sparse observations cannot jump over an unread message", () => {
  const seen = history();
  const last = nextReadBatch([page], new Set(["third", "unrelated"]), seen)!;
  expect(last.request).toEqual({ receipt: page.receipt, throughSeq: 0, messageIds: ["third"] });
  confirmReadBatch(seen, last);
  expect(nextReadBatch([page], new Set(["third"]), seen)).toBeUndefined();
  const previous = nextReadBatch([page], new Set(["first", "second"]), seen)!;
  expect(previous.request.throughSeq).toBe(3);
  confirmReadBatch(seen, previous);
  expect(seen.sequences.size).toBe(0);
});

test("a replacement receipt binds edits and status transitions to visible rows", () => {
  const seen = history();
  confirmReadBatch(seen, nextReadBatch([page], new Set(["first", "third"]), seen)!);
  const updated = { ...page, receipt: "updated", status: "resolved", items: [{ id: "first", seq: 1, revision: 3 }] };
  expect(nextReadBatch([page, updated], new Set(["third"]), seen)).toBeUndefined();
  const batch = nextReadBatch([page, updated], new Set(["first"]), seen)!;
  expect(batch.request).toEqual({ throughSeq: 1, receipt: "updated", messageIds: ["first"] });
  confirmReadBatch(seen, batch);
  expect(nextReadBatch([page, updated], new Set(["first", "third"]), seen)).toBeUndefined();
});

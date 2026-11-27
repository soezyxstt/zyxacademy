import { expect, test } from "bun:test";
import { pendingCelebrations } from "../../apps/mobile-native/features/student/community/celebration-policy";

test("acknowledge only previously presented events for this identity, and show up to three new ones", () => {
  const rank = (id: string) => ({ kind: "rank", rank: "camat", id });
  const history = [{ userId: "a", id: "read" }, { userId: "b", id: "first" }];
  const result = pendingCelebrations({ celebrations: [
    rank("read"), rank("first"), rank("first"), rank("second"), { kind: "badge", id: "bad", tier: 99 },
    rank("third"), rank("fourth"),
  ] }, history, "a");
  expect(result.display.map(e => e.id)).toEqual(["first", "second", "third"]);
  expect(result.acknowledge).toEqual(["read"]);
  expect(pendingCelebrations({ celebrations: [null, rank("")] }, history, "a")).toEqual({ display: [], acknowledge: [] });
});

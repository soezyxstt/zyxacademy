import { describe, expect, test } from "bun:test";
import { readShown, rememberShown, wasShown, SHOWN_LIMIT } from "../../lib/gamification/celebration-client-policy";

describe("celebration display history", () => {
  test("deduplicates within an account without leaking to another", () => {
    let history = rememberShown([], "one", "reward");
    history = rememberShown(history, "one", "reward");
    expect(history).toHaveLength(1);
    expect(wasShown(history, "one", "reward")).toBe(true);
    expect(wasShown(history, "two", "reward")).toBe(false);
  });
  test("bounds and tolerates invalid persisted data", () => {
    let history = [] as ReturnType<typeof readShown>;
    for (let i = 0; i < SHOWN_LIMIT + 5; i++) history = rememberShown(history, "one", String(i));
    expect(history).toHaveLength(SHOWN_LIMIT);
    expect(wasShown(history, "one", "0")).toBe(false);
    expect(readShown("broken")).toEqual([]);
    expect(readShown(JSON.stringify([null, { id: 1 }]))).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";

import { getGridColumnCount, getPaginationState } from "../../../apps/mobile-native/features/shared-ui/data-model";

describe("shared native grid sizing", () => {
  test("switches columns when the container can fit the minimum card width and gap", () => {
    expect(getGridColumnCount(348, 228, 12, 5)).toBe(1);
    expect(getGridColumnCount(467, 228, 12, 5)).toBe(1);
    expect(getGridColumnCount(468, 228, 12, 5)).toBe(2);
    expect(getGridColumnCount(736, 228, 12, 5)).toBe(3);
    expect(getGridColumnCount(1536, 228, 12, 5)).toBe(5);
  });
});

describe("shared native pagination targets", () => {
  test("offers only adjacent pages within the result set", () => {
    expect(getPaginationState(1, 3, false)).toEqual({ current: 1, count: 3, previous: null, next: 2 });
    expect(getPaginationState(2, 3, false)).toEqual({ current: 2, count: 3, previous: 1, next: 3 });
    expect(getPaginationState(3, 3, false)).toEqual({ current: 3, count: 3, previous: 2, next: null });
  });

  test("clamps the current page after the result set shrinks", () => {
    expect(getPaginationState(5, 2, false)).toEqual({ current: 2, count: 2, previous: 1, next: null });
    expect(getPaginationState(5, 0, false)).toEqual({ current: 0, count: 0, previous: null, next: null });
  });

  test("blocks both navigation targets during a pending request", () => {
    expect(getPaginationState(2, 3, true)).toEqual({ current: 2, count: 3, previous: null, next: null });
  });
});

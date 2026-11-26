import { describe, expect, test } from "bun:test";

import { getGridColumnCount, getPaginationState } from "../../../apps/mobile-native/features/shared-ui/data-model";

describe("shared native grid sizing", () => {
  test("matches each Student document grid container breakpoint", () => {
    expect(getGridColumnCount(348, 1)).toBe(1);
    expect(getGridColumnCount(463, 1)).toBe(1);
    expect(getGridColumnCount(464, 1)).toBe(2);
    expect(getGridColumnCount(703, 1)).toBe(2);
    expect(getGridColumnCount(704, 1)).toBe(3);
    expect(getGridColumnCount(943, 1)).toBe(3);
    expect(getGridColumnCount(944, 1)).toBe(4);
    expect(getGridColumnCount(1183, 1)).toBe(4);
    expect(getGridColumnCount(1184, 1)).toBe(5);
    expect(getGridColumnCount(1536, 1)).toBe(5);
  });

  test("scales the default breakpoints for larger text and honors the column cap", () => {
    expect(getGridColumnCount(695, 1.5)).toBe(1);
    expect(getGridColumnCount(696, 1.5)).toBe(2);
    expect(getGridColumnCount(1536, 1, { maxColumns: 2 })).toBe(2);
  });

  test("uses the minimum card width and gap when sizing is customized", () => {
    expect(getGridColumnCount(407, 1, { minItemWidth: 200, gap: 8 })).toBe(1);
    expect(getGridColumnCount(408, 1, { minItemWidth: 200, gap: 8 })).toBe(2);
    expect(getGridColumnCount(607, 1.5, { minItemWidth: 200, gap: 8 })).toBe(1);
    expect(getGridColumnCount(608, 1.5, { minItemWidth: 200, gap: 8 })).toBe(2);
    expect(getGridColumnCount(464, 1, { gap: 12 })).toBe(1);
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

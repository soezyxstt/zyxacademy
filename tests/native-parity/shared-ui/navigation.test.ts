import { expect, test } from "bun:test";

import { visibleNavigationTabs } from "../../../apps/mobile-native/features/shared-ui/navigation-model";

test("an exact fit retains all tabs without a More control", () => {
  expect(visibleNavigationTabs([82, 92, 84], 262, 76, 2)).toBe(3);
});

test("overflow reserves the More control and retains tabs in their original order", () => {
  expect(visibleNavigationTabs([82, 92, 84], 252, 76, 2)).toBe(1);
  expect(visibleNavigationTabs([82, 92, 84], 254, 76, 2)).toBe(2);
});

test("an oversized first tab uses More even if a later label is shorter", () => {
  expect(visibleNavigationTabs([180, 44], 160, 64, 2)).toBe(0);
});

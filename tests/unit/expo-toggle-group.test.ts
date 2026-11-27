import { expect, test } from "bun:test";

import { galleryCases } from "../../packages/ui-parity/gallery";
import { toggleGroupCases, toggleSelectionLabel } from "../../packages/ui-parity/toggle-group-cases";
import { toggleGroupSelection } from "../../packages/ui-primitives/toggle-group";

test("single selection replaces the active value and clears on a repeat press", () => {
  const current = Object.freeze(["calc"]);
  expect(toggleGroupSelection("single", current, "phys")).toEqual(["phys"]);
  expect(toggleGroupSelection("single", current, "calc")).toEqual([]);
  expect(toggleGroupSelection("single", current, "")).toBe(current);
  expect(current).toEqual(["calc"]);
});

test("multiple selection toggles only the pressed value and keeps independent items", () => {
  const current = Object.freeze(["calc", "chem"]);
  const next = toggleGroupSelection("multiple", current, "phys");
  expect(next).toEqual(["calc", "chem", "phys"]);
  expect(toggleGroupSelection("multiple", next, "calc")).toEqual(["chem", "phys"]);
  expect(current).toEqual(["calc", "chem"]);
});

test("the shared gallery publishes exactly three ToggleGroup cases", () => {
  expect(galleryCases.filter(item => item.component === "toggle-group").map(item => item.id)).toEqual(
    toggleGroupCases.map(item => item.id),
  );
  expect(toggleGroupCases).toHaveLength(3);
  expect(toggleSelectionLabel(["chem", "phys"])).toBe("Fisika, Kimia");
  expect(toggleSelectionLabel([])).toBe("Belum dipilih");
});
